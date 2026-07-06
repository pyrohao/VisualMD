import { describe, expect, it } from 'vitest'
import { buildGitWorktreeView } from '@/lib/git/worktree'
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
    creationSource: 'git',
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
  it('returns the baseline tree when there are no overlays', () => {
    const baseline = createTree([
      { path: 'docs', name: 'docs', type: 'dir' },
      { path: 'README.md', name: 'README.md', type: 'file' },
    ])

    const result = buildGitWorktreeView({
      treeByPath: baseline,
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

    expect(result.statusByPath['docs/guide.md']).toBe('modified')
    expect(result.statusByPath.docs).toBe('modified')
  })

  it('adds local new drafts into the worktree as added files', () => {
    const result = buildGitWorktreeView({
      treeByPath: { '': [] },
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
    expect(result.statusByPath['notes/today.md']).toBe('untracked')
    expect(result.statusByPath.notes).toBe('modified')
  })

  it('shows pending assets and created folders in the worktree', () => {
    const result = buildGitWorktreeView({
      treeByPath: { '': [] },
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
    expect(result.statusByPath['assets/logo.png']).toBe('untracked')
    expect(result.statusByPath.docs).toBe('untracked')
  })

  it('removes deleted files and folders from the projected tree while preserving deleted status', () => {
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
    expect(result.statusByPath['README.md']).toBe('deleted')
    expect(result.statusByPath.docs).toBe('deleted')
  })
})
