import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIService } from '@/lib/ai-service'
import { createDefaultAgentTools, runAgentReActLoop, type AgentMessage } from '@/lib/agent'
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
    expect(result.messages.some((message) => message.role === 'tool')).toBe(true)
    expect(result.messages.find((message) => message.role === 'assistant' && message.toolName)?.message).toContain('"argumentKeys"')
    expect(result.messages.find((message) => message.role === 'assistant' && message.toolName)?.message).not.toContain('"old"')
    expect(result.messages.find((message) => message.role === 'tool')?.message).not.toContain('nextMarkdown')
    expect(result.messages.at(-1)?.message).toBe('Applied')
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
      .mockResolvedValueOnce('Generated')
    vi.spyOn(AIService.prototype, 'generateMarkdown').mockResolvedValueOnce({
      success: true,
      content: '# Agent Doc',
      fileName: 'Generated.md',
    })
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
    })

    expect(result.generatedFiles).toEqual([
      expect.objectContaining({
        fileName: 'Agent.md',
        content: '# Agent Doc',
      }),
    ])
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
