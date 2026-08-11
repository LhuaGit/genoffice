/**
 * Post-generation layout QC helpers:
 *  - generatedPageRange / mergeQcPages: which pages a landing marks for QC (incl. insert_at shifting)
 *  - createSlideFixSkill: tool allowlist wraps the full slides skill without losing the executor
 */
import { describe, it, expect } from 'vitest'
import {
  generatedPageRange,
  mergeQcPages,
  createSlideFixSkill,
  isQcEnabled,
  parseSlideVisualReview,
  QC_MAX_VISUAL_ROUNDS,
  qcSlidePage,
} from '../src/renderer/ai/slide-qc'
import type { DeckAccess } from '../src/renderer/ai/slides-skill'
import type { RenderSlide, ShapeRenderNode } from '@genoffice/pptx-render'

const access: DeckAccess = {
  getSlides: () => [],
  getCurrent: () => 0,
  getSelectedIds: () => [],
  applySlide: () => {},
  applyDeck: () => {},
  fitWidthPx: 1280,
}

describe('generatedPageRange', () => {
  it('replace covers the whole deck', () => {
    expect(generatedPageRange('replace', { pages: 3 })).toEqual([0, 1, 2])
  })

  it('append covers only the new tail', () => {
    expect(generatedPageRange('append', { pages: 5, appendedFrom: 3 })).toEqual([3, 4])
  })

  it('replace_at / insert_at cover the single touched page', () => {
    expect(generatedPageRange('replace_at', { pages: 5, insertedIndex: 2 })).toEqual([2])
    expect(generatedPageRange('insert_at', { pages: 5, insertedIndex: 0 })).toEqual([0])
  })

  it('missing insertedIndex yields nothing', () => {
    expect(generatedPageRange('insert_at', { pages: 5 })).toEqual([])
  })
})

describe('mergeQcPages', () => {
  it('replace discards earlier pendings', () => {
    expect(mergeQcPages([7, 8], 'replace', { pages: 2 })).toEqual([0, 1])
  })

  it('append unions and dedupes', () => {
    expect(mergeQcPages([1, 3], 'append', { pages: 5, appendedFrom: 3 })).toEqual([1, 3, 4])
  })

  it('insert_at shifts pendings at/after the insertion point', () => {
    expect(mergeQcPages([1, 3], 'insert_at', { pages: 5, insertedIndex: 2 })).toEqual([1, 2, 4])
  })

  it('replace_at adds the page without shifting', () => {
    expect(mergeQcPages([1], 'replace_at', { pages: 5, insertedIndex: 3 })).toEqual([1, 3])
  })
})

describe('createSlideFixSkill', () => {
  it('exposes only read_slide and execute_slide_script', () => {
    const skill = createSlideFixSkill(access)
    expect(skill.tools.map((t) => t.name).sort()).toEqual(['execute_slide_script', 'read_slide'])
  })

  it('delegates execution to the slides executor (read_slide works)', async () => {
    const one: DeckAccess = {
      ...access,
      getSlides: () => [
        {
          widthPx: 1280,
          heightPx: 720,
          nodes: [],
        } as never,
      ],
    }
    const skill = createSlideFixSkill(one)
    const r = await skill.executeTool({ id: 't1', name: 'read_slide', input: { slideIndex: 0 } })
    expect(r.isError).toBeFalsy()
    expect(r.output).toContain('Canvas 1280×720px')
  })
})

