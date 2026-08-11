import { describe, expect, it, vi } from 'vitest'
import {
  createLocalSlidePageGenerator,
  normalizeLocalSlideSpec,
} from '../src/renderer/ai/slide-page-generator'

describe('local SlidePageGenerator adapter', () => {
  it('turns model JSON into a locally rendered page marker', async () => {
    const complete = vi.fn(async () => ({
      ok: true,
      text: '```json\n{"background":"#fff","elements":[{"type":"text","text":"Title","x":80,"y":80,"w":900,"h":90,"fontSize":44}]}\n```',
    }))
    const render = vi.fn(async () => ({ ok: true, marker: 'pagepptx:/tmp/local.pptx' }))
    const generator = createLocalSlidePageGenerator({ complete, render })

    const result = await generator.generate({
      pageIndex: 1,
      totalPages: 1,
      coreHook: 'hook',
      style: 'navy and white',
      title: 'Title',
      brief: 'Explain the result',
      layout: 'hero_big_number',
      images: [],
      canvasW: 1280,
      canvasH: 720,
    })

    expect(result).toEqual({ ok: true, page: 'pagepptx:/tmp/local.pptx' })
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ spec: expect.objectContaining({ elements: expect.any(Array) }) }),
    )
  })

  it('rejects output without valid editable elements', () => {
    expect(normalizeLocalSlideSpec({ background: '#fff', elements: [] }, 1280, 720)).toBeNull()
  })
})
