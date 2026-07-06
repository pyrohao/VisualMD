export const AI_DOCUMENT_EDIT_HISTORY_DESCRIPTION = 'AI agent document edit'
export const AI_DOCUMENT_UNDO_HISTORY_DESCRIPTION = 'Undo AI agent document edit'

const AI_DOCUMENT_HISTORY_DESCRIPTIONS = new Set([
  AI_DOCUMENT_EDIT_HISTORY_DESCRIPTION,
  AI_DOCUMENT_UNDO_HISTORY_DESCRIPTION,
])

export function isAiDocumentHistoryDescription(description: string | null | undefined) {
  if (!description) {
    return false
  }

  return AI_DOCUMENT_HISTORY_DESCRIPTIONS.has(description)
}
