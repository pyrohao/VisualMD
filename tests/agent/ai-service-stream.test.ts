import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIService } from '@/lib/ai-service'
import type { ProviderConfig } from '@/stores/settingsStore'

const providerConfig: ProviderConfig = {
  id: 'custom',
  name: 'Custom',
  protocol: 'openai-compatible',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test',
  model: 'test-model',
  models: [],
  modelDiscovery: { type: 'openai-models', path: '/models' },
  authType: 'bearer',
  openAIEndpoint: 'chat-completions',
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

  it('combines reasoning and answer in OpenAI-compatible SSE streams', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(streamFromText([
      'data: {"choices":[{"delta":{"reasoning_content":"Think 1. "}}]}',
      'data: {"choices":[{"delta":{"reasoning_content":"Think 2."}}]}',
      'data: {"choices":[{"delta":{"content":"Final"}}]}',
      'data: {"choices":[{"delta":{"content":" answer"}}]}',
      'data: [DONE]',
      '',
    ].join('\n')))))
    const deltas: string[] = []

    const result = await new AIService(providerConfig).chatMessagesStream({
      messages: [{ role: 'user', content: 'hello' }],
      onDelta: (_delta, fullText) => deltas.push(fullText),
    })

    expect(result).toBe('<think>Think 1. Think 2.</think>\n\nFinal answer')
    expect(deltas).toEqual([
      '<think>Think 1.</think>',
      '<think>Think 1. Think 2.</think>',
      '<think>Think 1. Think 2.</think>\n\nFinal',
      '<think>Think 1. Think 2.</think>\n\nFinal answer',
    ])
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

  it('explains browser CORS failures instead of raw failed to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))

    const result = await new AIService(providerConfig).testConnection()

    expect(result.success).toBe(false)
    expect(result.message).toContain('CORS')
    expect(result.message).toContain('Authorization')
  })

  it('converts chat requests for Anthropic-compatible providers', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Hello from Claude' }],
    })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new AIService({
      ...providerConfig,
      protocol: 'anthropic-compatible',
      authType: 'x-api-key',
      modelDiscovery: { type: 'anthropic-models', path: '/models' },
    }).chatMessages({
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
        { role: 'tool', content: '{"ok":true}' },
      ],
    })

    expect(result).toBe('Hello from Claude')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.test/v1/messages')
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-api-key': 'test',
      'anthropic-version': '2023-06-01',
    })
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(body.system).toBe('system prompt')
    expect(body.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'user', content: '<tool>{"ok":true}</tool>' },
    ])
  })

  it('lists models from OpenAI-compatible model endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: 'model-a', context_length: 128000 },
        { id: 'model-b' },
      ],
    }))))

    const models = await new AIService(providerConfig).listModels()

    expect(models.map((model) => model.id)).toEqual(['model-a', 'model-b'])
    expect(models[0]?.contextLength).toBe(128000)
  })

  it('uses OpenAI Responses endpoint when configured', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: 'Response API text',
    })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new AIService({
      ...providerConfig,
      openAIEndpoint: 'responses',
    }).chatMessages({
      messages: [{ role: 'user', content: 'hello' }],
      maxTokens: 20,
    })

    expect(result).toBe('Response API text')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.test/v1/responses')
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(body.max_output_tokens).toBe(20)
    expect(body.input).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('falls back from chat completions to responses in auto mode', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: 'Fallback OK' })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new AIService({
      ...providerConfig,
      openAIEndpoint: 'auto',
    }).chatMessages({
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result).toBe('Fallback OK')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.test/v1/chat/completions')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://example.test/v1/responses')
  })

  it('detects responses endpoint during connection testing', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: 'OK' })))
    vi.stubGlobal('fetch', fetchMock)

    const result = await new AIService({
      ...providerConfig,
      openAIEndpoint: 'auto',
    }).testConnection()

    expect(result).toMatchObject({
      success: true,
      endpoint: 'responses',
    })
  })

  it('parses OpenAI Responses SSE deltas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(streamFromText([
      'event: response.output_text.delta',
      'data: {"delta":"Hel"}',
      '',
      'event: response.output_text.delta',
      'data: {"delta":"lo"}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')))))
    const deltas: string[] = []

    const result = await new AIService({
      ...providerConfig,
      openAIEndpoint: 'responses',
    }).chatMessagesStream({
      messages: [{ role: 'user', content: 'hello' }],
      onDelta: (_delta, fullText) => deltas.push(fullText),
    })

    expect(result).toBe('Hello')
    expect(deltas).toEqual(['Hel', 'Hello'])
  })

  it('parses line-delimited JSON response deltas with top-level content fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(streamFromText([
      '{"content":"{\\"action\\":\\"replace\\",","role":"assistant"}',
      '{"content":"\\"content\\":\\"新的内容\\"}","role":"assistant"}',
      '',
    ].join('\n')))))

    const deltas: string[] = []
    const result = await new AIService({
      ...providerConfig,
      openAIEndpoint: 'responses',
    }).chatMessagesStream({
      messages: [{ role: 'user', content: 'hello' }],
      onDelta: (_delta, fullText) => deltas.push(fullText),
    })

    expect(result).toBe('{"action":"replace","content":"新的内容"}')
    expect(deltas).toEqual([
      '{"action":"replace",',
      '{"action":"replace","content":"新的内容"}',
    ])
  })

  it('combines reasoning and answer in OpenAI Responses SSE streams', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(streamFromText([
      'event: response.reasoning.delta',
      'data: {"reasoning_content":"Plan. "}',
      '',
      'event: response.reasoning.delta',
      'data: {"reasoning_content":"Check."}',
      '',
      'event: response.output_text.delta',
      'data: {"delta":"Done"}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')))))
    const deltas: string[] = []

    const result = await new AIService({
      ...providerConfig,
      openAIEndpoint: 'responses',
    }).chatMessagesStream({
      messages: [{ role: 'user', content: 'hello' }],
      onDelta: (_delta, fullText) => deltas.push(fullText),
    })

    expect(result).toBe('<think>Plan. Check.</think>\n\nDone')
    expect(deltas).toEqual([
      '<think>Plan.</think>',
      '<think>Plan. Check.</think>',
      '<think>Plan. Check.</think>\n\nDone',
    ])
  })
})
