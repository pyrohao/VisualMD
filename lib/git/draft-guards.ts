import type { GitDraftFile } from './types'

export function isPureLocalNewGitDraft(draft: GitDraftFile | undefined) {
  return Boolean(draft?.isNew && draft.fileOrigin === 'local')
}
