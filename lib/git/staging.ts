import type { GitDraftFile, StagedGitChange } from './types'
import { computeGitBlobSha, computeGitBlobShaFromBase64 } from './utils'

export function createDraftStageChange(draft: GitDraftFile, existingId?: string): StagedGitChange {
  const content = draft.draftContent

  return {
    id: existingId || `git-draft:${draft.documentId}`,
    kind: 'git-draft',
    label: draft.name,
    repoPath: draft.path,
    documentId: draft.documentId,
    content,
    originalContent: draft.originalContent,
    baseSha: draft.sha,
    originalSha: draft.sha,
    blobSha: computeGitBlobSha(content),
    renamedFromPath: draft.renamedFromPath,
    renamedFromSha: draft.renamedFromSha,
    updatedAt: Date.now(),
  }
}

export function createBinaryStageChange(change: StagedGitChange): StagedGitChange {
  if (!change.contentBase64) {
    return {
      ...change,
      updatedAt: Date.now(),
    }
  }

  return {
    ...change,
    blobSha: computeGitBlobShaFromBase64(change.contentBase64),
    updatedAt: Date.now(),
  }
}
