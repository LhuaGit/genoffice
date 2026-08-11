import { describe, expect, it } from 'vitest'
import { generateLocalSlidePptx, openPptx, type LocalSlideSpec } from '../src/index'

describe('generateLocalSlidePptx', () => {
  it('renders editable text and shapes into a one-page deck', async () => {
    const spec: LocalSlideSpec = {
      background: '#0F172A',
      elements: [
        { type: 'shape', shape: 'roundRect', x: 60, y: 80, w: 1160, h: 560, fill: '#172554' },
        {
          type: 'text',
          text: 'Local editable page',
          x: 100,
          y: 120,
          w: 900,
          h: 100,
          fontSize: 44,
          bold: true,
          color: '#FFFFFF',
        },
      ],
    }

    const opened = await openPptx(await generateLocalSlidePptx(spec))

    expect(opened.deck.slides).toHaveLength(1)
    const text = opened.deck.slides[0]!.elements.flatMap((element) =>
      'text' in element && element.text
        ? element.text.paragraphs.flatMap((paragraph) => paragraph.runs.map((run) => run.text))
        : [],
    ).join('')
    expect(text).toContain('Local editable page')
  })
})
