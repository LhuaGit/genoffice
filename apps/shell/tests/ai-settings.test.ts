import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { defaultAiSettings, type AiSettings } from '@genoffice/ai-provider'
import { AiProviderSettingsForm } from '@genoffice/ui'

type ElementProps = Record<string, unknown> & { children?: ReactNode }

function elementsIn(node: ReactNode): Array<ReactElement<ElementProps>> {
  if (Array.isArray(node)) return node.flatMap(elementsIn)
  if (!isValidElement<ElementProps>(node)) return []
  return [node, ...elementsIn(node.props.children)]
}

function customSettings(overrides: Partial<AiSettings['providers']['custom']> = {}): AiSettings {
  const settings = defaultAiSettings()
  return {
    ...settings,
    providers: {
      ...settings.providers,
      custom: {
        apiKey: 'local-key',
        model: 'local-model',
        baseUrl: 'http://localhost:11434/v1',
        ...overrides,
      },
    },
  }
}

function renderForm(
  settings: AiSettings,
  callbacks: {
    onChange?: (next: AiSettings) => void
    onSubmit?: (next: AiSettings) => void
    onCancel?: () => void
  } = {},
): Array<ReactElement<ElementProps>> {
  return elementsIn(
    AiProviderSettingsForm({
      lang: 'en',
      settings,
      onChange: callbacks.onChange ?? (() => {}),
      onSubmit: callbacks.onSubmit ?? (() => {}),
      onCancel: callbacks.onCancel,
      idPrefix: 'shell-ai-test',
    }),
  )
}

