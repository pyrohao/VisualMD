/**
 * AI服务模块
 *
 * 提供统一的AI调用接口，支持OpenAI兼容格式
 * - 多提供商支持
 * - 提示词模板管理
 * - 错误处理
 */

import type { ProviderConfig } from '@/stores/settingsStore'

/**
 * 生成选项
 */
export interface AIGenerateOptions {
  /** 用户提示词 */
  prompt: string
  /** 系统提示词（可选） */
  systemPrompt?: string
  /** 温度参数 */
  temperature?: number
  /** 最大token数 */
  maxTokens?: number
}

export interface AIChatOptions {
  prompt: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface AIChatMessagesOptions {
  messages: AIMessage[]
  temperature?: number
  maxTokens?: number
}

export interface AIChatMessagesStreamOptions extends AIChatMessagesOptions {
  onDelta?: (delta: string, fullText: string) => void
  signal?: AbortSignal
}

/**
 * 生成结果
 */
export interface AIGenerateResult {
  /** 生成的内容 */
  content: string
  /** 文件名（从 Metadata 提取） */
  fileName: string
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}

export interface AIModelInfo {
  id: string
  name?: string
  contextLength?: number
}

export type ResolvedAIEndpoint = 'chat-completions' | 'responses' | 'anthropic-messages'

async function createApiError(response: Response) {
  const errorData = await response.json().catch(() => ({}))
  const message = errorData.error?.message || response.statusText

  if (response.status === 429) {
    return new Error(`Rate limit exceeded: ${message}`)
  }

  if (response.status === 500 || response.status === 503) {
    return new Error(`AI service unavailable (${response.status}): ${message}`)
  }

  return new Error(message || `请求失败: ${response.status} ${response.statusText}`)
}

function createNetworkFetchError(error: unknown, url: string) {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (lower.includes('failed to fetch') || lower.includes('load failed') || lower.includes('networkerror')) {
    return new Error(
      `浏览器无法访问 AI 服务。可能是 CORS 跨域限制、网络阻断或 API Base URL 不正确。` +
      `请确认服务端允许当前站点跨域访问，并允许 Authorization、Content-Type、POST、OPTIONS。请求地址：${url}`
    )
  }

  return error instanceof Error ? error : new Error(message)
}

async function fetchAI(url: string, init: RequestInit) {
  try {
    return await fetch(url, init)
  } catch (error) {
    throw createNetworkFetchError(error, url)
  }
}

function joinApiUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function normalizeModelTextContent(value: any): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (typeof item?.text === 'string') return item.text
        if (typeof item?.content === 'string') return item.content
        return ''
      })
      .join('')
  }
  return ''
}

function combineReasoningAndAnswer(reasoning: string, answer: string) {
  const trimmedReasoning = reasoning.trim()
  const trimmedAnswer = answer.trim()

  if (trimmedReasoning && trimmedAnswer) {
    return `<think>${trimmedReasoning}</think>\n\n${trimmedAnswer}`
  }

  if (trimmedReasoning) {
    return `<think>${trimmedReasoning}</think>`
  }

  return trimmedAnswer
}

function buildStreamedAssistantText(reasoning: string, answer: string) {
  return combineReasoningAndAnswer(reasoning, answer)
}

function extractChatCompletionsStreamDelta(data: any) {
  return {
    reasoningDelta: normalizeModelTextContent(
      data.choices?.[0]?.delta?.reasoning_content ?? data.reasoning_content ?? data.reasoning?.text
    ),
    contentDelta: normalizeModelTextContent(
      data.choices?.[0]?.delta?.content ?? data.content ?? data.message?.content ?? data.text
    ),
  }
}

function extractResponsesStreamDelta(data: any) {
  return {
    reasoningDelta: normalizeModelTextContent(
      data.reasoning_content ?? data.reasoning?.text ?? data.delta?.reasoning_content ?? data.reasoning
    ),
    contentDelta: normalizeModelTextContent(
      data.delta?.content ?? data.delta ?? data.text ?? data.output_text ?? data.content ?? data.message?.content
    ),
  }
}

function parseStreamPayloadLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('event:') || trimmed.startsWith(':')) {
    return null
  }

  if (trimmed.startsWith('data:')) {
    return trimmed.slice(5).trim()
  }

  return trimmed
}

function extractOpenAIContent(data: any) {
  const message = data.choices?.[0]?.message
  return combineReasoningAndAnswer(
    normalizeModelTextContent(message?.reasoning_content),
    normalizeModelTextContent(message?.content)
  )
}

function extractOpenAIResponsesContent(data: any) {
  if (typeof data.output_text === 'string') return data.output_text
  if (Array.isArray(data.output)) {
    return data.output
      .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      .map((item: any) => typeof item?.text === 'string' ? item.text : '')
      .join('')
  }
  return ''
}

function extractAnthropicContent(data: any) {
  if (typeof data.content === 'string') return data.content
  if (Array.isArray(data.content)) {
    return data.content
      .map((item: { text?: unknown } | null | undefined) => typeof item?.text === 'string' ? item.text : '')
      .join('')
  }
  return ''
}

function toResponseInput(messages: AIMessage[]) {
  return messages.map((message) => ({
    role: message.role === 'system' ? 'developer' : message.role === 'tool' ? 'user' : message.role,
    content: message.role === 'tool' ? `<tool>${message.content}</tool>` : message.content,
  }))
}

/**
 * 系统提示词模板
 * 指导AI生成符合要求的Markdown文档
 */
const DEFAULT_SYSTEM_PROMPT = `You are a professional Markdown document generation assistant.
Please generate well-formatted, well-structured Markdown documents based on the user's description.

## Requirements

1. **Document Structure**
   - Start with Metadata (YAML Front Matter), including title, date, and description fields
   - Use appropriate heading levels (H1-H6), with H1 as the main document title
   - Clear hierarchy and logical structure

2. **Formatting Standards**
   - Use standard Markdown syntax (GFM)
   - Use lists, tables, code blocks, etc. appropriately to enhance readability
   - Code blocks should specify the language type

3. **Content Quality**
   - Complete content covering all points mentioned in the user's description
   - Fluent language with accurate use of professional terminology
   - Add examples where appropriate

4. **Output Format Example**

\`\`\`markdown
---
title: Document Title
date: 2024-01-15
description: Document description
---

# Document Title

## Section 1

Content...

## Section 2

Content...
\`\`\`

## Important Notes

- Output only Markdown content, without any explanatory text
- Ensure correct Metadata (YAML Front Matter) format
- Document title must match the title in Metadata
- **Language Detection**: Analyze the user's input language and respond in the same language. If the user writes in Chinese, respond in Chinese; if in English, respond in English; if in other languages, respond in that language.`

/**
 * AI服务类
 */
export class AIService {
  private config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  /**
   * 生成Markdown文档
   */
  async generateMarkdown(options: AIGenerateOptions): Promise<AIGenerateResult> {
    const { prompt, systemPrompt, temperature, maxTokens } = options

    try {
      const response = await this.callOpenAIAPI({
        prompt,
        systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
        temperature: temperature ?? this.config.temperature,
        maxTokens: maxTokens ?? this.config.maxTokens,
      })

      // 提取文件名
      const fileName = this.extractFileName(response)

      return {
        content: response,
        fileName,
        success: true,
      }
    } catch (error) {
      return {
        content: '',
        fileName: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      }
    }
  }

  async chatDocument(options: AIChatOptions): Promise<string> {
    const { prompt, systemPrompt, temperature, maxTokens } = options

    return this.callOpenAIAPI({
      prompt,
      systemPrompt: systemPrompt || 'Return concise and accurate answers.',
      temperature: temperature ?? this.config.temperature,
      maxTokens: maxTokens ?? this.config.maxTokens,
    })
  }

