// The AI panel stays mounted while collapsed (rail only),
// so the conversation, draft, and in-flight runs survive collapse/expand.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '../src/renderer/editor/extensions'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import { AI_PROVIDERS, type AiSettings } from '../src/shared/ipc'

const settings: AiSettings = {
  provider: 'anthropic',
  providers: Object.fromEntries(
    AI_PROVIDERS.map((p) => [p.id, { apiKey: '', model: p.defaultModel }]),
  ) as AiSettings['providers'],
  image: { apiKey: '', model: 'gpt-image-1', baseUrl: 'https://api.openai.com/v1' },
}

function createEditor(): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions,
    content: {
      type: 'doc',
      content: [
        {
          type: 'docParagraph',
          attrs: { docxIndex: 0 },
          content: [{ type: 'text', text: 'EVs market research' }],
        },
      ],
    },
  })
}

function mount(element: React.ReactElement): {
  container: HTMLElement
  root: Root
  cleanup: () => void
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return {
    container,
    root,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function panelProps(editor: Editor, overrides: Record<string, unknown> = {}) {
  return {
    editor,
    blocks: [],
    settings,
    open: true,
    onExpand: () => {},
    onCollapse: () => {},
    ...overrides,
  }
}

/** Simulate typing into React's controlled textarea */
function typeInto(textarea: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function typeIntoInput(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeAll(() => {
  // jsdom has no scrollTo; the panel auto-scrolls its chat log
  Element.prototype.scrollTo ??= () => {}
})

describe('AiPanel collapse', () => {
  it('keeps the draft input across a collapse/expand cycle', () => {
    const editor = createEditor()
    const { container, root, cleanup } = mount(createElement(AiPanel, panelProps(editor)))

    const textarea = container.querySelector<HTMLTextAreaElement>('.ai-input-box textarea')
    expect(textarea).not.toBeNull()
    typeInto(textarea!, 'unsent draft')
    expect(textarea!.value).toBe('unsent draft')

    // collapse: only the rail is rendered, but the component stays mounted
    act(() => root.render(createElement(AiPanel, panelProps(editor, { open: false }))))
    expect(container.querySelector('.ai-input-box textarea')).toBeNull()
    expect(container.querySelector('.ai-rail')).not.toBeNull()

    // expand: the draft is still there
    act(() => root.render(createElement(AiPanel, panelProps(editor, { open: true }))))
    const restored = container.querySelector<HTMLTextAreaElement>('.ai-input-box textarea')
    expect(restored).not.toBeNull()
    expect(restored!.value).toBe('unsent draft')

    cleanup()
    editor.destroy()
  })

  it('expands back through the rail button', () => {
    const editor = createEditor()
    const onExpand = vi.fn()
    const { container, cleanup } = mount(
      createElement(AiPanel, panelProps(editor, { open: false, onExpand })),
    )

    const rail = container.querySelector<HTMLButtonElement>('.ai-rail')
    expect(rail).not.toBeNull()
    act(() => rail!.click())
    expect(onExpand).toHaveBeenCalledTimes(1)

    cleanup()
    editor.destroy()
  })

  it('saves a keyless custom OpenAI-compatible provider', () => {
    const editor = createEditor()
    const onSettingsChange = vi.fn()
    const { container, cleanup } = mount(
      createElement(AiPanel, panelProps(editor, { onSettingsChange })),
    )

    const settingsButton = container.querySelector<HTMLButtonElement>(
      '.ai-panel-header-actions button[aria-label]',
    )
    expect(settingsButton).not.toBeNull()
    act(() => settingsButton!.click())

    const baseUrl = container.querySelector<HTMLInputElement>('#custom-ai-provider-base-url')
    const model = container.querySelector<HTMLInputElement>('#custom-ai-provider-model')
    const apiKey = container.querySelector<HTMLInputElement>('#custom-ai-provider-api-key')
    expect(baseUrl).not.toBeNull()
    expect(model).not.toBeNull()
    expect(apiKey).not.toBeNull()
    typeIntoInput(baseUrl!, 'http://localhost:11434/v1///')
    typeIntoInput(model!, 'llama3.1')
    typeIntoInput(apiKey!, '')
    const form = container.querySelector<HTMLFormElement>('[role="dialog"] form')
    expect(form).not.toBeNull()
    act(() => form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'custom',
        providers: expect.objectContaining({
          custom: { apiKey: '', model: 'llama3.1', baseUrl: 'http://localhost:11434/v1' },
        }),
      }),
    )

    cleanup()
    editor.destroy()
  })
})