describe('qcSlidePage Pi runtime', () => {
  it('reviews the screenshot before sending paragraph findings to the fixer', async () => {
    const body: ShapeRenderNode = {
      id: 'body',
      sourceId: 'body',
      type: 'shape',
      box: {
        x: 80,
        y: 100,
        w: 500,
        h: 200,
        rotationDeg: 0,
        flipH: false,
        flipV: false,
        centerX: 330,
        centerY: 200,
      },
      fill: { kind: 'none' },
      text: {
        lines: [
          {
            runs: [
              {
                text: '•',
                x: 0,
                baselineY: 20,
                fontFamily: 'Arial',
                fontSizePx: 24,
                color: '#000000',
                bold: false,
                italic: false,
                underline: false,
                widthPx: 12,
                isBullet: true,
              },
              {
                text: '• 财务业绩',
                x: 24,
                baselineY: 20,
                fontFamily: 'Arial',
                fontSizePx: 24,
                color: '#000000',
                bold: false,
                italic: false,
                underline: false,
                widthPx: 120,
              },
            ],
            top: 0,
            height: 28,
            paraStart: true,
            marLPx: 36,
            indentPx: -18,
          },
        ],
        insets: { l: 8, t: 4, r: 8, b: 4 },
        anchor: 'top',
        fontScale: 1,
        wrap: true,
        contentHeight: 28,
      },
    }
    const slide: RenderSlide = {
      widthPx: 1280,
      heightPx: 720,
      scale: 1,
      background: { kind: 'solid', color: '#FFFFFF' },
      nodes: [body],
    }
    const one: DeckAccess = { ...access, getSlides: () => [slide] }
    let eventHandler: ((event: any) => void) | undefined
    const startRequests: any[] = []
    Object.defineProperty(window, 'piAgent', {
      configurable: true,
      value: {
        start: async (request: any) => {
          startRequests.push(request)
          const text =
            startRequests.length === 1
              ? '{"pass":true,"score":96,"summary":"clean","issues":[]}'
              : 'OK'
          queueMicrotask(() =>
            eventHandler?.({
              sessionId: request.sessionId,
              type: 'done',
              text,
              cancelled: false,
            }),
          )
        },
        cancel: async () => {},
        reset: async () => {},
        sendToolResult: () => {},
        onEvent: (handler: (event: any) => void) => {
          eventHandler = handler
          return () => {}
        },
        onToolCall: () => () => {},
        onToolCancel: () => () => {},
      },
    })

    const result = await qcSlidePage({
      access: one,
      getSettings: () => ({}) as never,
      pageIndex: 0,
      screenshot: { base64: 'page-png', mime: 'image/png' },
    })

    expect(result.preIssues).toBe(1)
    expect(result.reply).toBe('OK')
    expect(startRequests).toHaveLength(2)
    expect(startRequests[0].images).toEqual([{ base64: 'page-png', mime: 'image/png' }])
    expect(startRequests[0].systemPrompt).toContain('visual acceptance reviewer')
    expect(startRequests[1].images).toEqual([{ base64: 'page-png', mime: 'image/png' }])
    expect(startRequests[1].systemPrompt).toContain('slide QA fixer')
    expect(startRequests[1].instruction).toContain('nativeBullet="•"')
    expect(startRequests[1].instruction).toContain('Duplicate bullet marker')
  })

  it('fails closed when the renderer cannot supply a screenshot', async () => {
    const one: DeckAccess = {
      ...access,
      getSlides: () => [{ widthPx: 1280, heightPx: 720, nodes: [] } as never],
    }
    const result = await qcSlidePage({
      access: one,
      getSettings: () => ({}) as never,
      pageIndex: 0,
      screenshot: null,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('requires a rendered slide screenshot')
  })

  it('captures the edited slide and sends it through a second visual review', async () => {
    const box = {
      id: 'box',
      sourceId: 'box',
      type: 'shape',
      box: {
        x: 100,
        y: 100,
        w: 400,
        h: 200,
        rotationDeg: 0,
        flipH: false,
        flipV: false,
        centerX: 300,
        centerY: 200,
      },
      fill: { kind: 'solid', color: '#EEEEEE' },
    } as unknown as ShapeRenderNode
    let currentSlide = {
      widthPx: 1280,
      heightPx: 720,
      scale: 1,
      background: { kind: 'solid', color: '#FFFFFF' },
      nodes: [box],
    } as RenderSlide
    const one: DeckAccess = {
      ...access,
      getSlides: () => [currentSlide],
      applySlide: (_index, updated) => {
        currentSlide = updated
      },
    }
    let eventHandler: ((event: any) => void) | undefined
    let toolHandler: ((request: any) => void) | undefined
    const startRequests: any[] = []
    Object.defineProperty(window, 'slidesApi', {
      configurable: true,
      value: {
        beginHistoryBatch: async () => false,
        editFill: async () => currentSlide,
      },
    })
    Object.defineProperty(window, 'piAgent', {
      configurable: true,
      value: {
        start: async (request: any) => {
          startRequests.push(request)
          if (startRequests.length === 1) {
            queueMicrotask(() =>
              eventHandler?.({
                sessionId: request.sessionId,
                type: 'done',
                text: '{"pass":false,"score":55,"summary":"empty","issues":[{"severity":"major","code":"empty_container","description":"The main card looks empty","evidence":"center","suggestedFix":"make the content container visible"}]}',
                cancelled: false,
              }),
            )
          } else if (startRequests.length === 2) {
            queueMicrotask(() =>
              toolHandler?.({
                sessionId: request.sessionId,
                call: {
                  id: 'fix-1',
                  name: 'execute_slide_script',
                  input: { slideIndex: 0, code: "setFill('box', '#FFFFFF')" },
                },
              }),
            )
          } else {
            queueMicrotask(() =>
              eventHandler?.({
                sessionId: request.sessionId,
                type: 'done',
                text: '{"pass":true,"score":94,"summary":"clean","issues":[]}',
                cancelled: false,
              }),
            )
          }
        },
        cancel: async () => {},
        reset: async () => {},
        sendToolResult: (response: any) => {
          queueMicrotask(() =>
            eventHandler?.({
              sessionId: response.sessionId,
              type: 'done',
              text: 'Adjusted the empty content container.',
              cancelled: false,
            }),
          )
        },
        onEvent: (handler: (event: any) => void) => {
          eventHandler = handler
          return () => {}
        },
        onToolCall: (handler: (request: any) => void) => {
          toolHandler = handler
          return () => {}
        },
        onToolCancel: () => () => {},
      },
    })
    let recaptures = 0

    const result = await qcSlidePage({
      access: one,
      getSettings: () => ({}) as never,
      pageIndex: 0,
      screenshot: { base64: 'before-png', mime: 'image/png' },
      captureScreenshot: async () => {
        recaptures += 1
        return { base64: 'after-png', mime: 'image/png' }
      },
    })

    expect(result.edited).toBe(true)
    expect(result.visualPassed).toBe(true)
    expect(result.preVisualIssues).toBe(1)
    expect(result.postVisualIssues).toBe(0)
    expect(result.preVisualScore).toBe(55)
    expect(result.postVisualScore).toBe(94)
    expect(result.visualRounds).toBe(2)
    expect(recaptures).toBe(1)
    expect(startRequests).toHaveLength(3)
    expect(startRequests[2].images).toEqual([{ base64: 'after-png', mime: 'image/png' }])
  })

  it('stops after three screenshot reviews even when visual defects remain', async () => {
    const box = {
      id: 'box',
      sourceId: 'box',
      type: 'shape',
      box: {
        x: 100,
        y: 100,
        w: 400,
        h: 200,
        rotationDeg: 0,
        flipH: false,
        flipV: false,
        centerX: 300,
        centerY: 200,
      },
      fill: { kind: 'solid', color: '#EEEEEE' },
    } as unknown as ShapeRenderNode
    let currentSlide = {
      widthPx: 1280,
      heightPx: 720,
      scale: 1,
      background: { kind: 'solid', color: '#FFFFFF' },
      nodes: [box],
    } as RenderSlide
    const one: DeckAccess = {
      ...access,
      getSlides: () => [currentSlide],
      applySlide: (_index, updated) => {
        currentSlide = updated
      },
    }
    let eventHandler: ((event: any) => void) | undefined
    let toolHandler: ((request: any) => void) | undefined
    const startRequests: any[] = []
    Object.defineProperty(window, 'slidesApi', {
      configurable: true,
      value: {
        beginHistoryBatch: async () => false,
        editFill: async () => currentSlide,
      },
    })
    Object.defineProperty(window, 'piAgent', {
      configurable: true,
      value: {
        start: async (request: any) => {
          startRequests.push(request)
          if (startRequests.length % 2 === 1) {
            queueMicrotask(() =>
              eventHandler?.({
                sessionId: request.sessionId,
                type: 'done',
                text: '{"pass":false,"score":50,"summary":"still wrong","issues":[{"severity":"major","code":"visual_defect","description":"The slide still looks incomplete","evidence":"main region","suggestedFix":"adjust the existing container"}]}',
                cancelled: false,
              }),
            )
          } else {
            queueMicrotask(() =>
              toolHandler?.({
                sessionId: request.sessionId,
                call: {
                  id: `fix-${startRequests.length}`,
                  name: 'execute_slide_script',
                  input: { slideIndex: 0, code: "setFill('box', '#FFFFFF')" },
                },
              }),
            )
          }
        },
        cancel: async () => {},
        reset: async () => {},
        sendToolResult: (response: any) => {
          queueMicrotask(() =>
            eventHandler?.({
              sessionId: response.sessionId,
              type: 'done',
              text: 'Adjusted the existing container.',
              cancelled: false,
            }),
          )
        },
        onEvent: (handler: (event: any) => void) => {
          eventHandler = handler
          return () => {}
        },
        onToolCall: (handler: (request: any) => void) => {
          toolHandler = handler
          return () => {}
        },
        onToolCancel: () => () => {},
      },
    })
    let recaptures = 0

    const result = await qcSlidePage({
      access: one,
      getSettings: () => ({}) as never,
      pageIndex: 0,
      screenshot: { base64: 'round-1', mime: 'image/png' },
      captureScreenshot: async () => {
        recaptures += 1
        return { base64: `round-${recaptures + 1}`, mime: 'image/png' }
      },
    })

    expect(result.visualRounds).toBe(QC_MAX_VISUAL_ROUNDS)
    expect(result.visualPassed).toBe(false)
    expect(result.edited).toBe(true)
    expect(recaptures).toBe(2)
    // review/fix/review/fix/review; there is no third unverified fix call.
    expect(startRequests).toHaveLength(5)
  })
})

describe('parseSlideVisualReview', () => {
  it('normalizes empty-container findings and never passes with an issue', () => {
    const review = parseSlideVisualReview(`Here is the result:
      {"pass":true,"score":72,"summary":"content missing","issues":[{
        "severity":"blocking",
        "code":"empty_repeated_containers",
        "description":"Six comparison rows are empty",
        "evidence":"Both columns below the headers",
        "suggestedFix":"Restore the comparison copy from the brief"
      }]}`)

    expect(review.pass).toBe(false)
    expect(review.score).toBe(72)
    expect(review.issues).toEqual([
      expect.objectContaining({
        severity: 'blocking',
        code: 'empty_repeated_containers',
      }),
    ])
  })
})

describe('isQcEnabled', () => {
  it("localStorage 'ai-slides-qc'='0' is the kill switch", () => {
    const previous = Object.getOwnPropertyDescriptor(window, 'localStorage')
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    })
    try {
      window.localStorage.removeItem('ai-slides-qc')
      expect(isQcEnabled()).toBe(true)
      window.localStorage.setItem('ai-slides-qc', '0')
      expect(isQcEnabled()).toBe(false)
      window.localStorage.removeItem('ai-slides-qc')
    } finally {
      if (previous) Object.defineProperty(window, 'localStorage', previous)
      else Reflect.deleteProperty(window, 'localStorage')
    }
  })
})