  async chatMessages(options: AIChatMessagesOptions): Promise<string> {
    const { messages, temperature, maxTokens } = options

    return this.callOpenAIAPI({
      messages,
      temperature: temperature ?? this.config.temperature,
      maxTokens: maxTokens ?? this.config.maxTokens,
    })
  }

  async chatMessagesStream(options: AIChatMessagesStreamOptions): Promise<string> {
    const { messages, temperature, maxTokens, onDelta, signal } = options

    return this.callOpenAIAPIStream({
      messages,
      temperature: temperature ?? this.config.temperature,
      maxTokens: maxTokens ?? this.config.maxTokens,
      onDelta,
      signal,
    })
  }

  /**
   * 调用OpenAI兼容API
   */
  private async callOpenAIAPI(options: {
    prompt?: string
    systemPrompt?: string
    messages?: AIMessage[]
    temperature: number
    maxTokens: number
  }): Promise<string> {
    if (this.config.protocol === 'anthropic-compatible') {
      return this.callAnthropicAPI(options)
    }

    if (this.config.openAIEndpoint === 'responses') {
      return this.callOpenAIResponsesAPI(options)
    }

    if (this.config.openAIEndpoint === 'auto') {
      try {
        return await this.callOpenAIChatCompletionsAPI(options)
      } catch (error) {
        return this.callOpenAIResponsesAPI(options)
      }
    }

    return this.callOpenAIChatCompletionsAPI(options)
  }

  private async callOpenAIChatCompletionsAPI(options: {
    prompt?: string
    systemPrompt?: string
    messages?: AIMessage[]
    temperature: number
    maxTokens: number
  }): Promise<string> {
    const { prompt, systemPrompt, messages, temperature, maxTokens } = options

    const url = joinApiUrl(this.config.baseUrl, '/chat/completions')
    
    const headers = this.createHeaders()

    const body = {
      model: this.config.model,
      messages: messages || [
        { role: 'system', content: systemPrompt || '' },
        { role: 'user', content: prompt || '' },
      ],
      temperature,
      max_tokens: maxTokens,
    }

    const response = await fetchAI(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw await createApiError(response)
    }

    const data = await response.json()
    const content = extractOpenAIContent(data)

    if (!content) {
      throw new Error('API返回内容为空')
    }

    return content
  }

