import { describe, expect, it, vi } from 'vitest'
import { AIService } from '@/lib/ai-service'
import {
  buildInvalidToolArgumentsResult,
  defaultAgentToolDefinitions,
  executeApplyTool,
  executeGenerateDocumentTool,
  executeSemanticTool,
  validateToolArguments,
} from '@/lib/agent'

describe('agent tools', () => {
  it('applies exact single-match replacements', async () => {
    const result = await executeApplyTool(
      { oldString: 'Old paragraph.', newString: 'New paragraph.' },
      { markdown: '# Doc\n\nOld paragraph.' }
    )

    expect(result.ok).toBe(true)
    expect(result.nextMarkdown).toContain('New paragraph.')
  })

  it('rejects missing and duplicate oldString matches', async () => {
    const missing = await executeApplyTool({ oldString: 'x', newString: 'y' }, { markdown: 'abc' })
    expect(missing.ok).toBe(false)
    expect(missing.metadata?.matchCount).toBe(0)
    expect(missing.metadata?.failedText).toBe('x')

    const duplicate = await executeApplyTool({ oldString: 'a', newString: 'b' }, { markdown: 'a\na' })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.metadata?.matchCount).toBe(2)
  })

  it('returns a semantic paragraph candidate', async () => {
    const result = await executeSemanticTool(
      { query: 'visual markdown editor' },
      { markdown: '# A\n\nUnrelated text.\n\nVisual Markdown editor helps organize documents.' }
    )

    expect(result.ok).toBe(true)
    expect(result.metadata?.candidate).toBe('Visual Markdown editor helps organize documents.')
  })

  it('fails semantic search when no token overlaps', async () => {
    const result = await executeSemanticTool(
      { query: 'alpha' },
      { markdown: 'beta gamma' }
    )

    expect(result.ok).toBe(false)
  })

  it('generates markdown documents as a tool result', async () => {
    vi.spyOn(AIService.prototype, 'chatMessagesStream').mockImplementationOnce(async (options) => {
      options.onDelta?.('# ', '# ')
      options.onDelta?.('Generated', '# Generated')
      return '# Generated'
    })
    const events: any[] = []

    const result = await executeGenerateDocumentTool(
      { prompt: 'make a doc', fileName: 'Generated.md' },
      {
        markdown: '',
        toolCallId: 'tool-call-1',
        onGeneratedDocumentEvent: (event) => events.push(event),
        providerConfig: {
          id: 'custom',
          name: 'Custom',
          protocol: 'openai-compatible',
          baseUrl: 'https://example.test/v1',
          apiKey: 'test',
          model: 'test',
          models: [],
          modelDiscovery: { type: 'openai-models', path: '/models' },
          authType: 'bearer',
          openAIEndpoint: 'chat-completions',
          temperature: 0,
          maxTokens: 1000,
          isTested: true,
        },
      }
    )

    expect(result.ok).toBe(true)
    expect(result.generatedFile?.fileName).toBe('Generated.md')
    expect(result.generatedFile?.content).toBe('# Generated')
    expect(events.map((event) => event.type)).toEqual(['start', 'delta', 'delta', 'done'])
  })

  it('validates required fields and rejects extra arguments from schema', () => {
    const applyTool = defaultAgentToolDefinitions.find((tool) => tool.name === 'apply_tool')

    expect(applyTool).toBeTruthy()
    if (!applyTool) return

    const missing = validateToolArguments(applyTool, { oldString: 'a' })
    expect(missing.ok).toBe(false)
    expect(missing.error?.code).toBe('missing-required')
    expect(buildInvalidToolArgumentsResult(applyTool, missing).message).toContain('missing required field "newString"')

    const extra = validateToolArguments(applyTool, { oldString: 'a', newString: 'b', extra: 1 })
    expect(extra.ok).toBe(false)
    expect(extra.error?.code).toBe('unexpected-property')
    expect(buildInvalidToolArgumentsResult(applyTool, extra).message).toContain('"extra"')
  })

  it('validates field types from schema', () => {
    const generateTool = defaultAgentToolDefinitions.find((tool) => tool.name === 'generate_document_tool')

    expect(generateTool).toBeTruthy()
    if (!generateTool) return

    const invalid = validateToolArguments(generateTool, { fileName: 123, prompt: 'make a doc' } as any)
    expect(invalid.ok).toBe(false)
    expect(invalid.error?.code).toBe('invalid-type')
    expect(buildInvalidToolArgumentsResult(generateTool, invalid).message).toContain('field "fileName" must be string')
  })
})
