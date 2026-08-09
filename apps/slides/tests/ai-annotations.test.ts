import { describe, expect, it } from 'vitest'
import type {
  GroupRenderNode,
  PlacedBox,
  RenderNode,
  RenderSlide,
  ShapeRenderNode,
} from '@genoffice/pptx-render'
import {
  annotationAnchor,
  buildSlideAnnotationsDisplayText,
  buildSlideAnnotationsPrompt,
  hitTestAnnotationTargets,
  hitTestAnnotationTargetsInBounds,
  referencedAnnotationSlides,
  resolveAnnotationBounds,
  type SlideAiAnnotation,
} from '../src/renderer/ai/annotations'

const box = (x: number, y: number, w: number, h: number, rotationDeg = 0): PlacedBox => ({
  x,
  y,
  w,
  h,
  rotationDeg,
  flipH: false,
  flipV: false,
  centerX: x + w / 2,
  centerY: y + h / 2,
})

const shape = (sourceId: string, bounds: PlacedBox, decoration = false): ShapeRenderNode => ({
  id: `r_${sourceId}`,
  sourceId,
  type: 'shape',
  box: bounds,
  fill: { kind: 'solid', color: '#ffffff' },
  ...(decoration ? { decoration: true } : {}),
})

const group = (sourceId: string, bounds: PlacedBox, children: RenderNode[]): GroupRenderNode => ({
  id: `r_${sourceId}`,
  sourceId,
  type: 'group',
  box: bounds,
  children,
})

const slideOf = (nodes: RenderNode[]): RenderSlide => ({
  widthPx: 1280,
  heightPx: 720,
  scale: 1,
  background: { kind: 'solid', color: '#ffffff' },
  nodes,
})

const annotation = (overrides: Partial<SlideAiAnnotation> = {}): SlideAiAnnotation => ({
  id: 'annotation-1',
  slideIndex: 0,
  point: { x: 20, y: 20 },
  objectIds: [],
  comment: 'Move this closer to the title',
  ...overrides,
})

describe('hitTestAnnotationTargets', () => {
  it('returns the entire current multi-selection when the point hits any selected object', () => {
    const slide = slideOf([
      shape('first', box(0, 0, 40, 40)),
      shape('second', box(100, 100, 40, 40)),
      shape('cover', box(0, 0, 40, 40)),
    ])

    expect(hitTestAnnotationTargets(slide, { x: 20, y: 20 }, ['first', 'second'])).toEqual([
      'first',
      'second',
    ])
  })

  it('chooses the topmost editable object and ignores decorations', () => {
    const slide = slideOf([
      shape('bottom', box(0, 0, 100, 100)),
      shape('top', box(0, 0, 100, 100)),
      shape('locked-decoration', box(0, 0, 100, 100), true),
    ])

    expect(hitTestAnnotationTargets(slide, { x: 50, y: 50 }, [])).toEqual(['top'])
    expect(hitTestAnnotationTargets(slide, { x: 200, y: 200 }, [])).toEqual([])
  })

  it('hit-tests rotated boxes around their center', () => {
    const slide = slideOf([shape('rotated', box(0, 0, 100, 40, 90))])

    expect(hitTestAnnotationTargets(slide, { x: 50, y: 65 }, [])).toEqual(['rotated'])
    expect(hitTestAnnotationTargets(slide, { x: 95, y: 20 }, [])).toEqual([])
  })

  it('recurses into a rotated group and targets its directly editable child', () => {
    const slide = slideOf([
      group('outer', box(100, 100, 100, 100, 90), [shape('child', box(10, 20, 20, 10))]),
    ])

    expect(hitTestAnnotationTargets(slide, { x: 175, y: 120 }, [])).toEqual(['child'])
  })
})

describe('hitTestAnnotationTargetsInBounds', () => {
  it('targets every editable object crossed by a dragged region', () => {
    const slide = slideOf([
      shape('first', box(10, 10, 40, 40)),
      shape('outside', box(300, 300, 40, 40)),
      shape('second', box(80, 70, 50, 50)),
      shape('locked-decoration', box(20, 20, 30, 30), true),
    ])

    expect(hitTestAnnotationTargetsInBounds(slide, { x: 30, y: 20, w: 90, h: 90 })).toEqual([
      'first',
      'second',
    ])
  })
})

