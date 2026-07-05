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

  it('streams plain assistant text deltas incrementally', async () => {
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
        return '{"tool":"apply_tool","arguments":{"oldString":"x","newString":"y"}}'
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

    expect(deltas).toEqual(['Done'])
  })

  it('treats text-prefixed mixed output as plain assistant text', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream').mockImplementationOnce(async (options) => {
      options.onDelta?.('I will create it.\n', 'I will create it.\n')
      options.onDelta?.('{"tool"', 'I will create it.\n{"tool"')
      return 'I will create it.\n{"tool":"generate_document_tool","arguments":{"fileName":"Guide.md","prompt":"make a guide"}}'
    })
    const deltas: string[] = []
    const messages: AgentMessage[] = [
      { id: 'u1', conversationId: 'c1', role: 'user', message: 'Create a guide', createdAt: 1 },
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

    expect(deltas).toEqual([
      'I will create it.\n',
      'I will create it.\n{"tool"',
      'I will create it.\n{"tool":"generate_document_tool","arguments":{"fileName":"Guide.md","prompt":"make a guide"}}',
    ])
    expect(result.generatedFiles).toEqual([])
    expect(result.messages.at(-1)?.message).toContain('generate_document_tool')
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

  it('retries selected edits with document action JSON when the first reply is plain text', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockResolvedValueOnce('I updated it for you.')
      .mockResolvedValueOnce('{"action":"replace","content":"hello"}')
      .mockResolvedValueOnce('Completed')
    const messages: AgentMessage[] = [
      {
        id: 'u1',
        conversationId: 'c1',
        role: 'user',
        message: [
          'Task type: ask',
          'User request:',
          'Change this to hello',
          '',
          'Selected document text:',
          '<selected_text>',
          'Selected text',
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
      markdown: '# Title\n\nSelected text',
      selectedReference: {
        startOffset: 9,
        endOffset: 22,
        expectedText: 'Selected text',
      },
      maxTurns: 5,
    })

    expect(result.appliedMarkdown).toBe('# Title\n\nhello')
    expect(result.messages.some((message) => message.role === 'assistant' && message.message.includes('I updated it for you.'))).toBe(false)
    expect(result.messages.some((message) => message.role === 'tool' && message.error?.includes('Return only JSON like {"action":"replace","content":"..."}'))).toBe(true)
  })

  it('consumes direct document replace action JSON', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockResolvedValueOnce('{"action":"replace","content":"New title"}')
      .mockResolvedValueOnce('Completed')
    const messages: AgentMessage[] = [
      {
        id: 'u1',
        conversationId: 'c1',
        role: 'user',
        message: [
          'Task type: rewrite',
          'User request:',
          'Update the selected heading',
          '',
          'Selected document text:',
          '<selected_text>',
          'Old title',
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
      markdown: '# Old title\n\nBody',
      selectedReference: {
        startOffset: 2,
        endOffset: 11,
        expectedText: 'Old title',
      },
      maxTurns: 5,
    })

    expect(result.appliedMarkdown).toBe('# New title\n\nBody')
    expect(result.messages.some((message) => message.toolName === 'document_action' && message.role === 'tool' && message.state === 'done')).toBe(true)
    expect(result.messages.at(-1)?.message).toBe('Completed')
  })

  it('consumes append action JSON and appends content to document end', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockResolvedValueOnce('{"action":"append","content":"## New Section\\n\\nMore content"}')
      .mockResolvedValueOnce('Appended')
    const messages: AgentMessage[] = [
      {
        id: 'u1',
        conversationId: 'c1',
        role: 'user',
        message: [
          'Task type: ask',
          'User request:',
          'Append a new section at the end',
          '',
          'Selected document text:',
          'None',
        ].join('\n'),
        createdAt: 1,
      },
    ]

    const result = await runAgentReActLoop({
      providerConfig,
      apiKey: 'test',
      messages,
      tools: createDefaultAgentTools(),
      markdown: '# Document\n\nCurrent content',
      maxTurns: 5,
    })

    expect(result.appliedMarkdown).toBe('# Document\n\nCurrent content\n\n## New Section\n\nMore content\n')
    expect(result.messages.some((message) => message.toolName === 'document_action' && message.role === 'tool' && message.state === 'done')).toBe(true)
    expect(result.messages.at(-1)?.message).toBe('Appended')
  })

  it('uses find recovery after an apply failure', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockResolvedValueOnce('{"tool":"apply_tool","arguments":{"oldString":"old text","newString":"new text"}}')
      .mockResolvedValueOnce('{"tool":"find_tool","arguments":{"query":"Visual markdown paragraph."}}')
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

  it('allows a natural text confirmation after generate_document_tool succeeds', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream')
      .mockResolvedValueOnce('{"tool":"generate_document_tool","arguments":{"prompt":"make test3","fileName":"test3.md"}}')
      .mockResolvedValueOnce('# Test3')
      .mockResolvedValueOnce('Generated test3')

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

    expect(result.generatedFiles).toHaveLength(1)
    expect(result.generatedFiles[0]?.fileName).toBe('test3.md')
    expect(result.messages.at(-1)?.message).toBe('Generated test3')
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
      '{"tool":"find_tool","arguments":{"query":"x"}}'
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
