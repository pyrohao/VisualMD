import { describe, expect, it } from 'vitest'
import { buildAgentSystemPrompt, buildAgentToolsPrompt, buildAgentTranscript, parseAgentModelResponse, splitAssistantThinking, type AgentMessage } from '@/lib/agent'

describe('agent model', () => {
  it('renders messages as role XML in order', () => {
    const messages: AgentMessage[] = [
      { id: '1', conversationId: 'c', role: 'developer', message: 'dev', createdAt: 1 },
      { id: '2', conversationId: 'c', role: 'user', message: 'hello', createdAt: 2 },
      { id: '3', conversationId: 'c', role: 'assistant', message: 'hi', createdAt: 3 },
      { id: '4', conversationId: 'c', role: 'tool', message: '{"ok":true}', createdAt: 4, toolCallId: 't1', toolName: 'apply_tool' },
    ]

    expect(buildAgentTranscript(messages)).toBe([
      '<context>',
      '<system>dev</system>',
      '<user>hello</user>',
      '<assistant>hi</assistant>',
      '<tool id="t1" name="apply_tool">{&quot;ok&quot;:true}</tool>',
      '</context>',
    ].join('\n'))
  })

  it('parses tool JSON and treats invalid JSON as text', () => {
    const tool = parseAgentModelResponse('{"tool":"apply_tool","arguments":{"offset":{"start":1,"end":2},"newString":"b"}}')
    expect(tool.kind).toBe('tool')
    if (tool.kind === 'tool') {
      expect(tool.call.name).toBe('apply_tool')
      expect(tool.call.arguments).toEqual({ offset: { start: 1, end: 2 }, newString: 'b' })
    }

    expect(parseAgentModelResponse('{not json')).toEqual({ kind: 'text', text: '{not json' })
    expect(parseAgentModelResponse('```json\n{"tool":"apply_tool","arguments":{}}\n```').kind).toBe('tool')
  })

  it('parses document action JSON', () => {
    const parsed = parseAgentModelResponse('```json\n{"action":"replace","content":"新的内容"}\n```')

    expect(parsed.kind).toBe('action')
    if (parsed.kind === 'action') {
      expect(parsed.action).toEqual({
        action: 'replace',
        content: '新的内容',
      })
    }
  })

  it('extracts tool JSON when a model incorrectly prefixes text', () => {
    const parsed = parseAgentModelResponse(
      '好的，我来创建文档。\n{"tool":"generate_document_tool","arguments":{"fileName":"睡眠指南.md","prompt":"生成睡眠指南"}}'
    )

    expect(parsed.kind).toBe('tool')
    if (parsed.kind === 'tool') {
      expect(parsed.call.name).toBe('generate_document_tool')
      expect(parsed.call.arguments).toEqual({ fileName: '睡眠指南.md', prompt: '生成睡眠指南' })
    }
  })

  it('extracts tool JSON with braces inside string arguments', () => {
    const parsed = parseAgentModelResponse(
      'prefix {"tool":"apply_tool","arguments":{"offset":{"start":1,"end":4},"newString":"b { tricky } value"}} suffix'
    )

    expect(parsed.kind).toBe('tool')
    if (parsed.kind === 'tool') {
      expect(parsed.call.arguments.offset).toEqual({ start: 1, end: 4 })
    }
  })

  it('splits deepseek think blocks from assistant text', () => {
    expect(splitAssistantThinking('<think>reasoning</think>\nAnswer')).toEqual({
      thinking: 'reasoning',
      text: 'Answer',
    })
  })

  it('limits new document generation tool usage to explicit new file requests', () => {
    const prompt = buildAgentSystemPrompt([], {
      operatingSystem: 'Windows',
      browser: 'Chrome',
      timezone: 'Asia/Shanghai',
      language: 'zh-CN',
      today: '2026-06-18',
    })
    const toolsPrompt = buildAgentToolsPrompt([
      {
        name: 'generate_document_tool',
        description: 'Create and save a NEW Markdown file only when explicitly requested.',
        argumentsSchema: {
          type: 'object',
          description: 'Arguments for generating a brand-new Markdown document.',
          additionalProperties: false,
          properties: {
            fileName: {
              type: 'string',
              description: 'Required. Target Markdown file name. It must include the `.md` suffix.',
            },
            prompt: {
              type: 'string',
              description: 'Required. The instruction used to generate the new file content.',
            },
          },
          required: ['fileName', 'prompt'],
        },
        execute: async () => ({ ok: true, message: 'ok' }),
      },
    ])

    expect(prompt).toContain('Operating system: Windows')
    expect(prompt).toContain('Browser: Chrome')
    expect(prompt).toContain('Timezone: Asia/Shanghai')
    expect(prompt).toContain('Language: zh-CN')
    expect(prompt).toContain('Today: 2026-06-18')
    expect(prompt).toContain('base conversation policy')
    expect(toolsPrompt).toContain('For normal chat')
    expect(toolsPrompt).toContain('return only one JSON object')
    expect(toolsPrompt).toContain('Tool Definitions JSON')
    expect(toolsPrompt).toContain('"name": "generate_document_tool"')
    expect(toolsPrompt).toContain('"argumentsSchema"')
    expect(toolsPrompt).toContain('"fileName"')
    expect(toolsPrompt).toContain('must include the `.md` suffix')
  })
})