describe('AiProviderSettingsForm', () => {
  it('renders the current custom provider as controlled field values', () => {
    const elements = renderForm(customSettings())
    const inputs = elements.filter((element) => element.type === 'input')

    expect(inputs.map((input) => input.props.value)).toEqual([
      'http://localhost:11434/v1',
      'local-model',
      'local-key',
      'https://api.openai.com/v1',
      'gpt-image-1',
      '',
    ])
  })

  it('reports field edits without mutating the supplied settings', () => {
    const settings = customSettings()
    const onChange = vi.fn<(next: AiSettings) => void>()
    const inputs = renderForm(settings, { onChange }).filter((element) => element.type === 'input')
    const baseUrlInput = inputs.find((input) => input.props.id === 'shell-ai-test-base-url')
    const modelInput = inputs.find((input) => input.props.id === 'shell-ai-test-model')
    const apiKeyInput = inputs.find((input) => input.props.id === 'shell-ai-test-api-key')

    expect(baseUrlInput).toBeDefined()
    expect(modelInput).toBeDefined()
    expect(apiKeyInput).toBeDefined()

    const change = (input: ReactElement<ElementProps> | undefined, value: string) => {
      const handler = input?.props.onChange as
        ((event: { target: { value: string } }) => void) | undefined
      expect(handler).toBeTypeOf('function')
      handler?.({ target: { value } })
    }
    change(baseUrlInput, 'https://example.test/v1/')
    expect(onChange.mock.calls.at(-1)?.[0].providers.custom.baseUrl).toBe(
      'https://example.test/v1/',
    )
    change(modelInput, 'next-model')
    expect(onChange.mock.calls.at(-1)?.[0].providers.custom.model).toBe('next-model')
    change(apiKeyInput, 'next-key')
    expect(onChange.mock.calls.at(-1)?.[0].providers.custom.apiKey).toBe('next-key')

    expect(settings.providers.custom).toEqual({
      apiKey: 'local-key',
      model: 'local-model',
      baseUrl: 'http://localhost:11434/v1',
    })
  })

  it('normalizes the custom provider before submit', () => {
    const onSubmit = vi.fn<(next: AiSettings) => void>()
    const elements = renderForm(
      customSettings({
        apiKey: '  secret  ',
        model: '  local-model  ',
        baseUrl: '  http://localhost:11434/v1///  ',
      }),
      { onSubmit },
    )
    const form = elements.find((element) => element.type === 'form')
    const submit = form?.props.onSubmit as
      ((event: { preventDefault: () => void }) => void) | undefined
    const preventDefault = vi.fn()

    expect(submit).toBeTypeOf('function')
    submit?.({ preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      provider: 'custom',
      providers: {
        custom: {
          apiKey: 'secret',
          model: 'local-model',
          baseUrl: 'http://localhost:11434/v1',
        },
      },
      image: {
        apiKey: '',
        model: 'gpt-image-1',
        baseUrl: 'https://api.openai.com/v1',
      },
    })
  })

  it('offers Codex OAuth as a Pi-native LLM provider', () => {
    const settings = customSettings()
    settings.provider = 'codex'
    const elements = renderForm(settings)
    const select = elements.find((element) => element.type === 'select')
    const codexModel = elements.find(
      (element) => element.type === 'input' && element.props.id === 'shell-ai-test-codex-model',
    )

    expect(select?.props.value).toBe('codex')
    expect(codexModel?.props.value).toBe('gpt-5.5')
  })

  it('delegates cancel without submitting', () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn<(next: AiSettings) => void>()
    const cancel = renderForm(customSettings(), { onCancel, onSubmit }).find(
      (element) =>
        element.type === 'button' &&
        typeof element.props.className === 'string' &&
        element.props.className.includes('secondary'),
    )
    const click = cancel?.props.onClick as (() => void) | undefined

    expect(click).toBeTypeOf('function')
    click?.()

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('Shell AI settings wiring', () => {
  const source = (relativePath: string): string =>
    readFileSync(new URL(relativePath, import.meta.url), 'utf8')

  it('exposes matching HomeApi channels and preload methods', () => {
    const shared = source('../src/shared/home-api.ts')
    const preload = source('../src/preload/index.ts')
    const main = source('../src/main/index.ts')

    expect(shared).toMatch(/getAiSettings\(\): Promise<AiSettings>/)
    expect(shared).toMatch(/setAiSettings\(settings: AiSettings\): Promise<void>/)
    expect(shared).toContain("getAiSettings: 'ai:get-settings'")
    expect(shared).toContain("setAiSettings: 'ai:set-settings'")
    expect(preload).toMatch(/ipcRenderer\.invoke\(HOME_CHANNELS\.getAiSettings\)/)
    expect(preload).toMatch(/ipcRenderer\.invoke\(HOME_CHANNELS\.setAiSettings, settings\)/)
    expect(main).toMatch(/\bregisterAiIpc\(\)/)
  })

  it('keeps the settings page connected to the shared form and persistence API', () => {
    const settingsPage = source('../src/renderer/src/Settings.tsx')
    const home = source('../src/renderer/src/Home.tsx')

    expect(settingsPage).toContain('AiProviderSettingsForm')
    expect(settingsPage).toMatch(/window\.aiOffice\s*\.getAiSettings\(\)/)
    expect(settingsPage).toMatch(/window\.aiOffice\s*\.setAiSettings\(/)
    expect(settingsPage).toMatch(/onCancel=/)
    expect(home).toMatch(/<Settings\b/)
  })

  it('propagates saved settings to already-open editor views', () => {
    const docsMain = source('../../docs/src/main/docs-main.ts')
    const renderers = [
      source('../../docs/src/renderer/App.tsx'),
      source('../../sheets/src/renderer/App.tsx'),
      source('../../slides/src/renderer/App.tsx'),
      source('../../pdf/src/renderer/ai/AiPanel.tsx'),
      source('../src/renderer/src/Settings.tsx'),
    ]
    const preloads = [
      source('../../docs/src/preload/index.ts'),
      source('../../sheets/src/preload/index.ts'),
      source('../../slides/src/preload/index.ts'),
      source('../../pdf/src/preload/index.ts'),
      source('../src/preload/index.ts'),
    ]

    expect(docsMain).toContain('broadcastRendererEvent(')
    expect(docsMain).toContain('AI_SETTINGS_CHANGED_CHANNEL')
    for (const preload of preloads) {
      expect(preload).toContain('onAiSettingsChanged')
    }
    for (const renderer of renderers) {
      expect(renderer).toContain('onAiSettingsChanged')
    }
  })
})
