import { describe, expect, it } from 'vitest'
import { buildAgentSystemPrompt, buildAgentTranscript, parseAgentModelResponse, splitAssistantThinking, type AgentMessage } from '@/lib/agent'

describe('agent model', () => {
  it('renders messages as role XML in order', () => {
    const messages: AgentMessage[] = [
      { id: '1', conversationId: 'c', role: 'developer', message: 'dev', createdAt: 1 },
      { id: '2', conversationId: 'c', role: 'user', message: 'hello', createdAt: 2 },
      { id: '3', conversationId: 'c', role: 'assistant', message: 'hi', createdAt: 3 },
      { id: '4', conversationId: 'c', role: 'tool', message: '{"ok":true}', createdAt: 4, toolCallId: 't1', toolName: 'apply_tool' },
    ]

    expect(buildAgentTranscript(messages)).toBe([
      '<system>dev</system>',
      '<user>hello</user>',
      '<assistant>hi</assistant>',
      '<tool id="t1" name="apply_tool">{&quot;ok&quot;:true}</tool>',
    ].join('\n'))
  })

  it('parses tool JSON and treats invalid JSON as text', () => {
    const tool = parseAgentModelResponse('{"tool":"apply_tool","arguments":{"oldString":"a","newString":"b"}}')
    expect(tool.kind).toBe('tool')
    if (tool.kind === 'tool') {
      expect(tool.call.name).toBe('apply_tool')
      expect(tool.call.arguments).toEqual({ oldString: 'a', newString: 'b' })
    }

    expect(parseAgentModelResponse('{not json')).toEqual({ kind: 'text', text: '{not json' })
    expect(parseAgentModelResponse('```json\n{"tool":"apply_tool","arguments":{}}\n```').kind).toBe('text')
  })

  it('splits deepseek think blocks from assistant text', () => {
    expect(splitAssistantThinking('<think>reasoning</think>\nAnswer')).toEqual({
      thinking: 'reasoning',
      text: 'Answer',
    })
  })

  it('limits new document generation tool usage to explicit new file requests', () => {
    const prompt = buildAgentSystemPrompt([
      'generate_document_tool: Create and save a NEW Markdown file only when explicitly requested.',
    ], {
      operatingSystem: 'Windows',
      browser: 'Chrome',
      timezone: 'Asia/Shanghai',
      language: 'zh-CN',
      today: '2026-06-18',
    })

    expect(prompt).toContain('Operating system: Windows')
    expect(prompt).toContain('Browser: Chrome')
    expect(prompt).toContain('Timezone: Asia/Shanghai')
    expect(prompt).toContain('Language: zh-CN')
    expect(prompt).toContain('Today: 2026-06-18')
    expect(prompt).toContain('For normal chat')
    expect(prompt).toContain('Only call generate_document_tool')
    expect(prompt).toContain('NEW Markdown document/file')
  })
})
