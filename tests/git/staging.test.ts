import { describe, expect, it } from 'vitest'
import { computeGitBlobSha, computeGitBlobShaFromBytes } from '@/lib/git/utils'
import { createDraftStageChange } from '@/lib/git/staging'
import type { GitDraftFile } from '@/lib/git/types'

function createDraft(overrides: Partial<GitDraftFile> = {}): GitDraftFile {
  return {
    documentId: 'git:github:owner/repo:main:README.md',
    path: 'README.md',
    name: 'README.md',
    sha: 'base-sha',
    content: 'old',
    originalContent: 'old',
    draftContent: 'hello',
    isDirty: true,
    provider: 'github',
    repo: 'repo',
    ownerOrNamespace: 'owner',
    branch: 'main',
    ...overrides,
  }
}

describe('git staging helpers', () => {
  it('computes Git-compatible blob SHA values', () => {
    expect(computeGitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
    expect(computeGitBlobSha('hello')).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0')
    expect(computeGitBlobShaFromBytes(new Uint8Array())).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
  })

  it('freezes draft content when creating a staged index entry', () => {
    const draft = createDraft()
    const staged = createDraftStageChange(draft)

    draft.draftContent = 'edited after stage'

    expect(staged.content).toBe('hello')
    expect(staged.originalContent).toBe('old')
    expect(staged.baseSha).toBe('base-sha')
    expect(staged.originalSha).toBe('base-sha')
    expect(staged.blobSha).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0')
  })

  it('keeps the same staged id when replacing a staged path snapshot', () => {
    const staged = createDraftStageChange(createDraft({ draftContent: 'first' }), 'git-draft:existing')
    const restaged = createDraftStageChange(createDraft({ draftContent: 'second' }), staged.id)

    expect(restaged.id).toBe(staged.id)
    expect(restaged.content).toBe('second')
    expect(restaged.blobSha).toBe(computeGitBlobSha('second'))
  })
})
