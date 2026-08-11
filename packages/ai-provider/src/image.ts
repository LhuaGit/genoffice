import type { AiGeneratedImage, AiImageGenerationRequest, AiImageProviderConfig } from './types'

function imageSize(aspectRatio: string | undefined): string {
  if (aspectRatio === '9:16' || aspectRatio === '3:4' || aspectRatio === '2:3') {
    return '1024x1536'
  }
  if (aspectRatio === '16:9' || aspectRatio === '4:3' || aspectRatio === '3:2') {
    return '1536x1024'
  }
  return '1024x1024'
}

function generationsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(normalized)) throw new Error('Image Base URL must use http or https')
  return `${normalized}/images/generations`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** Generate one image through an OpenAI-compatible Images endpoint. The module
 * returns transport-neutral data; Office-specific insertion stays with each editor. */
export async function generateImageForProvider(
  config: AiImageProviderConfig,
  request: AiImageGenerationRequest,
): Promise<AiGeneratedImage> {
  const model = config.model.trim()
  const prompt = request.prompt.trim()
  if (!model) throw new Error('Configure an image model first')
  if (!prompt) throw new Error('Image prompt must not be empty')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`
  const response = await fetch(generationsUrl(config.baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      prompt,
      size: imageSize(request.aspectRatio),
      response_format: 'b64_json',
      n: 1,
    }),
    ...(request.signal ? { signal: request.signal } : {}),
  })
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 500)
    throw new Error(`Image generation failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }
  const body = asRecord(await response.json())
  const data = Array.isArray(body.data) ? body.data : []
  const first = asRecord(data[0])
  const base64 = typeof first.b64_json === 'string' ? first.b64_json : ''
  const url = typeof first.url === 'string' ? first.url : ''
  if (!base64 && !url) throw new Error('Image provider returned no image data')
  return {
    ...(base64 ? { base64, mimeType: 'image/png' } : {}),
    ...(url ? { url } : {}),
  }
}
