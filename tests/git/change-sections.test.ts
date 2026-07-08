import { describe, expect, it } from 'vitest'
import { shouldShowDraftInPendingChanges } from '@/lib/git/change-sections'
import type { GitDraftFile, StagedGitChange } from '@/lib/git/types'

function createDraft(overrides: Partial<GitDraftFile> = {}): GitDraftFile {
  return {
    documentId: 'doc-1',
    path: 'README.md',
    name: 'README.md',
    sha: 'sha-1',
    content: '# Base\n',
    originalContent: '# Base\n',
    draftContent: '# Base\n',
    isDirty: false,
    isNew: false,
    fileOrigin: 'remote',
    provider: 'github',
    ownerOrNamespace: 'owner',
    repo: 'repo',
    branch: 'main',
    ...overrides,
  }
}

function createStagedDraft(overrides: Partial<StagedGitChange> = {}): StagedGitChange {
  return {
    id: 'git-draft:doc-1',
    kind: 'git-draft',
    label: 'README.md',
    repoPath: 'README.md',
    documentId: 'doc-1',
    content: '# Base\n',
    originalContent: '# Base\n',
    updatedAt: 1,
    ...overrides,
  }
}

describe('change sections', () => {
  it('keeps clean staged drafts out of pending changes', () => {
    expect(shouldShowDraftInPendingChanges(
      createDraft({ draftContent: '# Base\n', isDirty: false }),
      createStagedDraft({ content: '# Base\n' }),
      false
    )).toBe(false)
  })

  it('shows a staged draft in pending changes again after it is edited further', () => {
    expect(shouldShowDraftInPendingChanges(
      createDraft({ draftContent: '# Edited again\n', isDirty: true }),
      createStagedDraft({ content: '# Staged once\n' }),
      false
    )).toBe(true)
  })
})
