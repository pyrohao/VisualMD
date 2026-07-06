import { describe, expect, it, vi } from 'vitest'
import { AIService } from '@/lib/ai-service'
import {
  buildInvalidToolArgumentsResult,
  defaultAgentToolDefinitions,
  executeApplyTool,
  executeGenerateDocumentTool,
  validateToolArguments,
} from '@/lib/agent'

describe('agent tools', () => {
  it('applies replacements using a find candidate range', async () => {
    const result = await executeApplyTool(
      { offset: { start: 7, end: 21 }, newString: 'New paragraph.' },
      {
        markdown: '# Doc\n\nOld paragraph.',
        recoveryCandidates: [
          {
            startOffset: 7,
            endOffset: 21,
            matchText: 'Old paragraph.',
            preview: '# Doc\n\nOld paragraph.',
          },
        ],
      }
    )

    expect(result.ok).toBe(true)
    expect(result.nextMarkdown).toContain('New paragraph.')
  })

  it('rejects missing and stale candidate ranges', async () => {
    const missing = await executeApplyTool({ newString: 'y' } as any, { markdown: 'abc' })
    expect(missing.ok).toBe(false)
    expect(missing.message).toContain('offset.start and offset.end')

    const stale = await executeApplyTool(
      { offset: { start: 0, end: 1 }, newString: 'b' },
      {
        markdown: 'a\na',
        recoveryCandidates: [
          {
            startOffset: 2,
            endOffset: 3,
            matchText: 'a',
            preview: 'a\na',
          },
        ],
      }
    )
    expect(stale.ok).toBe(false)
    expect(stale.message).toContain('did not match any recent find_tool candidate')
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

    const missing = validateToolArguments(applyTool, { offset: { start: 1, end: 2 } })
    expect(missing.ok).toBe(false)
    expect(missing.error?.code).toBe('missing-required')
    expect(buildInvalidToolArgumentsResult(applyTool, missing).message).toContain('missing required field "newString"')

    const extra = validateToolArguments(applyTool, { offset: { start: 1, end: 2 }, newString: 'b', extra: 1 })
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
