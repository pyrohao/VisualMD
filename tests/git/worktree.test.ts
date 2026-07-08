import { describe, expect, it } from 'vitest'
import { buildGitWorktreeView, hasGitRemoteSnapshotPath } from '@/lib/git/worktree'
import type { GitDraftFile, GitTreeItem, StagedGitChange } from '@/lib/git/types'

function createDraft(overrides: Partial<GitDraftFile>): GitDraftFile {
  return {
    documentId: 'doc-1',
    path: 'README.md',
    name: 'README.md',
    sha: 'sha-1',
    content: '# Title',
    originalContent: '# Title',
    draftContent: '# Title',
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

function createChange(overrides: Partial<StagedGitChange>): StagedGitChange {
  return {
    id: 'change-1',
    kind: 'git-asset',
    label: 'logo.png',
    repoPath: 'assets/logo.png',
    updatedAt: Date.now(),
    contentBase64: 'Zm9v',
    ...overrides,
  } as StagedGitChange
}

function createTree(items: GitTreeItem[]): Record<string, GitTreeItem[]> {
  return {
    '': items,
  }
}

describe('buildGitWorktreeView', () => {
  it('checks remote existence from snapshot metadata instead of relying on projected tree paths', () => {
    expect(hasGitRemoteSnapshotPath({
      'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'sha-1' },
      docs: { path: 'docs', name: 'docs', type: 'dir' },
    }, 'README.md', 'file')).toBe(true)

    expect(hasGitRemoteSnapshotPath({
      'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'sha-1' },
    }, 'README.md', 'dir')).toBe(false)

    expect(hasGitRemoteSnapshotPath({
      docs: { path: 'docs', name: 'docs', type: 'dir' },
    }, 'docs/guide.md')).toBe(false)
  })

  it('returns the baseline tree when there are no overlays', () => {
    const baseline = createTree([
      { path: 'docs', name: 'docs', type: 'dir' },
      { path: 'README.md', name: 'README.md', type: 'file' },
    ])

    const result = buildGitWorktreeView({
      treeByPath: baseline,
      remoteSnapshotEntries: {},
      drafts: {},
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
      stagedChanges: [],
    })

    expect(result.treeByPath).toEqual(baseline)
    expect(result.statusByPath).toEqual({})
  })

  it('marks dirty drafts and their parent folders as modified', () => {
    const result = buildGitWorktreeView({
      treeByPath: {
        '': [{ path: 'docs', name: 'docs', type: 'dir' }],
        docs: [{ path: 'docs/guide.md', name: 'guide.md', type: 'file' }],
      },
      remoteSnapshotEntries: {
        docs: { path: 'docs', name: 'docs', type: 'dir' },
        'docs/guide.md': { path: 'docs/guide.md', name: 'guide.md', type: 'file' },
      },
      drafts: {
        'doc-1': createDraft({
          documentId: 'doc-1',
          path: 'docs/guide.md',
          name: 'guide.md',
          isDirty: true,
          draftContent: 'changed',
        }),
      },
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
      stagedChanges: [],
    })

    expect(result.statusByPath['docs/guide.md']).toEqual({ worktree: 'modified' })
    expect(result.statusByPath.docs).toEqual({ worktree: 'modified' })
  })

  it('adds local new drafts into the worktree as untracked files until they are staged', () => {
    const result = buildGitWorktreeView({
      treeByPath: { '': [] },
      remoteSnapshotEntries: {},
      drafts: {
        'doc-1': createDraft({
          documentId: 'doc-1',
          path: 'notes/today.md',
          name: 'today.md',
          isNew: true,
          sha: undefined,
          originalContent: '',
        }),
      },
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
      stagedChanges: [],
    })

    expect(result.treeByPath[''].map((item) => item.path)).toContain('notes')
    expect(result.treeByPath.notes?.map((item) => item.path)).toContain('notes/today.md')
    expect(result.statusByPath['notes/today.md']).toEqual({ worktree: 'untracked' })
    expect(result.statusByPath.notes).toEqual({ worktree: 'modified' })
  })

  it('shows only unstaged drift as modified after a tracked file is restaged once', () => {
    const result = buildGitWorktreeView({
      treeByPath: {
        '': [{ path: 'README.md', name: 'README.md', type: 'file' }],
      },
      remoteSnapshotEntries: {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'sha-1' },
      },
      drafts: {
        'doc-1': createDraft({
          documentId: 'doc-1',
          path: 'README.md',
          name: 'README.md',
          originalContent: '# Base',
          draftContent: '# Edited again',
          isDirty: true,
        }),
      },
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
      stagedChanges: [
        createChange({
          id: 'git-draft:doc-1',
          kind: 'git-draft',
          label: 'README.md',
          repoPath: 'README.md',
          documentId: 'doc-1',
          content: '# Staged once',
          originalContent: '# Base',
          baseSha: 'sha-1',
        }),
      ],
    })

    expect(result.statusByPath['README.md']).toEqual({
      worktree: 'modified',
    })
  })

  it('shows pending assets and created folders in the worktree', () => {
    const result = buildGitWorktreeView({
      treeByPath: { '': [] },
      remoteSnapshotEntries: {},
      drafts: {},
      pendingAssetChanges: [
        createChange({
          id: 'asset-1',
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: 'assets/logo.png',
        }),
      ],
      pendingStructuralChanges: [
        createChange({
          id: 'folder-1',
          kind: 'git-create-folder',
          label: 'docs',
          repoPath: 'docs',
          contentBase64: undefined,
        }),
      ],
      stagedChanges: [],
    })

    expect(result.treeByPath[''].map((item) => item.path)).toEqual(['assets', 'docs'])
    expect(result.treeByPath.assets?.map((item) => item.path)).toContain('assets/logo.png')
    expect(result.statusByPath['assets/logo.png']).toEqual({ worktree: 'untracked' })
    expect(result.statusByPath.docs).toEqual({ worktree: 'untracked' })
  })

  it('treats pending assets as modified when the same remote path already exists', () => {
    const result = buildGitWorktreeView({
      treeByPath: {
        '': [{ path: 'assets', name: 'assets', type: 'dir' }],
        assets: [{ path: 'assets/logo.png', name: 'logo.png', type: 'file', sha: 'remote-asset-sha' }],
      },
      remoteSnapshotEntries: {
        assets: { path: 'assets', name: 'assets', type: 'dir' },
        'assets/logo.png': { path: 'assets/logo.png', name: 'logo.png', type: 'file', sha: 'remote-asset-sha' },
      },
      drafts: {},
      pendingAssetChanges: [
        createChange({
          id: 'asset-pending',
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: 'assets/logo.png',
          baseSha: 'remote-asset-sha',
          originalSha: 'remote-asset-sha',
        }),
      ],
      pendingStructuralChanges: [],
      stagedChanges: [],
    })

    expect(result.statusByPath['assets/logo.png']).toEqual({
      worktree: 'modified',
    })
  })

  it('keeps staged tracked assets out of the worktree status list', () => {
    const result = buildGitWorktreeView({
      treeByPath: {
        '': [{ path: 'assets', name: 'assets', type: 'dir' }],
        assets: [{ path: 'assets/logo.png', name: 'logo.png', type: 'file', sha: 'remote-asset-sha' }],
      },
      remoteSnapshotEntries: {
        assets: { path: 'assets', name: 'assets', type: 'dir' },
        'assets/logo.png': { path: 'assets/logo.png', name: 'logo.png', type: 'file', sha: 'remote-asset-sha' },
      },
      drafts: {},
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
      stagedChanges: [
        createChange({
          id: 'asset-staged',
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: 'assets/logo.png',
          baseSha: 'remote-asset-sha',
          originalSha: 'remote-asset-sha',
        }),
      ],
    })

    expect(result.statusByPath['assets/logo.png']).toBeUndefined()
  })

  it('removes deleted files and folders from the projected tree while preserving deleted worktree status', () => {
    const result = buildGitWorktreeView({
      treeByPath: {
        '': [
          { path: 'README.md', name: 'README.md', type: 'file' },
          { path: 'docs', name: 'docs', type: 'dir' },
        ],
        docs: [
          { path: 'docs/guide.md', name: 'guide.md', type: 'file' },
          { path: 'docs/api.md', name: 'api.md', type: 'file' },
        ],
      },
      remoteSnapshotEntries: {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file' },
        docs: { path: 'docs', name: 'docs', type: 'dir' },
        'docs/guide.md': { path: 'docs/guide.md', name: 'guide.md', type: 'file' },
        'docs/api.md': { path: 'docs/api.md', name: 'api.md', type: 'file' },
      },
      drafts: {},
      pendingAssetChanges: [],
      pendingStructuralChanges: [
        createChange({
          id: 'delete-file',
          kind: 'git-delete-file',
          label: 'README.md',
          repoPath: 'README.md',
          contentBase64: undefined,
        }),
        createChange({
          id: 'delete-folder',
          kind: 'git-delete-folder',
          label: 'docs',
          repoPath: 'docs',
          contentBase64: undefined,
        }),
      ],
      stagedChanges: [],
    })

    expect(result.treeByPath[''].map((item) => item.path)).toEqual([])
    expect(result.treeByPath.docs).toBeUndefined()
    expect(result.statusByPath['README.md']).toEqual({ worktree: 'deleted' })
    expect(result.statusByPath.docs).toEqual({ worktree: 'deleted' })
  })

  it('removes staged deletes from worktree status because deletion now lives only in the staged area', () => {
    const result = buildGitWorktreeView({
      treeByPath: {
        '': [
          { path: 'README.md', name: 'README.md', type: 'file' },
        ],
      },
      remoteSnapshotEntries: {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file' },
      },
      drafts: {},
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
      stagedChanges: [
        createChange({
          id: 'delete-file',
          kind: 'git-delete-file',
          label: 'README.md',
          repoPath: 'README.md',
          contentBase64: undefined,
        }),
      ],
    })

    expect(result.treeByPath['']).toEqual([])
    expect(result.statusByPath['README.md']).toBeUndefined()
  })
})
