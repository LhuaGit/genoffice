import type { AiProviderConfig, AiProviderId, AiSettings } from '@genoffice/ai-provider'
import { GENSPARK_LLM_BASE_URLS, gensparkAttributionHeaders } from '@genoffice/ai-provider'
import { gskApiKey } from '@genoffice/ai-search'
import type { Model } from '@mariozechner/pi-ai'
import { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent'

const PROVIDER_IDS: Partial<Record<AiProviderId, string>> = {
  anthropic: 'anthropic',
  gemini: 'google',
  deepseek: 'deepseek',
  openai: 'openai',
  codex: 'openai-codex',
}

const FREE_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

interface PiProviderRuntime {
  authStorage: AuthStorage
  modelRegistry: ModelRegistry
}

export function createPiProviderRuntime(): PiProviderRuntime {
  const authStorage = AuthStorage.create()
  return { authStorage, modelRegistry: ModelRegistry.create(authStorage) }
}

function registerCustomModel(
  runtime: PiProviderRuntime,
  provider: string,
  config: AiProviderConfig,
  options?: {
    api?: Model<any>['api']
    baseUrl?: string
    headers?: Record<string, string>
    input?: Array<'text' | 'image'>
  },
): Model<any> {
  const baseUrl = options?.baseUrl ?? config.baseUrl ?? 'http://127.0.0.1:11434/v1'
  const api = options?.api ?? 'openai-completions'
  runtime.modelRegistry.registerProvider(provider, {
    name: provider,
    api,
    baseUrl,
    apiKey: config.apiKey || 'not-required',
    ...(options?.headers ? { headers: options.headers } : {}),
    models: [
      {
        id: config.model,
        name: config.model,
        api,
        baseUrl,
        reasoning: false,
        input: options?.input ?? ['text', 'image'],
        cost: FREE_COST,
        contextWindow: 128_000,
        maxTokens: 32_000,
        ...(options?.headers ? { headers: options.headers } : {}),
      },
    ],
  })
  const model = runtime.modelRegistry.find(provider, config.model)
  if (!model) throw new Error(`Pi could not register model ${provider}/${config.model}`)
  return model
}

function gensparkModel(runtime: PiProviderRuntime, config: AiProviderConfig): Model<any> {
  const key = config.apiKey || gskApiKey()
  if (!key) throw new Error('Genspark login is required')
  const resolved = { ...config, apiKey: key }
  if (config.model.startsWith('claude-')) {
    return registerCustomModel(runtime, 'genoffice-genspark', resolved, {
      api: 'anthropic-messages',
      baseUrl: GENSPARK_LLM_BASE_URLS.anthropic,
      headers: gensparkAttributionHeaders(GENSPARK_LLM_BASE_URLS.anthropic),
    })
  }
  if (config.model.startsWith('gemini-')) {
    return registerCustomModel(runtime, 'genoffice-genspark', resolved, {
      api: 'google-generative-ai',
      baseUrl: GENSPARK_LLM_BASE_URLS.gemini,
      headers: gensparkAttributionHeaders(GENSPARK_LLM_BASE_URLS.gemini),
    })
  }
  return registerCustomModel(runtime, 'genoffice-genspark', resolved, {
    api: 'openai-completions',
    baseUrl: GENSPARK_LLM_BASE_URLS.openai,
    headers: gensparkAttributionHeaders(GENSPARK_LLM_BASE_URLS.openai),
  })
}

/** Resolve existing GenOffice settings through Pi's native model registry and auth storage. */
export function resolvePiModel(runtime: PiProviderRuntime, settings: AiSettings): Model<any> {
  const config = settings.providers[settings.provider]
  if (!config?.model) throw new Error(`No model configured for ${settings.provider}`)
  if (settings.provider === 'custom') {
    return registerCustomModel(runtime, 'genoffice-custom', config)
  }
  if (settings.provider === 'genspark') return gensparkModel(runtime, config)

  const provider = PROVIDER_IDS[settings.provider]
  if (!provider) throw new Error(`Unsupported Pi provider: ${settings.provider}`)
  if (config.apiKey) runtime.authStorage.setRuntimeApiKey(provider, config.apiKey)
  const model = runtime.modelRegistry.find(provider, config.model)
  if (!model) throw new Error(`Pi model not found: ${provider}/${config.model}`)
  return model
}
