import type {
  RenderNode,
  RenderSlide,
  RenderTextLayout,
  ShapeRenderNode,
  TextLine,
} from '@genoffice/pptx-render'

export interface ParagraphAuditInfo {
  index: number
  text: string
  nativeBullet?: string
  level: number
  align: 'left' | 'center' | 'right' | 'justify'
  marginLeftPx: number
  indentPx: number
  lineHeightPx: number
  fontFamily?: string
  fontSizePt?: number
  color?: string
}

export interface ElementParagraphAuditInfo {
  elementId: string
  paragraphs: ParagraphAuditInfo[]
}

const BULLET_MARKER_RE = /^[\s\u00a0]*[•●▪◦‣⁃∙·]/u
const NUMBER_MARKER_RE = /^[\s\u00a0]*(?:\d+|[a-z]|[ivxlcdm]+)[.)][\s\u00a0]+/iu
const MAX_FORMAT_ISSUES = 12

function groupLines(lines: TextLine[]): TextLine[][] {
  const groups: TextLine[][] = []
  for (const line of lines) {
    if (line.paraStart === false && groups.length > 0) groups[groups.length - 1]!.push(line)
    else groups.push([line])
  }
  return groups
}

function paragraphText(lines: TextLine[]): string {
  let text = ''
  lines.forEach((line, index) => {
    if (index > 0 && lines[index - 1]!.trailingSpace) text += ' '
    const runs = [...line.runs]
      .filter((run) => !run.isBullet)
      .sort(
        (a, b) =>
          (a.logicalOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.logicalOrder ?? Number.MAX_SAFE_INTEGER),
      )
    text += runs.map((run) => run.text).join('')
    if (line.softBreakAfter != null) text += '\n'
  })
  return text
}

function paragraphInfo(lines: TextLine[], index: number): ParagraphAuditInfo {
  const first = lines[0]!
  const bullet = first.runs.find((run) => run.isBullet)?.text
  const bodyRuns = lines.flatMap((line) => line.runs).filter((run) => !run.isBullet && run.text)
  const styleRun = bodyRuns.find((run) => run.text.trim()) ?? bodyRuns[0]
  return {
    index,
    text: paragraphText(lines),
    ...(bullet ? { nativeBullet: bullet } : {}),
    level: first.level ?? 0,
    align: first.align ?? 'left',
    marginLeftPx: Math.round(first.marLPx ?? 0),
    indentPx: Math.round(first.indentPx ?? 0),
    lineHeightPx: Math.round(first.height),
    ...(styleRun?.fontFamily ? { fontFamily: styleRun.fontFamily } : {}),
    ...(styleRun?.fontSizePx
      ? { fontSizePt: Math.round(((styleRun.fontSizePx * 72) / 96) * 10) / 10 }
      : {}),
    ...(styleRun?.color ? { color: styleRun.color } : {}),
  }
}

export function paragraphInfoFromText(text: RenderTextLayout | undefined): ParagraphAuditInfo[] {
  if (!text) return []
  return groupLines(text.lines).map(paragraphInfo)
}

export function plainTextFromText(text: RenderTextLayout | undefined): string {
  return paragraphInfoFromText(text)
    .map((paragraph) => paragraph.text)
    .join('\n')
}

export function collectSlideParagraphInfo(slide: RenderSlide): ElementParagraphAuditInfo[] {
  const out: ElementParagraphAuditInfo[] = []
  const visit = (nodes: RenderNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'shape' || node.type === 'text') {
        const paragraphs = paragraphInfoFromText((node as ShapeRenderNode).text)
        if (paragraphs.length > 0) out.push({ elementId: node.sourceId, paragraphs })
      } else if (node.type === 'group') {
        visit(node.children)
      }
    }
  }
  visit(slide.nodes)
  return out
}

export function formatElementParagraphInfo(paragraphs: ParagraphAuditInfo[]): string {
  if (paragraphs.length === 0) return ''
  const lines = paragraphs.map((paragraph) => {
    const style = [
      paragraph.nativeBullet ? `nativeBullet=${JSON.stringify(paragraph.nativeBullet)}` : 'bullet=none',
      `level=${paragraph.level}`,
      `align=${paragraph.align}`,
      `marginLeft=${paragraph.marginLeftPx}px`,
      `indent=${paragraph.indentPx}px`,
      `lineHeight=${paragraph.lineHeightPx}px`,
      paragraph.fontFamily ? `font=${JSON.stringify(paragraph.fontFamily)}` : '',
      paragraph.fontSizePt != null ? `fontSize=${paragraph.fontSizePt}pt` : '',
      paragraph.color ? `color=${paragraph.color}` : '',
    ].filter(Boolean)
    return `  p${paragraph.index + 1} ${style.join(' ')} text=${JSON.stringify(paragraph.text)}`
  })
  return `Paragraph data:\n${lines.join('\n')}`
}

function looksNumbered(marker: string): boolean {
  return /^(?:\d+|[a-z]|[ivxlcdm]+)[.)]$/iu.test(marker.trim())
}

function hasDuplicateMarker(paragraph: ParagraphAuditInfo): boolean {
  const marker = paragraph.nativeBullet
  if (!marker) return false
  const text = paragraph.text.trimStart()
  if (text.startsWith(marker)) return true
  return looksNumbered(marker) ? NUMBER_MARKER_RE.test(text) : BULLET_MARKER_RE.test(text)
}

/** Deterministic paragraph-format checks; no screenshot or model call is involved. */
export function auditSlideFormatting(slide: RenderSlide): string[] {
  const issues: string[] = []
  for (const element of collectSlideParagraphInfo(slide)) {
    for (const paragraph of element.paragraphs) {
      if (hasDuplicateMarker(paragraph)) {
        issues.push(
          `Duplicate bullet marker: ${element.elementId} paragraph ${paragraph.index + 1} has native bullet ${JSON.stringify(paragraph.nativeBullet)} and text ${JSON.stringify(paragraph.text)} also starts with a bullet marker`,
        )
      }
    }

    const byLevel = new Map<number, ParagraphAuditInfo[]>()
    for (const paragraph of element.paragraphs) {
      if (!paragraph.nativeBullet) continue
      const peers = byLevel.get(paragraph.level) ?? []
      peers.push(paragraph)
      byLevel.set(paragraph.level, peers)
    }
    for (const [level, peers] of byLevel) {
      if (peers.length < 2) continue
      const indents = new Set(peers.map((p) => `${p.marginLeftPx}/${p.indentPx}`))
      if (indents.size > 1) {
        issues.push(
          `Bullet indentation mismatch: ${element.elementId} level ${level} paragraphs use ${[...indents].map((v) => `${v}px`).join(', ')} (marginLeft/indent)`,
        )
      }
      const textStyles = new Set(
        peers.map((p) => `${p.fontFamily ?? '(unknown)'}/${p.fontSizePt ?? '(unknown)'}pt`),
      )
      if (textStyles.size > 1) {
        issues.push(
          `Bullet text style mismatch: ${element.elementId} level ${level} paragraphs use ${[...textStyles].join(', ')}`,
        )
      }
    }
    if (issues.length >= MAX_FORMAT_ISSUES) break
  }
  return issues.slice(0, MAX_FORMAT_ISSUES)
}
