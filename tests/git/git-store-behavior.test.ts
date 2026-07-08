import { describe, expect, it } from 'vitest'
import { isPureLocalNewGitDraft } from '@/lib/git/draft-guards'
import {
  diffGitRemoteSnapshotEntries,
  getGitRemoteContentCacheHit,
  mergeGitRemoteSnapshotEntriesForTreePath,
  pruneGitRemoteContentCache,
} from '@/stores/gitStore'
import type { GitDraftFile } from '@/lib/git/types'

function draft(overrides: Partial<GitDraftFile>): GitDraftFile {
  return {
    documentId: 'doc-id',
    path: 'README.md',
    name: 'README.md',
    content: '',
    originalContent: '',
    draftContent: '',
    isDirty: false,
    provider: 'github',
    repo: 'repo',
    ownerOrNamespace: 'owner',
    branch: 'main',
    ...overrides,
  }
}

describe('git store behavior guards', () => {
  it('treats local staged new drafts as non-remote documents', () => {
    expect(isPureLocalNewGitDraft(draft({ isNew: true, fileOrigin: 'local' }))).toBe(true)
    expect(isPureLocalNewGitDraft(draft({ isNew: true, fileOrigin: 'remote' }))).toBe(false)
    expect(isPureLocalNewGitDraft(draft({ isNew: false, fileOrigin: 'local' }))).toBe(false)
    expect(isPureLocalNewGitDraft(undefined)).toBe(false)
  })

  it('uses path + sha as the remote content cache identity', () => {
    const cache = {
      'README.md': {
        path: 'README.md',
        name: 'README.md',
        sha: 'sha-a',
        content: 'cached',
        loadedAt: 1,
      },
    }

    expect(getGitRemoteContentCacheHit(cache, '/README.md', 'sha-a')?.content).toBe('cached')
    expect(getGitRemoteContentCacheHit(cache, 'README.md', 'sha-b')).toBeNull()
    expect(getGitRemoteContentCacheHit(cache, 'docs/README.md', 'sha-a')).toBeNull()
  })

  it('prunes stale remote content cache entries after metadata refresh', () => {
    const nextCache = pruneGitRemoteContentCache({
      'README.md': {
        path: 'README.md',
        name: 'README.md',
        sha: 'sha-a',
        content: 'keep',
        loadedAt: 1,
      },
      'docs/README.md': {
        path: 'docs/README.md',
        name: 'README.md',
        sha: 'same-name-sha',
        content: 'also keep',
        loadedAt: 2,
      },
      'stale.md': {
        path: 'stale.md',
        name: 'stale.md',
        sha: 'old',
        content: 'drop',
        loadedAt: 3,
      },
    }, {
      'README.md': {
        path: 'README.md',
        name: 'README.md',
        type: 'file',
        sha: 'sha-a',
      },
      'docs/README.md': {
        path: 'docs/README.md',
        name: 'README.md',
        type: 'file',
        sha: 'same-name-sha',
      },
      'stale.md': {
        path: 'stale.md',
        name: 'stale.md',
        type: 'file',
        sha: 'new',
      },
    })

    expect(Object.keys(nextCache).sort()).toEqual(['README.md', 'docs/README.md'])
    expect(nextCache['docs/README.md']?.content).toBe('also keep')
  })

  it('diffs remote snapshots by full path first and then sha', () => {
    const diff = diffGitRemoteSnapshotEntries(
      {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'same' },
        'docs/README.md': { path: 'docs/README.md', name: 'README.md', type: 'file', sha: 'old-docs' },
      },
      {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'same' },
        'docs/README.md': { path: 'docs/README.md', name: 'README.md', type: 'file', sha: 'new-docs' },
        'guide.md': { path: 'guide.md', name: 'guide.md', type: 'file', sha: 'guide' },
      }
    )

    expect(diff).toEqual({
      addedPaths: ['guide.md'],
      deletedPaths: [],
      updatedPaths: ['docs/README.md'],
    })
  })

  it('merges folder tree metadata into the remote snapshot while preserving surviving nested subtrees', () => {
    const nextEntries = mergeGitRemoteSnapshotEntriesForTreePath(
      {
        docs: { path: 'docs', name: 'docs', type: 'dir' },
        'docs/guide.md': { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'old-guide' },
        'docs/api': { path: 'docs/api', name: 'api', type: 'dir' },
        'docs/api/index.md': { path: 'docs/api/index.md', name: 'index.md', type: 'file', sha: 'nested' },
        'docs/removed.md': { path: 'docs/removed.md', name: 'removed.md', type: 'file', sha: 'drop' },
      },
      {
        docs: [
          { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'old-guide' },
          { path: 'docs/api', name: 'api', type: 'dir' },
          { path: 'docs/removed.md', name: 'removed.md', type: 'file', sha: 'drop' },
        ],
      },
      'docs',
      [
        { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'new-guide' },
        { path: 'docs/api', name: 'api', type: 'dir' },
      ]
    )

    expect(nextEntries['docs/guide.md']?.sha).toBe('new-guide')
    expect(nextEntries['docs/api/index.md']?.sha).toBe('nested')
    expect(nextEntries['docs/removed.md']).toBeUndefined()
  })
})
