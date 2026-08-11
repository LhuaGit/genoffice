import { describe, expect, it } from 'vitest'
import type { PlacedBox, RenderSlide, ShapeRenderNode, TextLine } from '@genoffice/pptx-render'
import {
  auditSlideFormatting,
  collectSlideParagraphInfo,
  plainTextFromText,
} from '../src/renderer/ai/format-audit'

const box: PlacedBox = {
  x: 100,
  y: 100,
  w: 500,
  h: 240,
  rotationDeg: 0,
  flipH: false,
  flipV: false,
  centerX: 350,
  centerY: 220,
}

function line(
  text: string,
  options: {
    bullet?: string
    level?: number
    marginLeftPx?: number
    indentPx?: number
    fontFamily?: string
    fontSizePx?: number
  } = {},
): TextLine {
  return {
    runs: [
      ...(options.bullet
        ? [
            {
              text: options.bullet,
              x: 0,
              baselineY: 20,
              fontFamily: options.fontFamily ?? 'Arial',
              fontSizePx: options.fontSizePx ?? 24,
              color: '#000000',
              bold: false,
              italic: false,
              underline: false,
              widthPx: 12,
              isBullet: true,
            },
          ]
        : []),
      {
        text,
        x: 24,
        baselineY: 20,
        fontFamily: options.fontFamily ?? 'Arial',
        fontSizePx: options.fontSizePx ?? 24,
        color: '#000000',
        bold: false,
        italic: false,
        underline: false,
        widthPx: text.length * 12,
      },
    ],
    top: 0,
    height: 28,
    paraStart: true,
    level: options.level ?? 0,
    marLPx: options.marginLeftPx ?? 36,
    indentPx: options.indentPx ?? -18,
  }
}

function slideOf(lines: TextLine[]): RenderSlide {
  const node: ShapeRenderNode = {
    id: 'body',
    sourceId: 'body',
    type: 'shape',
    box,
    fill: { kind: 'none' },
    text: {
      lines,
      insets: { l: 8, t: 4, r: 8, b: 4 },
      anchor: 'top',
      fontScale: 1,
      wrap: true,
      contentHeight: lines.length * 28,
    },
  }
  return {
    widthPx: 1280,
    heightPx: 720,
    scale: 1,
    background: { kind: 'solid', color: '#FFFFFF' },
    nodes: [node],
  }
}

describe('paragraph format inventory', () => {
  it('separates the native bullet glyph from paragraph text', () => {
    const slide = slideOf([line('财务业绩', { bullet: '•' })])
    const info = collectSlideParagraphInfo(slide)[0]!.paragraphs[0]!
    expect(info).toMatchObject({ text: '财务业绩', nativeBullet: '•', level: 0 })
    expect(plainTextFromText((slide.nodes[0] as ShapeRenderNode).text)).toBe('财务业绩')
  })
})

describe('auditSlideFormatting', () => {
  it('detects a literal bullet duplicated inside native-bulleted text', () => {
    const issues = auditSlideFormatting(slideOf([line('• 财务业绩', { bullet: '•' })]))
    expect(issues.some((issue) => issue.includes('Duplicate bullet marker'))).toBe(true)
  })

  it('accepts a consistently formatted native bullet list', () => {
    const issues = auditSlideFormatting(
      slideOf([
        line('财务业绩', { bullet: '•' }),
        line('产品更新', { bullet: '•' }),
        line('路线图', { bullet: '•' }),
      ]),
    )
    expect(issues).toEqual([])
  })

  it('detects inconsistent indentation and text style at the same bullet level', () => {
    const issues = auditSlideFormatting(
      slideOf([
        line('财务业绩', { bullet: '•', marginLeftPx: 36, fontSizePx: 24 }),
        line('产品更新', { bullet: '•', marginLeftPx: 52, fontSizePx: 20 }),
      ]),
    )
    expect(issues.some((issue) => issue.includes('Bullet indentation mismatch'))).toBe(true)
    expect(issues.some((issue) => issue.includes('Bullet text style mismatch'))).toBe(true)
  })
})
