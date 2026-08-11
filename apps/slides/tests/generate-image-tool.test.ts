import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderSlide } from '@genoffice/pptx-render'
import { createSlidesSkill, type DeckAccess } from '../src/renderer/ai/slides-skill'

const slide = { widthPx: 1280, heightPx: 720, nodes: [] } as unknown as RenderSlide

describe('generate_image tool', () => {
  beforeEach(() => {
    ;(window as any).slidesApi = {
      generateImage: vi.fn(async () => ({ slide, sourceId: 'pic_1' })),
    }
  })

  it('generates and inserts in one mutation with useful default geometry', async () => {
    const applySlide = vi.fn()
    const access: DeckAccess = {
      getSlides: () => [slide],
      getCurrent: () => 0,
      getSelectedIds: () => [],
      applySlide,
      applyDeck: () => {},
      fitWidthPx: 1280,
    }
    const result = await createSlidesSkill(access).executeTool!({
      id: 'image-1',
      name: 'generate_image',
      input: { prompt: 'editorial illustration about revenue growth' },
    })

    expect(result.mutated).toBe(true)
    expect(applySlide).toHaveBeenCalledWith(0, slide)
    expect((window as any).slidesApi.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        slideIndex: 0,
        prompt: 'editorial illustration about revenue growth',
        fitWidthPx: 1280,
      }),
    )
    expect(result.output).toContain('pic_1')
  })
})
