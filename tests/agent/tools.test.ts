import { describe, expect, it, vi } from 'vitest'
import { AIService } from '@/lib/ai-service'
import { executeApplyTool, executeGenerateDocumentTool, executeSemanticTool } from '@/lib/agent'

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
    vi.spyOn(AIService.prototype, 'generateMarkdown').mockResolvedValueOnce({
      success: true,
      content: '# Generated',
      fileName: 'Generated.md',
    })

    const result = await executeGenerateDocumentTool(
      { prompt: 'make a doc' },
      {
        markdown: '',
        providerConfig: {
          id: 'custom',
          name: 'Custom',
          baseUrl: 'https://example.test/v1',
          apiKey: 'test',
          model: 'test',
          temperature: 0,
          maxTokens: 1000,
          isTested: true,
        },
      }
    )

    expect(result.ok).toBe(true)
    expect(result.generatedFile?.fileName).toBe('Generated.md')
  })
})
