import type { RenderSlide } from '@genoffice/pptx-render'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  AiAnnotationLayer,
  AiAnnotationTray,
  type AiAnnotationLabels,
} from '../src/renderer/components/AiAnnotationLayer'
import type { SlideAiAnnotation } from '../src/renderer/ai/annotations'

const labels: AiAnnotationLabels = {
  title: 'Mark edit locations',
  hint: 'Click a position, then send all annotations.',
  empty: 'No annotations yet',
  placeholder: 'Describe what should change',
  add: 'Add annotation',
  targetObjects: (count) => `${count} objects`,
  targetPoint: 'Slide position',
  send: (count) => `Send ${count} to AI`,
  clear: 'Clear',
  cancel: 'Cancel',
  delete: 'Delete',
  close: 'Close',
  page: (pageNumber) => `Slide ${pageNumber}`,
  marker: (number) => `Annotation ${number}`,
}

const slide = {
  widthPx: 1_000,
  heightPx: 600,
  scale: 1,
  nodes: [],
  background: { kind: 'solid', color: '#ffffff' },
} as RenderSlide

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function mount(element: React.ReactNode): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(element))
  return container
}

describe('AI annotation UI', () => {
  it('creates a location-aware annotation with the macOS Return key alias', () => {
    const onCreate = vi.fn()
    const host = mount(
      createElement(AiAnnotationLayer, {
        slide,
        slideIndex: 2,
        annotations: [],
        mode: true,
        zoom: 0.5,
        selectedIds: [],
        labels,
        onCreate,
        onUpdate: vi.fn(),
        onDelete: vi.fn(),
      }),
    )

    const layer = host.querySelector<HTMLDivElement>('.ai-annotation-layer')!
    layer.getBoundingClientRect = () =>
      ({ left: 20, top: 30, width: 500, height: 300, right: 520, bottom: 330 }) as DOMRect

    act(() => {
      layer.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 145, clientY: 105 }),
      )
    })
    act(() => {
      layer.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 145, clientY: 105 }),
      )
    })

    const textarea = host.querySelector<HTMLTextAreaElement>('.ai-annotation-editor textarea')!
    expect(textarea).not.toBeNull()
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    act(() => {
      valueSetter?.call(textarea, 'Move this callout closer to the chart')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Return' }))
    })

    expect(onCreate).toHaveBeenCalledWith({
      slideIndex: 2,
      point: { x: 250, y: 150 },
      objectIds: [],
      comment: 'Move this callout closer to the chart',
    })
    expect(host.querySelector('.ai-annotation-editor')).toBeNull()
  })

  it('uses Shift+Enter for a newline and never submits on blur or IME confirmation', () => {
    const onCreate = vi.fn()
    const host = mount(
      createElement(AiAnnotationLayer, {
        slide,
        slideIndex: 0,
        annotations: [],
        mode: true,
        zoom: 1,
        selectedIds: [],
        labels,
        onCreate,
        onUpdate: vi.fn(),
        onDelete: vi.fn(),
      }),
    )
    const layer = host.querySelector<HTMLDivElement>('.ai-annotation-layer')!
    layer.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1_000, height: 600, right: 1_000, bottom: 600 }) as DOMRect
    act(() => {
      layer.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }),
      )
    })
    act(() => {
      layer.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 100, clientY: 100 }),
      )
    })

    const textarea = host.querySelector<HTMLTextAreaElement>('.ai-annotation-editor textarea')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    act(() => {
      valueSetter?.call(textarea, '第一行')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    let shiftEnterAccepted = false
    act(() => {
      shiftEnterAccepted = textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
          shiftKey: true,
        }),
      )
    })
    expect(shiftEnterAccepted).toBe(true)
    expect(onCreate).not.toHaveBeenCalled()

    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
          isComposing: true,
        }),
      )
      textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    expect(onCreate).not.toHaveBeenCalled()
    expect(host.querySelector('.ai-annotation-editor')).not.toBeNull()

    act(() => {
      valueSetter?.call(textarea, '第一行\n第二行')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    })
    expect(onCreate).toHaveBeenCalledWith({
      slideIndex: 0,
      point: { x: 100, y: 100 },
      objectIds: [],
      comment: '第一行\n第二行',
    })
  })

  it('shows a live marquee and keeps the dragged bounds for the annotation', () => {
    const onCreate = vi.fn()
    const host = mount(
      createElement(AiAnnotationLayer, {
        slide,
        slideIndex: 0,
        annotations: [],
        mode: true,
        zoom: 0.5,
        selectedIds: [],
        labels,
        onCreate,
        onUpdate: vi.fn(),
        onDelete: vi.fn(),
      }),
    )
    const layer = host.querySelector<HTMLDivElement>('.ai-annotation-layer')!
    layer.getBoundingClientRect = () =>
      ({ left: 20, top: 30, width: 500, height: 300, right: 520, bottom: 330 }) as DOMRect

    act(() => {
      layer.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 70, clientY: 80 }),
      )
    })
    act(() => {
      layer.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, button: 0, clientX: 220, clientY: 180 }),
      )
    })

    const marquee = host.querySelector<HTMLDivElement>('.ai-annotation-marquee')!
    expect(marquee).not.toBeNull()
    expect(marquee.style.left).toBe('100px')
    expect(marquee.style.top).toBe('100px')
    expect(marquee.style.width).toBe('300px')
    expect(marquee.style.height).toBe('200px')

    act(() => {
      layer.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, button: 0, clientX: 220, clientY: 180 }),
      )
    })
    expect(host.querySelector('.ai-annotation-marquee')).toBeNull()
    expect(host.querySelector('.ai-annotation-target.is-pending')).not.toBeNull()

    const textarea = host.querySelector<HTMLTextAreaElement>('.ai-annotation-editor textarea')!
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    act(() => {
      valueSetter?.call(textarea, 'Align the content inside this region')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', metaKey: true }),
      )
    })

    expect(onCreate).toHaveBeenCalledWith({
      slideIndex: 0,
      point: { x: 250, y: 200 },
      bounds: { x: 100, y: 100, w: 300, h: 200 },
      objectIds: [],
      comment: 'Align the content inside this region',
    })
  })

  it('navigates, deletes, and sends from the multi-slide tray', () => {
    const annotation: SlideAiAnnotation = {
      id: 'note-1',
      slideIndex: 3,
      point: { x: 200, y: 120 },
      objectIds: ['shape-7'],
      comment: 'Use the brand blue here',
    }
    const onNavigate = vi.fn()
    const onDelete = vi.fn()
    const onSend = vi.fn()
    const host = mount(
      createElement(AiAnnotationTray, {
        annotations: [annotation],
        mode: true,
        labels,
        onCloseMode: vi.fn(),
        onClear: vi.fn(),
        onDelete,
        onNavigate,
        onSend,
      }),
    )

    const tray = host.querySelector<HTMLElement>('.ai-annotation-tray')!
    const toggle = host.querySelector<HTMLButtonElement>('.ai-annotation-tray-toggle')!
    expect(tray.classList.contains('is-collapsed')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(host.textContent).not.toContain('Use the brand blue here')

    act(() => toggle.click())
    expect(tray.classList.contains('is-expanded')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(host.textContent).toContain('Slide 4')
    expect(host.textContent).toContain('Use the brand blue here')
    act(() => host.querySelector<HTMLButtonElement>('.ai-annotation-row-main')!.click())
    act(() => host.querySelector<HTMLButtonElement>('.ai-annotation-row-delete')!.click())
    act(() => host.querySelector<HTMLButtonElement>('.ai-annotation-send-btn')!.click())

    expect(onNavigate).toHaveBeenCalledWith(annotation)
    expect(onDelete).toHaveBeenCalledWith('note-1')
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('returns to the compact tray whenever annotation mode is reopened', () => {
    const props = {
      annotations: [],
      labels,
      onCloseMode: vi.fn(),
      onClear: vi.fn(),
      onDelete: vi.fn(),
      onNavigate: vi.fn(),
      onSend: vi.fn(),
    }
    const host = mount(createElement(AiAnnotationTray, { ...props, mode: true }))

    act(() => host.querySelector<HTMLButtonElement>('.ai-annotation-tray-toggle')!.click())
    expect(host.querySelector('.ai-annotation-tray')?.classList.contains('is-expanded')).toBe(true)

    act(() => root!.render(createElement(AiAnnotationTray, { ...props, mode: false })))
    expect(host.querySelector('.ai-annotation-tray')).toBeNull()

    act(() => root!.render(createElement(AiAnnotationTray, { ...props, mode: true })))
    expect(host.querySelector('.ai-annotation-tray')?.classList.contains('is-collapsed')).toBe(true)
    expect(host.querySelector('.ai-annotation-tray-toggle')?.getAttribute('aria-expanded')).toBe(
      'false',
    )
  })
})
