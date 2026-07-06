import type { GitDraftFile } from '@/lib/git/types'

export function buildGitTabDraftState(draft: GitDraftFile) {
  return {
    fileName: draft.name,
    content: draft.draftContent,
    savedContent: draft.draftContent,
    isModified: false,
    isNew: false,
    fileId: draft.documentId,
    sourceType: 'git' as const,
    gitMeta: {
      provider: draft.provider,
      ownerOrNamespace: draft.ownerOrNamespace,
      repo: draft.repo,
      branch: draft.branch,
      path: draft.path,
      sha: draft.sha,
      fileKind: 'text' as const,
    },
  }
}
