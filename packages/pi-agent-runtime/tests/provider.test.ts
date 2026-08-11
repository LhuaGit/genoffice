import { defaultAiSettings } from '@genoffice/ai-provider'
import { describe, expect, it } from 'vitest'
import { createPiProviderRuntime, resolvePiModel } from '../src/provider'

describe('Pi provider bridge', () => {
  it('uses Pi native registry models for built-in providers', () => {
    const runtime = createPiProviderRuntime()
    const native = runtime.modelRegistry.getAll().find((model) => model.provider === 'openai')
    expect(native).toBeDefined()
    const defaults = defaultAiSettings()
    const settings = {
      ...defaults,
      provider: 'openai' as const,
      providers: {
        ...defaults.providers,
        openai: { apiKey: 'test-key', model: native!.id },
      },
    }

    const model = resolvePiModel(runtime, settings)

    expect(model.provider).toBe('openai')
    expect(model.id).toBe(native!.id)
  })

  it('registers OpenAI-compatible custom endpoints as Pi models with image input', () => {
    const runtime = createPiProviderRuntime()
    const defaults = defaultAiSettings()
    const settings = {
      ...defaults,
      provider: 'custom' as const,
      providers: {
        ...defaults.providers,
        custom: {
          apiKey: '',
          model: 'local-vision-model',
          baseUrl: 'http://127.0.0.1:11434/v1',
        },
      },
    }

    const model = resolvePiModel(runtime, settings)

    expect(model).toEqual(
      expect.objectContaining({
        provider: 'genoffice-custom',
        id: 'local-vision-model',
        api: 'openai-completions',
        baseUrl: 'http://127.0.0.1:11434/v1',
        input: ['text', 'image'],
      }),
    )
  })

  it('resolves Codex OAuth models from Pi native registry', () => {
    const runtime = createPiProviderRuntime()
    const settings = defaultAiSettings()
    settings.provider = 'codex'
    settings.providers.codex.model = 'gpt-5.5'

    const model = resolvePiModel(runtime, settings)

    expect(model.provider).toBe('openai-codex')
    expect(model.api).toBe('openai-codex-responses')
  })
})
