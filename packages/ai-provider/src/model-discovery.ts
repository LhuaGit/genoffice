import type { AiImageProviderConfig, AiProviderConfig, AiProviderId } from './types'
import {
  GENSPARK_LLM_BASE_URLS,
  gensparkAttributionHeaders,
} from './providers'
import { httpBodyDetail } from './http-error'

export type AiModelDiscoveryProviderId = Exclude<AiProviderId, 'codex'> | 'image'

export interface AiModelListRequest {
  providerId: AiModelDiscoveryProviderId
  config: AiProviderConfig | AiImageProviderConfig
}

export interface AiModelListResult {
  models: string[]
  error?: string
}

interface ModelDiscoveryOptions {
  apiKeyOverride?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

interface DiscoveryTarget {
  url: string
  headers: Record<string, string>
  format: 'openai' | 'gemini'
}

const PROVIDER_BASE_URLS: Partial<Record<AiModelDiscoveryProviderId, string>> = {
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
}

function modelsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  return normalized.endsWith('/models') ? normalized : `${normalized}/models`
}

function bearerHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

function discoveryTarget(
  request: AiModelListRequest,
  apiKeyOverride = '',
): DiscoveryTarget | null {
  const apiKey = apiKeyOverride || request.config.apiKey.trim()
  if (request.providerId === 'genspark') {
    const baseUrl = GENSPARK_LLM_BASE_URLS.openai
    return {
      url: modelsUrl(baseUrl),
      headers: { ...bearerHeaders(apiKey), ...gensparkAttributionHeaders(baseUrl) },
      format: 'openai',
    }
  }
  if (request.providerId === 'gemini') {
    const query = new URLSearchParams({ key: apiKey, pageSize: '1000' })
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models?${query.toString()}`,
      headers: {},
      format: 'gemini',
    }
  }
  if (request.providerId === 'anthropic') {
    return {
      url: modelsUrl(PROVIDER_BASE_URLS.anthropic!),
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      format: 'openai',
    }
  }
  const configuredBaseUrl = request.config.baseUrl?.trim()
  const baseUrl = configuredBaseUrl || PROVIDER_BASE_URLS[request.providerId]
  if (!baseUrl) return null
  return {
    url: modelsUrl(baseUrl),
    headers: bearerHeaders(apiKey),
    format: 'openai',
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function openAiModelIds(payload: unknown): string[] {
  const data = asRecord(payload).data
  if (!Array.isArray(data)) return []
  return data
    .map((item) => asRecord(item).id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
}

function geminiModelIds(payload: unknown): string[] {
  const models = asRecord(payload).models
  if (!Array.isArray(models)) return []
  return models.flatMap((item) => {
    const model = asRecord(item)
    const name = model.name
    const methods = model.supportedGenerationMethods
    if (typeof name !== 'string') return []
    if (Array.isArray(methods) && !methods.includes('generateContent')) return []
    return [name.replace(/^models\//, '')]
  })
}

function normalizedModelIds(models: string[]): string[] {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  )
}

export async function listProviderModels(
  request: AiModelListRequest,
  options: ModelDiscoveryOptions = {},
): Promise<AiModelListResult> {
  const target = discoveryTarget(request, options.apiKeyOverride)
  if (!target) return { models: [], error: '请先填写 API 地址，或直接添加模型 ID。' }

  try {
    const response = await (options.fetchImpl ?? fetch)(target.url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...target.headers },
      signal: options.signal,
    })
    if (!response.ok) {
      const detail = httpBodyDetail(await response.text())
      return {
        models: [],
        error: `获取模型失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`,
      }
    }
    const payload: unknown = await response.json()
    const models = normalizedModelIds(
      target.format === 'gemini' ? geminiModelIds(payload) : openAiModelIds(payload),
    )
    return models.length > 0
      ? { models }
      : { models: [], error: '服务未返回可用模型，请手动添加模型 ID。' }
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { models: [], error: `无法获取模型：${message}` }
  }
}