  private async callOpenAIResponsesAPI(options: {
    prompt?: string
    systemPrompt?: string
    messages?: AIMessage[]
    temperature: number
    maxTokens: number
  }): Promise<string> {
    const { prompt, systemPrompt, messages, temperature, maxTokens } = options
    const input = toResponseInput(messages || [
      { role: 'system', content: systemPrompt || '' },
      { role: 'user', content: prompt || '' },
    ])

    const url = joinApiUrl(this.config.baseUrl, '/responses')
    const response = await fetchAI(url, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        input,
        temperature,
        max_output_tokens: maxTokens,
      }),
    })

    if (!response.ok) {
      throw await createApiError(response)
    }

    const data = await response.json()
    const content = extractOpenAIResponsesContent(data)
    if (!content) {
      throw new Error('API返回内容为空')
    }
    return content
  }

  private createHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.customHeaders,
    }

    if (this.config.authType === 'x-api-key' || this.config.protocol === 'anthropic-compatible') {
      headers['x-api-key'] = this.config.apiKey
      headers['anthropic-version'] = this.config.customHeaders?.['anthropic-version'] || '2023-06-01'
      return headers
    }

    headers.Authorization = `Bearer ${this.config.apiKey}`
    return headers
  }

  private toAnthropicMessages(messages: AIMessage[]) {
    let system = ''
    const converted: { role: 'user' | 'assistant'; content: string }[] = []

    messages.forEach((message) => {
      if (message.role === 'system') {
        system = system ? `${system}\n\n${message.content}` : message.content
        return
      }

      if (message.role === 'tool') {
        converted.push({ role: 'user', content: `<tool>${message.content}</tool>` })
        return
      }

      converted.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })
    })

    return { system, messages: converted }
  }

  private async callAnthropicAPI(options: {
    prompt?: string
    systemPrompt?: string
    messages?: AIMessage[]
    temperature: number
    maxTokens: number
  }): Promise<string> {
    const { prompt, systemPrompt, messages, temperature, maxTokens } = options
    const anthropicMessages = this.toAnthropicMessages(messages || [
      { role: 'system', content: systemPrompt || '' },
      { role: 'user', content: prompt || '' },
    ])

    const url = joinApiUrl(this.config.baseUrl, '/messages')
    const response = await fetchAI(url, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        system: anthropicMessages.system || undefined,
        messages: anthropicMessages.messages,
        temperature,
        max_tokens: maxTokens,
      }),
    })

    if (!response.ok) {
      throw await createApiError(response)
    }

    const data = await response.json()
    const content = extractAnthropicContent(data)
    if (!content) {
      throw new Error('API返回内容为空')
    }
    return content
  }

  private async callOpenAIAPIStream(options: {
    messages: AIMessage[]
    temperature: number
    maxTokens: number
    onDelta?: (delta: string, fullText: string) => void
    signal?: AbortSignal
  }): Promise<string> {
    if (this.config.protocol === 'anthropic-compatible') {
      return this.callAnthropicAPIStream(options)
    }

    if (this.config.openAIEndpoint === 'responses') {
      return this.callOpenAIResponsesAPIStream(options)
    }

    if (this.config.openAIEndpoint === 'auto') {
      try {
        return await this.callOpenAIChatCompletionsAPIStream(options)
      } catch (error) {
        return this.callOpenAIResponsesAPIStream(options)
      }
    }

    return this.callOpenAIChatCompletionsAPIStream(options)
  }

  private async callOpenAIChatCompletionsAPIStream(options: {
    messages: AIMessage[]
    temperature: number
    maxTokens: number
    onDelta?: (delta: string, fullText: string) => void
    signal?: AbortSignal
  }): Promise<string> {
    const { messages, temperature, maxTokens, onDelta, signal } = options
    const url = joinApiUrl(this.config.baseUrl, '/chat/completions')
    const headers = this.createHeaders()

    const response = await fetchAI(url, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    })

    if (!response.ok) {
      throw await createApiError(response)
    }

    if (!response.body) {
      return this.chatMessages({ messages, temperature, maxTokens })
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let reasoningText = ''
    let answerText = ''

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (error) {
        throw new Error(`Stream connection interrupted: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
      const { value, done } = chunk
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        const payload = parseStreamPayloadLine(line)
        if (!payload) continue
        if (payload === '[DONE]') {
          return buildStreamedAssistantText(reasoningText, answerText)
        }

        try {
          const data = JSON.parse(payload)
          const { contentDelta, reasoningDelta } = extractChatCompletionsStreamDelta(data)
          if (reasoningDelta) {
            reasoningText += reasoningDelta
          }
          if (contentDelta) {
            answerText += contentDelta
          }

          const nextFullText = buildStreamedAssistantText(reasoningText, answerText)
          if (nextFullText) {
            onDelta?.(contentDelta || reasoningDelta, nextFullText)
          }
        } catch {
          continue
        }
      }
    }

    const trailingPayload = parseStreamPayloadLine(buffer)
    if (trailingPayload && trailingPayload !== '[DONE]') {
      try {
        const data = JSON.parse(trailingPayload)
        const { contentDelta, reasoningDelta } = extractChatCompletionsStreamDelta(data)
        if (reasoningDelta) {
          reasoningText += reasoningDelta
        }
        if (contentDelta) {
          answerText += contentDelta
        }
        const nextFullText = buildStreamedAssistantText(reasoningText, answerText)
        if (nextFullText) {
          onDelta?.(contentDelta || reasoningDelta, nextFullText)
        }
      } catch {
        // Ignore malformed trailing payloads.
      }
    }

    const fullText = buildStreamedAssistantText(reasoningText, answerText)
    if (!fullText) {
      throw new Error('API返回内容为空')
    }

    return fullText
  }

  private async callOpenAIResponsesAPIStream(options: {
    messages: AIMessage[]
    temperature: number
    maxTokens: number
    onDelta?: (delta: string, fullText: string) => void
    signal?: AbortSignal
  }): Promise<string> {
    const { messages, temperature, maxTokens, onDelta, signal } = options
    const url = joinApiUrl(this.config.baseUrl, '/responses')
    const response = await fetchAI(url, {
      method: 'POST',
      headers: this.createHeaders(),
      signal,
      body: JSON.stringify({
        model: this.config.model,
        input: toResponseInput(messages),
        temperature,
        max_output_tokens: maxTokens,
        stream: true,
      }),
    })

    if (!response.ok) {
      throw await createApiError(response)
    }

    if (!response.body) {
      return this.chatMessages({ messages, temperature, maxTokens })
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let reasoningText = ''
    let answerText = ''

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (error) {
        throw new Error(`Stream connection interrupted: ${error instanceof Error ? error.message : 'unknown error'}`)
      }
      const { value, done } = chunk
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        const payload = parseStreamPayloadLine(line)
        if (!payload) continue
        if (payload === '[DONE]') {
          return buildStreamedAssistantText(reasoningText, answerText)
        }

        try {
          const data = JSON.parse(payload)
          const { contentDelta, reasoningDelta } = extractResponsesStreamDelta(data)
          if (reasoningDelta) {
            reasoningText += reasoningDelta
          }
          if (contentDelta) {
            answerText += contentDelta
          }

          const nextFullText = buildStreamedAssistantText(reasoningText, answerText)
          if (nextFullText) {
            onDelta?.(contentDelta || reasoningDelta, nextFullText)
          }
        } catch {
          continue
        }
      }
    }

    const trailingPayload = parseStreamPayloadLine(buffer)
    if (trailingPayload && trailingPayload !== '[DONE]') {
      try {
        const data = JSON.parse(trailingPayload)
        const { contentDelta, reasoningDelta } = extractResponsesStreamDelta(data)
        if (reasoningDelta) {
          reasoningText += reasoningDelta
        }
        if (contentDelta) {
          answerText += contentDelta
        }
        const nextFullText = buildStreamedAssistantText(reasoningText, answerText)
        if (nextFullText) {
          onDelta?.(contentDelta || reasoningDelta, nextFullText)
        }
      } catch {
        // Ignore malformed trailing payloads.
      }
    }

    const fullText = buildStreamedAssistantText(reasoningText, answerText)
    if (!fullText) {
      throw new Error('API返回内容为空')
    }

    return fullText
  }

  private async callAnthropicAPIStream(options: {
    messages: AIMessage[]
    temperature: number
    maxTokens: number
    onDelta?: (delta: string, fullText: string) => void
    signal?: AbortSignal
  }): Promise<string> {
    const { messages, temperature, maxTokens, onDelta, signal } = options
    const anthropicMessages = this.toAnthropicMessages(messages)
    const url = joinApiUrl(this.config.baseUrl, '/messages')
    const response = await fetchAI(url, {
      method: 'POST',
      headers: this.createHeaders(),
      signal,
      body: JSON.stringify({
        model: this.config.model,
        system: anthropicMessages.system || undefined,
        messages: anthropicMessages.messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    })

    if (!response.ok) {
      throw await createApiError(response)
    }

    if (!response.body) {
      return this.chatMessages({ messages, temperature, maxTokens })
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (error) {
        throw new Error(`Stream connection interrupted: ${error instanceof Error ? error.message : 'unknown error'}`)
      }

      const { value, done } = chunk
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() || ''

      for (const eventBlock of events) {
        const dataLine = eventBlock
          .split(/\r?\n/)
          .find((line) => line.trim().startsWith('data:'))
        if (!dataLine) continue

        const payload = dataLine.trim().slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        try {
          const data = JSON.parse(payload)
          const delta = data.delta?.text || ''
          if (delta) {
            fullText += delta
            onDelta?.(delta, fullText)
          }
        } catch {
          continue
        }
      }
    }

    if (!fullText) {
      throw new Error('API返回内容为空')
    }

    return fullText
  }

  async listModels(): Promise<AIModelInfo[]> {
    if (this.config.modelDiscovery.type === 'none') {
      return []
    }

    const url = joinApiUrl(this.config.baseUrl, this.config.modelDiscovery.path || '/models')
    const response = await fetchAI(url, {
      method: 'GET',
      headers: this.createHeaders(),
    })

    if (!response.ok) {
      throw await createApiError(response)
    }

    const data = await response.json()
    const records = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.models)
        ? data.models
        : Array.isArray(data)
          ? data
          : []

    return records
      .map((item: any) => {
        const id = typeof item === 'string' ? item : item?.id || item?.name
        if (!id || typeof id !== 'string') return null
        return {
          id,
          name: typeof item?.display_name === 'string' ? item.display_name : typeof item?.name === 'string' ? item.name : id,
          contextLength: typeof item?.context_length === 'number'
            ? item.context_length
            : typeof item?.context_window === 'number'
              ? item.context_window
              : undefined,
        } satisfies AIModelInfo
      })
      .filter((item: AIModelInfo | null): item is AIModelInfo => Boolean(item))
  }

  /**
   * 从生成的内容中提取文件名
   * 优先从 Metadata 的 title 字段提取
   */
  private extractFileName(content: string): string {
    // 尝试从 Metadata (YAML Front Matter) 提取 title
    const frontMatterMatch = content.match(/^---\s*\n[\s\S]*?title:\s*(.+?)\s*\n[\s\S]*?---/)
    if (frontMatterMatch) {
      const title = frontMatterMatch[1].trim()
      // 清理非法字符
      const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_')
      return `${safeTitle}.md`
    }

    // 尝试从H1标题提取
    const h1Match = content.match(/^#\s+(.+)$/m)
    if (h1Match) {
      const title = h1Match[1].trim()
      const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_')
      return `${safeTitle}.md`
    }

    // 默认文件名
    return `AI生成文档-${new Date().toISOString().slice(0, 10)}.md`
  }

  /**
   * 验证配置是否有效
   */
  validateConfig(): boolean {
    return !!(
      this.config.apiKey &&
      this.config.baseUrl &&
      this.config.model
    )
  }

  /**
   * 测试连接
   */
  private async testOpenAIEndpoint(endpoint: 'chat-completions' | 'responses') {
    const options = {
      prompt: 'Hello',
      systemPrompt: 'Reply with "OK" only.',
      temperature: 0,
      maxTokens: 10,
    }

    if (endpoint === 'responses') {
      return this.callOpenAIResponsesAPI(options)
    }
    return this.callOpenAIChatCompletionsAPI(options)
  }

  async testConnection(): Promise<{ success: boolean; message: string; endpoint?: ResolvedAIEndpoint }> {
    try {
      if (this.config.protocol === 'anthropic-compatible') {
        await this.callAnthropicAPI({
          prompt: 'Hello',
          systemPrompt: 'Reply with "OK" only.',
          temperature: 0,
          maxTokens: 10,
        })

        return {
          success: true,
          message: '连接成功',
          endpoint: 'anthropic-messages',
        }
      }

      if (this.config.openAIEndpoint === 'responses') {
        await this.testOpenAIEndpoint('responses')
        return {
          success: true,
          message: '连接成功（Responses）',
          endpoint: 'responses',
        }
      }

      try {
        await this.testOpenAIEndpoint('chat-completions')
        return {
          success: true,
          message: '连接成功（Chat Completions）',
          endpoint: 'chat-completions',
        }
      } catch {
        await this.testOpenAIEndpoint('responses')
        return {
          success: true,
          message: '连接成功（Responses）',
          endpoint: 'responses',
        }
      }

    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败',
      }
    }
  }
}

/**
 * 创建AI服务实例
 */
export function createAIService(config: ProviderConfig): AIService {
  return new AIService(config)
}

export default AIService
