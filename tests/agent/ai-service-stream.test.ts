import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIService } from '@/lib/ai-service'
import type { ProviderConfig } from '@/stores/settingsStore'

const providerConfig: ProviderConfig = {
  id: 'custom',
  name: 'Custom',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test',
  model: 'test-model',
  temperature: 0,
  maxTokens: 1000,
  isTested: true,
}

function streamFromText(text: string) {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

describe('AIService streaming chat', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses OpenAI-compatible SSE deltas', async () => {
    const fetchMock = vi.fn(async () => new Response(streamFromText([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      'data: [DONE]',
      '',
    ].join('\n'))))
    vi.stubGlobal('fetch', fetchMock)
    const deltas: string[] = []

    const result = await new AIService(providerConfig).chatMessagesStream({
      messages: [{ role: 'user', content: 'hello' }],
      onDelta: (_delta, fullText) => deltas.push(fullText),
    })

    expect(result).toBe('Hello')
    expect(deltas).toEqual(['Hel', 'Hello'])
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).stream).toBe(true)
  })

  it('normalizes rate limit and service errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'slow down' } }),
      { status: 429, statusText: 'Too Many Requests' }
    )))

    await expect(new AIService(providerConfig).chatMessagesStream({
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toThrow('Rate limit exceeded')
  })

  it('reports interrupted streams', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      pull() {
        throw new Error('socket closed')
      },
    }))))

    await expect(new AIService(providerConfig).chatMessagesStream({
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toThrow('Stream connection interrupted')
  })
})
