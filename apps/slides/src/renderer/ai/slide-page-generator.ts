import type { LocalSlideElement, LocalSlideSpec } from '@genoffice/pptx-engine'
import { extractJsonObject } from './outline-json'

export interface SlidePageRequest {
  pageIndex: number
  totalPages: number
  coreHook: string
  style: string
  title: string
  brief: string
  layout: string
  images: string[]
  context?: string
  topic?: string
  canvasW: number
  canvasH: number
  signal?: AbortSignal
}

/**
 * The semantic intent retained after a generated page lands. Visual QC uses this
 * to distinguish intentional whitespace from missing copy and empty placeholders.
 */
export interface SlideGenerationContext {
  title: string
  brief: string
  layout: string
  coreHook?: string
  topic?: string
}

export interface SlidePageResult {
  ok: boolean
  /** A generated one-page PPTX marker accepted by the deck landing pipeline. */
  page?: string
  error?: string
}

/** Standard seam used by generate_deck and regenerate_slide. Adapters may use a
 * local renderer or a remote page generator; callers only see page generation. */
export interface SlidePageGenerator {
  readonly mode: 'local' | 'cloud'
  isAvailable(): Promise<boolean>
  generate(request: SlidePageRequest): Promise<SlidePageResult>
}

export interface LocalSlidePageGeneratorDependencies {
  complete(args: {
    system: string
    user: string
    signal?: AbortSignal
    maxTokens?: number
  }): Promise<{ ok: boolean; text?: string; error?: string }>
  render(args: {
    spec: LocalSlideSpec
    width: number
    height: number
  }): Promise<{ ok: boolean; marker?: string; error?: string }>
}

const number = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function normalizeLocalSlideSpec(
  value: unknown,
  width: number,
  height: number,
): LocalSlideSpec | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!Array.isArray(raw.elements)) return null
  const elements: LocalSlideElement[] = []
  for (const item of raw.elements.slice(0, 80)) {
    if (!item || typeof item !== 'object') continue
    const element = item as Record<string, unknown>
    const type = text(element.type)
    if (!['text', 'shape', 'line', 'image'].includes(type)) continue
    const common = {
      x: number(element.x, 0),
      y: number(element.y, 0),
      w: Math.max(1, number(element.w, width / 4)),
      h: Math.max(1, number(element.h, height / 6)),
    }
    if (type === 'text') {
      elements.push({
        type,
        ...common,
        text: text(element.text),
        fontSize: number(element.fontSize, 24),
        fontFace: text(element.fontFace) || 'Arial',
        color: text(element.color) || '#1F2937',
        bold: element.bold === true,
        italic: element.italic === true,
        align: element.align === 'center' || element.align === 'right' ? element.align : 'left',
        valign: element.valign === 'mid' || element.valign === 'bottom' ? element.valign : 'top',
      })
    } else if (type === 'shape') {
      elements.push({
        type,
        ...common,
        shape:
          element.shape === 'ellipse' || element.shape === 'roundRect' ? element.shape : 'rect',
        fill: text(element.fill) || '#F3F4F6',
        transparency: number(element.transparency, 0),
        line: text(element.line),
        lineWidth: number(element.lineWidth, 0),
      })
    } else if (type === 'line') {
      elements.push({
        type,
        ...common,
        color: text(element.color) || '#94A3B8',
        width: number(element.width, 1),
      })
    } else {
      const url = text(element.url)
      if (url) elements.push({ type: 'image', ...common, url })
    }
  }
  if (elements.length === 0) return null
  return { background: text(raw.background) || '#FFFFFF', elements }
}

export function createLocalSlidePageGenerator(
  dependencies: LocalSlidePageGeneratorDependencies,
): SlidePageGenerator {
  return {
    mode: 'local',
    isAvailable: async () => true,
    generate: async (request) => {
      const system =
        'You are a senior presentation designer. Produce one editable slide as strict JSON only. ' +
        'Never output markdown or explanations. Canvas coordinates are pixels. ' +
        `The canvas is ${request.canvasW}x${request.canvasH}. ` +
        'Schema: {"background":"#RRGGBB","elements":[...]}. ' +
        'Element variants: ' +
        '{"type":"text","text":"...","x":0,"y":0,"w":100,"h":40,"fontSize":24,"fontFace":"Arial","color":"#RRGGBB","bold":false,"italic":false,"align":"left|center|right","valign":"top|mid|bottom"}; ' +
        '{"type":"shape","shape":"rect|roundRect|ellipse","x":0,"y":0,"w":100,"h":40,"fill":"#RRGGBB","transparency":0,"line":"#RRGGBB","lineWidth":0}; ' +
        '{"type":"line","x":0,"y":0,"w":100,"h":0,"color":"#RRGGBB","width":1}; ' +
        '{"type":"image","url":"exact provided URL","x":0,"y":0,"w":100,"h":100}. ' +
        'Use 6-18 elements, strong hierarchy, generous whitespace, one coherent accent system, and no overlaps. ' +
        'Keep all elements inside the canvas. Use provided image URLs only; never invent a URL. ' +
        'Text must contain the finished content, not placeholders. Shapes must be behind text that sits on them.'
      const user = [
        `Deck topic: ${request.topic ?? ''}`,
        `Narrative hook: ${request.coreHook}`,
        `Page ${request.pageIndex}/${request.totalPages}: ${request.title}`,
        `Layout intent: ${request.layout}`,
        `Page brief: ${request.brief}`,
        `Design system:\n${request.style}`,
        request.context ? `Reference material:\n${request.context}` : '',
        request.images.length
          ? `Allowed image URLs:\n${request.images.map((url) => `- ${url}`).join('\n')}`
          : 'No image URL is available; create the page with typography and shapes.',
      ]
        .filter(Boolean)
        .join('\n\n')
      const completed = await dependencies.complete({
        system,
        user,
        signal: request.signal,
        maxTokens: 12_000,
      })
      if (!completed.ok || !completed.text) {
        return { ok: false, error: completed.error ?? 'Local page model returned no output' }
      }
      try {
        const parsed = JSON.parse(extractJsonObject(completed.text))
        const spec = normalizeLocalSlideSpec(parsed, request.canvasW, request.canvasH)
        if (!spec) return { ok: false, error: 'Local page JSON has no valid elements' }
        const rendered = await dependencies.render({
          spec,
          width: request.canvasW,
          height: request.canvasH,
        })
        return rendered.ok && rendered.marker
          ? { ok: true, page: rendered.marker }
          : { ok: false, error: rendered.error ?? 'Local page rendering failed' }
      } catch (error) {
        return {
          ok: false,
          error: `Local page JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
  }
}

export function createCloudSlidePageGenerator(dependencies: {
  enabled(): Promise<boolean>
  generate(request: SlidePageRequest): Promise<{ ok: boolean; marker?: string; error?: string }>
}): SlidePageGenerator {
  return {
    mode: 'cloud',
    isAvailable: dependencies.enabled,
    generate: async (request) => {
      const result = await dependencies.generate(request)
      return result.ok && result.marker
        ? { ok: true, page: result.marker }
        : { ok: false, error: result.error ?? 'Cloud page generation failed' }
    },
  }
}