describe('annotation geometry', () => {
  it('returns the axis-aligned bounds of a rotated target', () => {
    const slide = slideOf([shape('rotated', box(10, 20, 100, 40, 90))])
    const bounds = resolveAnnotationBounds(
      slide,
      annotation({ objectIds: ['rotated'], point: { x: 60, y: 40 } }),
    )

    expect(bounds.x).toBeCloseTo(40)
    expect(bounds.y).toBeCloseTo(-10)
    expect(bounds.w).toBeCloseTo(40)
    expect(bounds.h).toBeCloseTo(100)
  })

  it('resolves nested group coordinates and anchors to the union top-right', () => {
    const slide = slideOf([
      group('outer', box(100, 50, 200, 100), [shape('child', box(20, 10, 40, 30))]),
      shape('other', box(400, 200, 50, 60)),
    ])
    const item = annotation({ objectIds: ['child', 'other'] })

    expect(resolveAnnotationBounds(slide, item)).toEqual({ x: 120, y: 60, w: 330, h: 200 })
    expect(annotationAnchor(slide, item)).toEqual({ x: 450, y: 60 })
  })

  it('keeps blank-canvas comments at their clicked point', () => {
    const slide = slideOf([])
    const item = annotation({ point: { x: 321, y: 123 } })

    expect(resolveAnnotationBounds(slide, item)).toEqual({ x: 321, y: 123, w: 0, h: 0 })
    expect(annotationAnchor(slide, item)).toEqual({ x: 321, y: 123 })
  })

  it('keeps an explicitly dragged region visible even when it targets objects', () => {
    const slide = slideOf([shape('title', box(10, 20, 300, 80))])
    const item = annotation({
      point: { x: 180, y: 80 },
      bounds: { x: 20, y: 30, w: 320, h: 100 },
      objectIds: ['title'],
    })

    expect(resolveAnnotationBounds(slide, item)).toEqual({ x: 20, y: 30, w: 320, h: 100 })
    expect(annotationAnchor(slide, item)).toEqual({ x: 340, y: 30 })
  })
})

describe('annotation prompt', () => {
  it('returns sorted unique referenced slide indexes', () => {
    expect(
      referencedAnnotationSlides([
        annotation({ slideIndex: 3 }),
        annotation({ slideIndex: 1 }),
        annotation({ slideIndex: 3 }),
        annotation({ slideIndex: -1 }),
      ]),
    ).toEqual([1, 3])
  })

  it('serializes every annotation location and the safe edit workflow', () => {
    const slides = [slideOf([shape('title', box(10, 20, 300, 80))]), slideOf([])]
    const prompt = buildSlideAnnotationsPrompt(
      [
        annotation({ objectIds: ['title'], comment: 'Increase the title contrast' }),
        annotation({
          id: 'annotation-2',
          slideIndex: 1,
          point: { x: 600, y: 360 },
          bounds: { x: 500, y: 300, w: 200, h: 120 },
          comment: 'Balance this empty area',
        }),
      ],
      slides,
    )

    expect(prompt).toContain('slideIndex=0; page=1')
    expect(prompt).toContain('objectIds=["title"]')
    expect(prompt).toContain('point={"x":20,"y":20}')
    expect(prompt).toContain('bounds={"x":10,"y":20,"w":300,"h":80}')
    expect(prompt).toContain('comment="Increase the title contrast"')
    expect(prompt).toContain('slideIndex=1; page=2')
    expect(prompt).toContain('objectIds=[]')
    expect(prompt).toContain('bounds={"x":500,"y":300,"w":200,"h":120}')
    expect(prompt).toContain('comment="Balance this empty area"')
    expect(prompt).toContain('Modify only the annotated targets')
    expect(prompt).toContain('objectIds is empty')
    expect(prompt).toContain('page-region anchor')
    expect(prompt).toContain('call read_slide')
    expect(prompt).toContain('current presentation revision')
    expect(prompt).toContain('fresh read_slide inventory')
    expect(prompt).toContain('verify the affected slides')
  })

  it('shows the actual annotation comments in concise localized chat copy', () => {
    expect(
      buildSlideAnnotationsDisplayText(
        [annotation({ slideIndex: 3, comment: '改成中文' })],
        (pageNumber) => `第 ${pageNumber} 页`,
      ),
    ).toBe('第 4 页 · 改成中文')

    expect(
      buildSlideAnnotationsDisplayText(
        [
          annotation({ slideIndex: 0, comment: 'Increase contrast' }),
          annotation({ id: 'annotation-2', slideIndex: 2, comment: 'Align the chart' }),
        ],
        (pageNumber) => `Slide ${pageNumber}`,
      ),
    ).toBe('1. Slide 1 · Increase contrast\n2. Slide 3 · Align the chart')
  })
})
