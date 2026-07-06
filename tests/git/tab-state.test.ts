import { describe, expect, it } from 'vitest'
import { buildGitTabDraftState } from '@/lib/git/tab-state'
import type { GitDraftFile } from '@/lib/git/types'

function createDraft(overrides: Partial<GitDraftFile> = {}): GitDraftFile {
  return {
    documentId: 'git:demo',
    path: 'docs/demo.md',
    name: 'demo.md',
    content: '# demo',
    draftContent: '# demo updated',
    originalContent: '# demo',
    isDirty: true,
    isNew: true,
    hasConflict: false,
    hasRemoteUpdates: false,
    lastCheckedAt: Date.now(),
    provider: 'github',
    ownerOrNamespace: 'owner',
    repo: 'repo',
    branch: 'main',
    ...overrides,
  }
}

describe('buildGitTabDraftState', () => {
  it('keeps git worktree state out of the tab modified flag', () => {
    const state = buildGitTabDraftState(createDraft())

    expect(state.isModified).toBe(false)
    expect(state.isNew).toBe(false)
    expect(state.savedContent).toBe('# demo updated')
    expect(state.content).toBe('# demo updated')
  })

  it('preserves the git identity used to reopen the draft', () => {
    const state = buildGitTabDraftState(createDraft({ sha: 'abc123' }))

    expect(state.fileId).toBe('git:demo')
    expect(state.gitMeta).toMatchObject({
      provider: 'github',
      ownerOrNamespace: 'owner',
      repo: 'repo',
      branch: 'main',
      path: 'docs/demo.md',
      sha: 'abc123',
      fileKind: 'text',
    })
  })
})
