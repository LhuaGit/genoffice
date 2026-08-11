import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateImageForProvider } from '../src/image'

afterEach(() => vi.unstubAllGlobals())

describe('generateImageForProvider', () => {
  it('calls an OpenAI-compatible images endpoint and returns base64 data', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateImageForProvider(
      { baseUrl: 'https://image.example/v1/', apiKey: 'secret', model: 'image-model' },
      { prompt: 'a clean business illustration', aspectRatio: '16:9' },
    )

    expect(result).toEqual({ base64: 'aW1hZ2U=', mimeType: 'image/png' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://image.example/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      }),
    )
    const init = fetchMock.mock.calls[0]![1]!
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'image-model',
      size: '1536x1024',
      response_format: 'b64_json',
    })
  })

  it('accepts providers that return a URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ url: 'https://cdn.example/image.png' }] }), {
            status: 200,
          }),
      ),
    )
    await expect(
      generateImageForProvider(
        { baseUrl: 'http://127.0.0.1:8080/v1', apiKey: '', model: 'local-image' },
        { prompt: 'diagram' },
      ),
    ).resolves.toEqual({ url: 'https://cdn.example/image.png' })
  })
})
