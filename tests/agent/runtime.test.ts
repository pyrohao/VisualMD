import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIService } from '@/lib/ai-service'
import { createDefaultAgentTools, runAgentReActLoop, type AgentMessage } from '@/lib/agent'
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

describe('agent runtime', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('stores assistant text and stops', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream').mockResolvedValueOnce('Done')
    const messages: AgentMessage[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', message: 'hello', createdAt: 1 },
    ]

    const result = await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: 'abc',
      maxTurns: 5,
    })

    expect(result.stoppedBecause).toBe('assistant-text')
    expect(result.messages.at(-1)?.message).toBe('Done')
  })

  it('streams plain assistant text deltas only', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream').mockImplementationOnce(async (options) => {
      options.onDelta?.('He', 'He')
      options.onDelta?.('llo', 'Hello')
      return 'Hello'
    })
    const deltas: string[] = []
    const messages: AgentMessage[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', message: 'hello', createdAt: 1 },
    ]

    const result = await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: 'abc',
      maxTurns: 5,
      onAssistantTextDelta: (text) => deltas.push(text),
    })

    expect(deltas).toEqual(['He', 'Hello'])
    expect(result.messages.at(-1)?.message).toBe('Hello')
  })

  it('does not stream tool JSON to the user', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockImplementationOnce(async (options) => {
        options.onDelta?.('{', '{')
        options.onDelta?.('"tool"', '{"tool"')
        return '{"tool":"semantic_tool","arguments":{"query":"x"}}'
      })
      .mockResolvedValueOnce('Done')
    const deltas: string[] = []
    const messages: AgentMessage[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', message: 'hello', createdAt: 1 },
    ]

    await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: 'x',
      maxTurns: 5,
      onAssistantTextDelta: (text) => deltas.push(text),
    })

    expect(deltas).toEqual([])
  })

  it('does not stream prefixed generate-document tool text to the chat bubble', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockImplementationOnce(async (options) => {
        options.onDelta?.('好的，我来创建文档。', '好的，我来创建文档。')
        options.onDelta?.('{"tool"', '好的，我来创建文档。{"tool"')
        return '好的，我来创建文档。\n{"tool":"generate_document_tool","arguments":{"fileName":"Guide.md","prompt":"make a guide"}}'
      })
      .mockResolvedValueOnce('# Guide')
      .mockImplementationOnce(async (options) => {
        options.onDelta?.('已生成', '已生成')
        return '已生成'
      })
    const deltas: string[] = []
    const messages: AgentMessage[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', message: 'User request:\n帮我生成一份指南', createdAt: 1 },
    ]

    const result = await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: '',
      maxTurns: 5,
      onAssistantTextDelta: (text) => deltas.push(text),
    })

    expect(deltas).toEqual(['已生成'])
    expect(result.generatedFiles[0]?.fileName).toBe('Guide.md')
  })

  it('executes tool calls and continues to final text', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockResolvedValueOnce('{"tool":"apply_tool","arguments":{"oldString":"old","newString":"new"}}')
      .mockResolvedValueOnce('Applied')
    const messages: AgentMessage[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', message: 'replace', createdAt: 1 },
    ]

    const result = await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: 'old',
      maxTurns: 5,
    })

    expect(result.appliedMarkdown).toBe('new')
    expect(result.appliedTools).toEqual([
      { toolCallId: expect.any(String), previousMarkdown: 'old', appliedMarkdown: 'new' },
    ])
    expect(result.messages.some((message) => message.role === 'tool')).toBe(true)
    expect(result.messages.find((message) => message.role === 'assistant' && message.toolName)?.message).toContain('"argumentKeys"')
    expect(result.messages.find((message) => message.role === 'assistant' && message.toolName)?.message).not.toContain('"old"')
    expect(result.messages.find((message) => message.role === 'tool')?.message).not.toContain('nextMarkdown')
    expect(result.messages.at(-1)?.message).toBe('Applied')
  })

  it('retries with apply_tool when an edit request gets plain text instead of tool JSON', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockResolvedValueOnce('已成功将内容修改为你好。')
      .mockResolvedValueOnce('{"tool":"apply_tool","arguments":{"oldString":"工具调用测试内容","newString":"你好"}}')
      .mockResolvedValueOnce('已完成')
    const messages: AgentMessage[] = [
      {
        id: 'u1',
        conversationId: 'c1',
        role: 'user',
        message: [
          'Task type: ask',
          'User request:',
          '把这里修改为你好',
          '',
          'Selected document text:',
          '<selected_text>',
          '工具调用测试内容',
          '</selected_text>',
        ].join('\n'),
        createdAt: 1,
      },
    ]

    const result = await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: '# 测试章节\n\n工具调用测试内容',
      maxTurns: 5,
    })

    expect(result.appliedMarkdown).toBe('# 测试章节\n\n你好')
    expect(result.messages.some((message) => message.role === 'assistant' && message.message.includes('已成功将内容修改'))).toBe(false)
    expect(result.messages.some((message) => message.role === 'tool' && message.error?.includes('Return apply_tool JSON'))).toBe(true)
  })

  it('uses semantic recovery after an apply failure', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockResolvedValueOnce('{"tool":"apply_tool","arguments":{"oldString":"old text","newString":"new text"}}')
      .mockResolvedValueOnce('{"tool":"semantic_tool","arguments":{"query":"visual markdown paragraph"}}')
      .mockResolvedValueOnce('{"tool":"apply_tool","arguments":{"oldString":"Visual markdown paragraph.","newString":"New visual markdown paragraph."}}')
      .mockResolvedValueOnce('Recovered')
    const messages: AgentMessage[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', message: 'replace', createdAt: 1 },
    ]

    const result = await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: 'Visual markdown paragraph.',
      maxTurns: 5,
    })

    expect(result.appliedMarkdown).toBe('New visual markdown paragraph.')
    expect(result.messages.filter((message) => message.role === 'tool')).toHaveLength(3)
    expect(result.messages.some((message) => message.message.includes('New visual markdown paragraph.'))).toBe(false)
    expect(result.messages.some((message) => message.role === 'tool' && message.message.includes('Visual markdown paragraph.'))).toBe(false)
    expect(result.messages.at(-1)?.message).toBe('Recovered')
  })

  it('executes generate_document_tool and returns generated files', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockResolvedValueOnce('{"tool":"generate_document_tool","arguments":{"prompt":"make a doc","fileName":"Agent.md"}}')
      .mockImplementationOnce(async (options) => {
        options.onDelta?.('# Agent', '# Agent')
        options.onDelta?.(' Doc', '# Agent Doc')
        return '# Agent Doc'
      })
      .mockResolvedValueOnce('Generated')
    const events: any[] = []
    const messages: AgentMessage[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', message: 'generate', createdAt: 1 },
    ]

    const result = await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: '',
      maxTurns: 5,
      onGeneratedDocumentEvent: (event) => events.push(event),
    })

    expect(result.generatedFiles).toEqual([
      expect.objectContaining({
        fileName: 'Agent.md',
        content: '# Agent Doc',
      }),
    ])
    expect(events.map((event) => event.type)).toEqual(['start', 'delta', 'delta', 'done'])
    expect(result.messages.find((message) => message.role === 'tool')?.message).not.toContain('# Agent Doc')
    expect(result.messages.at(-1)?.message).toBe('Generated')
  })

  it('stops on unknown tools', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream').mockResolvedValueOnce(
      '{"tool":"missing_tool","arguments":{}}'
    )
    const messages: AgentMessage[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', message: 'bad tool', createdAt: 1 },
    ]

    const result = await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: 'x',
      maxTurns: 5,
    })

    expect(result.stoppedBecause).toBe('invalid-tool')
    expect(result.messages.at(-1)?.role).toBe('tool')
    expect(result.messages.at(-1)?.state).toBe('failed')
  })

  it('stops after the tool loop limit', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream').mockResolvedValue(
      '{"tool":"semantic_tool","arguments":{"query":"x"}}'
    )
    const messages: AgentMessage[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', message: 'loop', createdAt: 1 },
    ]

    const result = await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: 'x',
      maxTurns: 2,
    })

    expect(result.stoppedBecause).toBe('tool-limit')
    expect(result.messages.at(-1)?.state).toBe('failed')
  })
})
