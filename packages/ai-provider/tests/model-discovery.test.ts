import { describe, expect, it, vi } from 'vitest'
import { listProviderModels } from '../src/model-discovery'
import { jsonResponse } from './test-utils'

describe('listProviderModels', () => {
  it('lists and sorts models from an OpenAI-compatible endpoint', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: [{ id: 'model-10' }, { id: 'model-2' }, { id: 'model-2' }] }),
    )

    const result = await listProviderModels(
      {
        providerId: 'custom',
        config: { apiKey: 'secret', model: '', baseUrl: 'https://llm.example.com/v1/' },
      },
      { fetchImpl: fetchImpl as typeof fetch },
    )

    expect(result).toEqual({ models: ['model-2', 'model-10'] })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://llm.example.com/v1/models',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret' }) }),
    )
  })

  it('uses Anthropic model-list headers', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: [{ id: 'claude-current' }] }),
    )

    const result = await listProviderModels(
      { providerId: 'anthropic', config: { apiKey: 'anthropic-key', model: '' } },
      { fetchImpl: fetchImpl as typeof fetch },
    )

    expect(result.models).toEqual(['claude-current'])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'anthropic-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    )
  })

  it('keeps only Gemini models that support content generation', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        models: [
          { name: 'models/gemini-current', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    )

    const result = await listProviderModels(
      { providerId: 'gemini', config: { apiKey: 'gemini-key', model: '' } },
      { fetchImpl: fetchImpl as typeof fetch },
    )

    expect(result.models).toEqual(['gemini-current'])
    expect(fetchImpl.mock.calls[0]?.[0]).toContain(
      'https://generativelanguage.googleapis.com/v1beta/models?',
    )
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('key=gemini-key')
  })

  it('returns a manual-entry hint when an endpoint cannot list models', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ detail: 'not supported' }, 404),
    )

    const result = await listProviderModels(
      {
        providerId: 'image',
        config: { apiKey: '', model: '', baseUrl: 'http://localhost:11434/v1' },
      },
      { fetchImpl: fetchImpl as typeof fetch },
    )

    expect(result.models).toEqual([])
    expect(result.error).toContain('HTTP 404')
  })
})
