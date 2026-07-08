import type { GitDraftFile, StagedGitChange } from './types'

export function shouldShowDraftInPendingChanges(
  draft: GitDraftFile,
  stagedDraft: StagedGitChange | undefined,
  hasDeleteIntent: boolean
) {
  if ((!draft.isDirty && !draft.isNew) || hasDeleteIntent) {
    return false
  }

  if (!stagedDraft) {
    return true
  }

  return (stagedDraft.content ?? '') !== draft.draftContent
}
