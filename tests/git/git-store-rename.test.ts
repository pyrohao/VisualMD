import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockClient = {
  validateConnection: vi.fn(),
  listRepos: vi.fn(),
  getBranches: vi.fn(),
  listTree: vi.fn(),
  getFile: vi.fn(),
  createOrUpdateFile: vi.fn(),
  deleteFile: vi.fn(),
  renameFile: vi.fn(),
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  commitBatch: vi.fn(),
}

vi.mock('@/lib/git/providers', () => ({
  getGitProviderClient: vi.fn(() => mockClient),
}))

import { buildGitDocumentId } from '@/lib/git/utils'
import { useGitStore } from '@/stores/gitStore'
import { useTabsStore } from '@/stores/tabsStore'

const config = {
  provider: 'github' as const,
  token: 'token',
  ownerOrNamespace: 'owner',
  repo: 'repo',
  branch: 'main',
  baseUrl: '',
  customFlavor: 'gitlab' as const,
}

function resetGitState() {
  useGitStore.setState({
    config,
    lastConnectedConfigSignature: null,
    repos: [],
    branches: [],
    treeByPath: {
      '': [
        { path: 'README.md', name: 'README.md', type: 'file', sha: 'sha-readme' },
        { path: 'docs', name: 'docs', type: 'dir' },
      ],
      docs: [],
    },
    remoteSnapshotEntries: {
      'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'sha-readme' },
      docs: { path: 'docs', name: 'docs', type: 'dir' },
    },
    remoteSnapshotFetchedAt: 1,
    remoteContentCache: {},
    expandedPaths: [],
    drafts: {},
    stagedChanges: [],
    pendingAssetChanges: [],
    pendingStructuralChanges: [],
    currentDocumentId: null,
    workspaceStateByKey: {},
    isConnecting: false,
    isLoadingTree: false,
    isCommitting: false,
    isFetchingRemote: false,
    error: null,
    pendingCommitMessage: null,
    connected: true,
    lastFetchedAt: null,
  })

  useTabsStore.setState({
    tabs: [],
    activeTabId: null,
  })

  Object.values(mockClient).forEach((fn) => {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset()
    }
  })
}

