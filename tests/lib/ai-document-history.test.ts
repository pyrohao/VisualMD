import { describe, expect, it } from 'vitest'
import {
  AI_DOCUMENT_EDIT_HISTORY_DESCRIPTION,
  AI_DOCUMENT_UNDO_HISTORY_DESCRIPTION,
  isAiDocumentHistoryDescription,
} from '@/lib/ai-document-history'

describe('ai document history', () => {
  it('recognizes AI-managed document history descriptions', () => {
    expect(isAiDocumentHistoryDescription(AI_DOCUMENT_EDIT_HISTORY_DESCRIPTION)).toBe(true)
    expect(isAiDocumentHistoryDescription(AI_DOCUMENT_UNDO_HISTORY_DESCRIPTION)).toBe(true)
  })

  it('ignores unrelated history descriptions', () => {
    expect(isAiDocumentHistoryDescription('修改标题')).toBe(false)
    expect(isAiDocumentHistoryDescription('AI agent apply_tool')).toBe(false)
    expect(isAiDocumentHistoryDescription(null)).toBe(false)
  })
})
