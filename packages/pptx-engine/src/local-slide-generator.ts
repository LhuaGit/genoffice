import PptxGenJS from 'pptxgenjs'

export interface LocalSlideElementBase {
  x: number
  y: number
  w: number
  h: number
}

export interface LocalSlideTextElement extends LocalSlideElementBase {
  type: 'text'
  text: string
  fontSize?: number
  fontFace?: string
  color?: string
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'mid' | 'bottom'
}

export interface LocalSlideShapeElement extends LocalSlideElementBase {
  type: 'shape'
  shape?: 'rect' | 'roundRect' | 'ellipse'
  fill?: string
  transparency?: number
  line?: string
  lineWidth?: number
  radius?: number
}

export interface LocalSlideLineElement extends LocalSlideElementBase {
  type: 'line'
  color?: string
  width?: number
}

export interface LocalSlideImageElement extends LocalSlideElementBase {
  type: 'image'
  /** One of the input image URLs. Resolved to data by the Electron main-process adapter. */
  url?: string
  /** PptxGenJS data URI, injected after the URL has been downloaded. */
  data?: string
}

export type LocalSlideElement =
  LocalSlideTextElement | LocalSlideShapeElement | LocalSlideLineElement | LocalSlideImageElement

export interface LocalSlideSpec {
  background: string
  elements: LocalSlideElement[]
}

const hex = (value: string | undefined, fallback: string): string => {
  const normalized = String(value ?? '')
    .trim()
    .replace(/^#/, '')
    .toUpperCase()
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : fallback
}

const finite = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Render a validated, pixel-coordinate page spec to one editable PPTX slide locally. */
export async function generateLocalSlidePptx(
  spec: LocalSlideSpec,
  widthPx = 1280,
  heightPx = 720,
): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  const widthIn = widthPx / 96
  const heightIn = heightPx / 96
  pptx.defineLayout({ name: 'GENOFFICE_LOCAL', width: widthIn, height: heightIn })
  pptx.layout = 'GENOFFICE_LOCAL'
  pptx.author = 'GenOffice'
  pptx.subject = 'Locally generated editable slide'
  const slide = pptx.addSlide()
  slide.background = { color: hex(spec.background, 'FFFFFF') }

  const box = (element: LocalSlideElementBase) => ({
    x: clamp(finite(element.x, 0), 0, widthPx) / 96,
    y: clamp(finite(element.y, 0), 0, heightPx) / 96,
    w: clamp(finite(element.w, 1), 1, widthPx) / 96,
    h: clamp(finite(element.h, 1), 1, heightPx) / 96,
  })

  for (const element of spec.elements.slice(0, 80)) {
    const position = box(element)
    if (element.type === 'text') {
      slide.addText(String(element.text ?? '').slice(0, 4000), {
        ...position,
        fontFace: element.fontFace || 'Arial',
        fontSize: clamp(finite(element.fontSize ?? 24, 24), 8, 96),
        color: hex(element.color, '1F2937'),
        bold: element.bold === true,
        italic: element.italic === true,
        align: element.align ?? 'left',
        valign: element.valign === 'mid' ? 'middle' : (element.valign ?? 'top'),
        margin: 2,
        breakLine: false,
        fit: 'shrink',
      })
      continue
    }
    if (element.type === 'shape') {
      const shape =
        element.shape === 'ellipse'
          ? 'ellipse'
          : element.shape === 'roundRect'
            ? 'roundRect'
            : 'rect'
      slide.addShape(shape, {
        ...position,
        fill: {
          color: hex(element.fill, 'F3F4F6'),
          transparency: clamp(finite(element.transparency ?? 0, 0), 0, 100),
        },
        line: {
          color: hex(element.line, element.fill ? hex(element.fill, 'F3F4F6') : 'D1D5DB'),
          width: clamp(finite(element.lineWidth ?? 0, 0), 0, 8),
          transparency: element.lineWidth ? 0 : 100,
        },
        ...(shape === 'roundRect' ? { rectRadius: clamp(element.radius ?? 0.12, 0, 1) } : {}),
      })
      continue
    }
    if (element.type === 'line') {
      slide.addShape('line', {
        ...position,
        line: {
          color: hex(element.color, '94A3B8'),
          width: clamp(finite(element.width ?? 1, 1), 0.25, 8),
        },
      })
      continue
    }
    if (element.type === 'image' && element.data) {
      slide.addImage({ data: element.data, ...position })
    }
  }

  const output = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
  return new Uint8Array(output)
}