describe('gitStore renameFile', () => {
  beforeEach(() => {
    resetGitState()
  })

  it('renames a tracked file into local overlay changes instead of writing remote immediately', async () => {
    const oldDocumentId = buildGitDocumentId(config, 'README.md')
    const nextDocumentId = buildGitDocumentId(config, 'docs/README-renamed.md')

    useGitStore.setState({
      treeByPath: {},
      remoteSnapshotEntries: {},
      drafts: {
        [oldDocumentId]: {
          documentId: oldDocumentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'sha-readme',
          content: '# Title\n',
          originalContent: '# Title\n',
          draftContent: '# Title\nUpdated\n',
          isDirty: true,
          isNew: false,
          fileOrigin: 'remote',
          status: 'dirty',
          remoteContent: '# Title\n',
          remoteSha: 'sha-readme',
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      currentDocumentId: oldDocumentId,
    })

    await useGitStore.getState().renameFile('README.md', 'docs/README-renamed.md', 'rename')

    const nextState = useGitStore.getState()
    expect(nextState.drafts[oldDocumentId]).toBeUndefined()
    expect(nextState.drafts[nextDocumentId]).toMatchObject({
      documentId: nextDocumentId,
      path: 'docs/README-renamed.md',
      name: 'README-renamed.md',
      isNew: true,
      sha: undefined,
      draftContent: '# Title\nUpdated\n',
    })
    expect(nextState.pendingStructuralChanges).toEqual([
      expect.objectContaining({
        kind: 'git-delete-file',
        repoPath: 'README.md',
        documentId: oldDocumentId,
        originalSha: 'sha-readme',
      }),
    ])
    expect(nextState.currentDocumentId).toBe(nextDocumentId)
  })

  it('renames a local new file without creating a delete change', async () => {
    const oldDocumentId = buildGitDocumentId(config, 'draft.md')
    const nextDocumentId = buildGitDocumentId(config, 'draft-renamed.md')

    useGitStore.setState({
      drafts: {
        [oldDocumentId]: {
          documentId: oldDocumentId,
          path: 'draft.md',
          name: 'draft.md',
          sha: undefined,
          content: 'draft content',
          originalContent: 'draft content',
          draftContent: 'draft content',
          isDirty: false,
          isNew: true,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: undefined,
          remoteSha: undefined,
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
    })

    await useGitStore.getState().renameFile('draft.md', 'draft-renamed.md', 'rename')

    const nextState = useGitStore.getState()
    expect(nextState.drafts[oldDocumentId]).toBeUndefined()
    expect(nextState.drafts[nextDocumentId]).toMatchObject({
      documentId: nextDocumentId,
      path: 'draft-renamed.md',
      name: 'draft-renamed.md',
      isNew: true,
    })
    expect(nextState.pendingStructuralChanges).toEqual([])
  })

  it('renames an already staged tracked file while keeping the staged snapshot bound to the new path', async () => {
    const oldDocumentId = buildGitDocumentId(config, 'README.md')
    const nextDocumentId = buildGitDocumentId(config, 'docs/README-renamed.md')

    useGitStore.setState({
      treeByPath: {},
      remoteSnapshotEntries: {},
      drafts: {
        [oldDocumentId]: {
          documentId: oldDocumentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'sha-readme',
          content: '# Title\n',
          originalContent: '# Title\n',
          draftContent: '# Title\nUpdated\n',
          isDirty: true,
          isNew: false,
          fileOrigin: 'remote',
          status: 'dirty',
          remoteContent: '# Title\n',
          remoteSha: 'sha-readme',
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      stagedChanges: [
        {
          id: `git-draft:${oldDocumentId}`,
          kind: 'git-draft',
          label: 'README.md',
          repoPath: 'README.md',
          documentId: oldDocumentId,
          content: '# Frozen staged snapshot\n',
          originalContent: '# Title\n',
          baseSha: 'sha-readme',
          originalSha: 'sha-readme',
          blobSha: 'blob-sha',
          updatedAt: 1,
        },
      ],
      currentDocumentId: oldDocumentId,
    })

    await useGitStore.getState().renameFile('README.md', 'docs/README-renamed.md', 'rename')

    const nextState = useGitStore.getState()
    expect(nextState.stagedChanges).toEqual([
      expect.objectContaining({
        id: `git-draft:${nextDocumentId}`,
        kind: 'git-draft',
        documentId: nextDocumentId,
        repoPath: 'docs/README-renamed.md',
        label: 'README-renamed.md',
        content: '# Frozen staged snapshot\n',
        renamedFromPath: 'README.md',
        renamedFromSha: 'sha-readme',
      }),
    ])
    expect(nextState.pendingStructuralChanges).toEqual([
      expect.objectContaining({
        kind: 'git-delete-file',
        repoPath: 'README.md',
        documentId: oldDocumentId,
        originalSha: 'sha-readme',
      }),
    ])
  })

  it('moves pending and staged document assets alongside a file renamed into another folder', async () => {
    const oldDocumentId = buildGitDocumentId(config, 'README.md')
    const nextDocumentId = buildGitDocumentId(config, 'docs/README-renamed.md')

    useGitStore.setState({
      treeByPath: {},
      remoteSnapshotEntries: {},
      drafts: {
        [oldDocumentId]: {
          documentId: oldDocumentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'sha-readme',
          content: '![logo](.visualmd-assets/logo.png)',
          originalContent: '![logo](.visualmd-assets/logo.png)',
          draftContent: '![logo](.visualmd-assets/logo.png)',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: '![logo](.visualmd-assets/logo.png)',
          remoteSha: 'sha-readme',
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      pendingAssetChanges: [
        {
          id: `git-asset:${oldDocumentId}:.visualmd-assets/logo.png`,
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          documentId: oldDocumentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      stagedChanges: [
        {
          id: `git-asset:${oldDocumentId}:.visualmd-assets/banner.png`,
          kind: 'git-asset',
          label: 'banner.png',
          repoPath: '.visualmd-assets/banner.png',
          documentId: oldDocumentId,
          contentBase64: 'YmFy',
          baseSha: 'banner-sha',
          originalSha: 'banner-sha',
          updatedAt: 1,
        },
      ],
    })

    await useGitStore.getState().renameFile('README.md', 'docs/README-renamed.md', 'rename')

    const nextState = useGitStore.getState()
    expect(nextState.pendingAssetChanges).toEqual([
      expect.objectContaining({
        id: `git-asset:${nextDocumentId}:docs/.visualmd-assets/logo.png`,
        documentId: nextDocumentId,
        repoPath: 'docs/.visualmd-assets/logo.png',
      }),
    ])
    expect(nextState.stagedChanges).toEqual([
      expect.objectContaining({
        id: `git-asset:${nextDocumentId}:docs/.visualmd-assets/banner.png`,
        documentId: nextDocumentId,
        repoPath: 'docs/.visualmd-assets/banner.png',
        baseSha: 'banner-sha',
        originalSha: 'banner-sha',
      }),
    ])
  })

  it('fails fast when a file rename would move a document asset onto an existing path', async () => {
    const oldDocumentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      drafts: {
        [oldDocumentId]: {
          documentId: oldDocumentId,
          path: 'README.md',
          name: 'README.md',
          sha: undefined,
          content: '![logo](.visualmd-assets/logo.png)',
          originalContent: '![logo](.visualmd-assets/logo.png)',
          draftContent: '![logo](.visualmd-assets/logo.png)',
          isDirty: false,
          isNew: true,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: undefined,
          remoteSha: undefined,
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      pendingAssetChanges: [
        {
          id: `git-asset:${oldDocumentId}:.visualmd-assets/logo.png`,
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          documentId: oldDocumentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      remoteSnapshotEntries: {
        'docs/.visualmd-assets/logo.png': {
          path: 'docs/.visualmd-assets/logo.png',
          name: 'logo.png',
          type: 'file',
          sha: 'existing-sha',
        },
      },
    })

    await expect(
      useGitStore.getState().renameFile('README.md', 'docs/README-renamed.md', 'rename')
    ).rejects.toThrow("Target path 'docs/.visualmd-assets/logo.png' already exists")
  })

  it('renames a local-only folder by remapping its child drafts and folder placeholders', async () => {
    const oldDocumentId = buildGitDocumentId(config, 'docs/note.md')
    const nextDocumentId = buildGitDocumentId(config, 'guides/note.md')

    useGitStore.setState({
      treeByPath: {},
      remoteSnapshotEntries: {},
      drafts: {
        [oldDocumentId]: {
          documentId: oldDocumentId,
          path: 'docs/note.md',
          name: 'note.md',
          sha: undefined,
          content: 'draft content',
          originalContent: 'draft content',
          draftContent: 'draft content',
          isDirty: false,
          isNew: true,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: undefined,
          remoteSha: undefined,
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      pendingStructuralChanges: [
        {
          id: 'git-create-folder:docs',
          kind: 'git-create-folder',
          label: 'docs',
          repoPath: 'docs',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (path === 'docs') {
        return [
          { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
          { path: 'docs/.visualmd-assets', name: '.visualmd-assets', type: 'dir' },
        ]
      }
      if (path === 'docs/.visualmd-assets') {
        return [
          { path: 'docs/.visualmd-assets/logo.png', name: 'logo.png', type: 'file', sha: 'sha-logo' },
          { path: 'docs/.visualmd-assets/banner.png', name: 'banner.png', type: 'file', sha: 'sha-banner' },
        ]
      }
      return []
    })
    mockClient.getFile.mockResolvedValue({
      path: 'docs/guide.md',
      name: 'guide.md',
      sha: 'sha-guide',
      content: '![logo](docs/.visualmd-assets/logo.png)',
    })

    await useGitStore.getState().renameFile('docs', 'guides', 'rename')

    const nextState = useGitStore.getState()
    expect(nextState.drafts[oldDocumentId]).toBeUndefined()
    expect(nextState.drafts[nextDocumentId]).toMatchObject({
      path: 'guides/note.md',
      name: 'note.md',
      isNew: true,
    })
    expect(nextState.pendingStructuralChanges).toEqual([
      expect.objectContaining({
        kind: 'git-create-folder',
        repoPath: 'guides',
      }),
    ])
  })

  it('renames a remote folder into local overlay file moves instead of writing remote immediately', async () => {
    const nextDocumentId = buildGitDocumentId(config, 'guides/guide.md')

    useGitStore.setState({
      treeByPath: {
        '': [
          { path: 'docs', name: 'docs', type: 'dir' },
        ],
        docs: [
          { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
        ],
      },
      remoteSnapshotEntries: {
        docs: { path: 'docs', name: 'docs', type: 'dir' },
        'docs/guide.md': { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
      },
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (path === 'docs') {
        return [{ path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' }]
      }
      return []
    })
    mockClient.getFile.mockResolvedValue({
      path: 'docs/guide.md',
      name: 'guide.md',
      sha: 'sha-guide',
      content: '# guide',
    })

    await useGitStore.getState().renameFile('docs', 'guides', 'rename')

    const nextState = useGitStore.getState()
    expect(nextState.drafts[nextDocumentId]).toMatchObject({
      path: 'guides/guide.md',
      name: 'guide.md',
      isNew: true,
      renamedFromPath: 'docs/guide.md',
      renamedFromSha: 'sha-guide',
      draftContent: '# guide',
    })
    expect(nextState.pendingStructuralChanges).toEqual([
      expect.objectContaining({
        kind: 'git-delete-file',
        repoPath: 'docs/guide.md',
        originalSha: 'sha-guide',
      }),
    ])
  })

  it('renames a folder while preserving nested delete intents at their original paths', async () => {
    const nextDocumentId = buildGitDocumentId(config, 'guides/guide.md')

    useGitStore.setState({
      treeByPath: {
        '': [
          { path: 'docs', name: 'docs', type: 'dir' },
        ],
        docs: [
          { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
          { path: 'docs/removed.md', name: 'removed.md', type: 'file', sha: 'sha-removed' },
        ],
      },
      remoteSnapshotEntries: {
        docs: { path: 'docs', name: 'docs', type: 'dir' },
        'docs/guide.md': { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
        'docs/removed.md': { path: 'docs/removed.md', name: 'removed.md', type: 'file', sha: 'sha-removed' },
      },
      pendingStructuralChanges: [
        {
          id: 'git-delete-file:docs/removed.md',
          kind: 'git-delete-file',
          label: 'removed.md',
          repoPath: 'docs/removed.md',
          documentId: buildGitDocumentId(config, 'docs/removed.md'),
          originalContent: '# removed',
          originalSha: 'sha-removed',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (path === 'docs') {
        return [
          { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
          { path: 'docs/removed.md', name: 'removed.md', type: 'file', sha: 'sha-removed' },
        ]
      }
      return []
    })
    mockClient.getFile.mockResolvedValue({
      path: 'docs/guide.md',
      name: 'guide.md',
      sha: 'sha-guide',
      content: '# guide',
    })

    await useGitStore.getState().renameFile('docs', 'guides', 'rename')

    const nextState = useGitStore.getState()
    expect(nextState.drafts[nextDocumentId]).toMatchObject({
      path: 'guides/guide.md',
      name: 'guide.md',
      isNew: true,
      renamedFromPath: 'docs/guide.md',
      renamedFromSha: 'sha-guide',
    })
    expect(nextState.drafts[buildGitDocumentId(config, 'guides/removed.md')]).toBeUndefined()
    expect(nextState.pendingStructuralChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'git-delete-file',
        repoPath: 'docs/guide.md',
        originalSha: 'sha-guide',
      }),
      expect.objectContaining({
        kind: 'git-delete-file',
        repoPath: 'docs/removed.md',
        originalSha: 'sha-removed',
      }),
    ]))
    expect(mockClient.getFile).toHaveBeenCalledTimes(1)
  })

  it('renames a folder by remapping nested asset ids, paths, and document bindings together', async () => {
    const oldDocumentId = buildGitDocumentId(config, 'docs/guide.md')
    const nextDocumentId = buildGitDocumentId(config, 'guides/guide.md')

    useGitStore.setState({
      treeByPath: {
        '': [
          { path: 'docs', name: 'docs', type: 'dir' },
        ],
        docs: [
          { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
        ],
      },
      remoteSnapshotEntries: {
        docs: { path: 'docs', name: 'docs', type: 'dir' },
        'docs/guide.md': { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
      },
      drafts: {
        [oldDocumentId]: {
          documentId: oldDocumentId,
          path: 'docs/guide.md',
          name: 'guide.md',
          sha: 'sha-guide',
          content: '![logo](docs/.visualmd-assets/logo.png)',
          originalContent: '![logo](docs/.visualmd-assets/logo.png)',
          draftContent: '![logo](docs/.visualmd-assets/logo.png)',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: '![logo](docs/.visualmd-assets/logo.png)',
          remoteSha: 'sha-guide',
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      stagedChanges: [
        {
          id: `git-asset:${oldDocumentId}:docs/.visualmd-assets/logo.png`,
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: 'docs/.visualmd-assets/logo.png',
          documentId: oldDocumentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      pendingAssetChanges: [
        {
          id: `git-asset:${oldDocumentId}:docs/.visualmd-assets/banner.png`,
          kind: 'git-asset',
          label: 'banner.png',
          repoPath: 'docs/.visualmd-assets/banner.png',
          documentId: oldDocumentId,
          contentBase64: 'YmFy',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (path === 'docs') {
        return [
          { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
          { path: 'docs/.visualmd-assets', name: '.visualmd-assets', type: 'dir' },
        ]
      }
      if (path === 'docs/.visualmd-assets') {
        return [
          { path: 'docs/.visualmd-assets/logo.png', name: 'logo.png', type: 'file', sha: 'sha-logo' },
          { path: 'docs/.visualmd-assets/banner.png', name: 'banner.png', type: 'file', sha: 'sha-banner' },
        ]
      }
      return []
    })
    mockClient.getFile.mockResolvedValue({
      path: 'docs/guide.md',
      name: 'guide.md',
      sha: 'sha-guide',
      content: '![logo](docs/.visualmd-assets/logo.png)',
    })

    await useGitStore.getState().renameFile('docs', 'guides', 'rename')

    const nextState = useGitStore.getState()
    expect(nextState.stagedChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `git-asset:${nextDocumentId}:guides/.visualmd-assets/logo.png`,
        repoPath: 'guides/.visualmd-assets/logo.png',
        documentId: nextDocumentId,
      }),
    ]))
    expect(nextState.pendingAssetChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `git-asset:${nextDocumentId}:guides/.visualmd-assets/banner.png`,
        repoPath: 'guides/.visualmd-assets/banner.png',
        documentId: nextDocumentId,
      }),
    ]))
  })
})
