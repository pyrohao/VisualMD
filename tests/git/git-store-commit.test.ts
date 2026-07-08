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
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useGitStore } from '@/stores/gitStore'

const config = {
  provider: 'github' as const,
  token: '',
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
    treeByPath: {},
    remoteSnapshotEntries: {},
    remoteSnapshotFetchedAt: null,
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

  useFileSystemStore.setState({
    files: [],
    currentFileId: null,
  } as never)

  Object.values(mockClient).forEach((fn) => {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset()
    }
  })
}

describe('gitStore commit staging semantics', () => {
  beforeEach(() => {
    resetGitState()
  })

  it('commits the frozen staged snapshot without depending on a runtime draft copy', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      treeByPath: {
        '': [
          { path: 'README.md', name: 'README.md', type: 'file', sha: 'base-sha' },
        ],
      },
      remoteSnapshotEntries: {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'base-sha' },
      },
      remoteSnapshotFetchedAt: 1,
      stagedChanges: [
        {
          id: `git-draft:${documentId}`,
          kind: 'git-draft',
          label: 'README.md',
          repoPath: 'README.md',
          documentId,
          content: 'staged snapshot',
          originalContent: 'base content',
          baseSha: 'base-sha',
          originalSha: 'base-sha',
          blobSha: 'blob-sha',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (!path) {
        return [{ path: 'README.md', name: 'README.md', type: 'file', sha: 'base-sha' }]
      }
      return []
    })
    mockClient.getFile
      .mockResolvedValueOnce({
        path: 'README.md',
        name: 'README.md',
        sha: 'base-sha',
        content: 'base content',
      })
      .mockResolvedValueOnce({
        path: 'README.md',
        name: 'README.md',
        sha: 'committed-sha',
        content: 'staged snapshot',
      })
    mockClient.commitBatch.mockResolvedValue(undefined)

    await useGitStore.getState().commitCurrentFile('commit staged snapshot')

    expect(mockClient.commitBatch).toHaveBeenCalledTimes(1)
    expect(mockClient.commitBatch).toHaveBeenCalledWith(
      expect.any(Object),
      'commit staged snapshot',
      [
        {
          kind: 'upsert',
          path: 'README.md',
          content: 'staged snapshot',
          encoding: 'text',
          previousSha: 'base-sha',
          isCreate: false,
        },
      ]
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('allows commit when the same file has newer local edits and preserves those edits after committing the staged snapshot', async () => {
    const documentId = buildGitDocumentId(config, 'new-file.md')

    useGitStore.setState({
      treeByPath: {},
      remoteSnapshotEntries: {},
      remoteSnapshotFetchedAt: 1,
      drafts: {
        [documentId]: {
          documentId,
          path: 'new-file.md',
          name: 'new-file.md',
          sha: undefined,
          content: 'local newer edit',
          originalContent: '',
          draftContent: 'local newer edit',
          isDirty: true,
          isNew: true,
          fileOrigin: 'remote',
          status: 'dirty',
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
      stagedChanges: [
        {
          id: `git-draft:${documentId}`,
          kind: 'git-draft',
          label: 'new-file.md',
          repoPath: 'new-file.md',
          documentId,
          content: 'staged snapshot',
          originalContent: '',
          baseSha: undefined,
          originalSha: undefined,
          blobSha: 'blob-staged',
          updatedAt: 1,
        },
      ],
      currentDocumentId: documentId,
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (!path) {
        return []
      }
      return []
    })
    mockClient.getFile.mockResolvedValue({
      path: 'new-file.md',
      name: 'new-file.md',
      sha: 'remote-created-sha',
      content: 'staged snapshot',
    })
    mockClient.commitBatch.mockResolvedValue(undefined)

    await useGitStore.getState().commitCurrentFile('commit staged while keep local edits')

    expect(mockClient.commitBatch).toHaveBeenCalledWith(
      expect.any(Object),
      'commit staged while keep local edits',
      [
        {
          kind: 'upsert',
          path: 'new-file.md',
          content: 'staged snapshot',
          encoding: 'text',
          previousSha: undefined,
          isCreate: true,
        },
      ]
    )

    const nextState = useGitStore.getState()
    expect(nextState.drafts[documentId]).toMatchObject({
      draftContent: 'local newer edit',
      originalContent: 'staged snapshot',
      isDirty: true,
      isNew: false,
      status: 'dirty',
      sha: 'remote-created-sha',
    })
  })

  it('fails fast when a staged draft is missing its frozen snapshot content', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      treeByPath: {
        '': [
          { path: 'README.md', name: 'README.md', type: 'file', sha: 'base-sha' },
        ],
      },
      remoteSnapshotEntries: {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'base-sha' },
      },
      remoteSnapshotFetchedAt: 1,
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'base-sha',
          content: '',
          originalContent: '',
          draftContent: '',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: '',
          remoteSha: 'base-sha',
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
          id: `git-draft:${documentId}`,
          kind: 'git-draft',
          label: 'README.md',
          repoPath: 'README.md',
          documentId,
          originalContent: '',
          baseSha: 'base-sha',
          originalSha: 'base-sha',
          blobSha: 'blob-sha',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (!path) {
        return [{ path: 'README.md', name: 'README.md', type: 'file', sha: 'base-sha' }]
      }
      return []
    })

    await expect(
      useGitStore.getState().commitCurrentFile('commit broken staged entry')
    ).rejects.toThrow("Staged file 'README.md' is missing its frozen snapshot. Please stage it again before committing")

    expect(mockClient.commitBatch).not.toHaveBeenCalled()
  })

  it('commits staged binary assets as updates when a remote blob sha already exists', async () => {
    useGitStore.setState({
      remoteSnapshotFetchedAt: 1,
      stagedChanges: [
        {
          id: 'git-asset:doc-1:docs/.visualmd-assets/logo.png',
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: 'docs/.visualmd-assets/logo.png',
          documentId: 'doc-1',
          contentBase64: 'Zm9v',
          baseSha: 'asset-sha',
          originalSha: 'asset-sha',
          blobSha: 'blob-asset',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockResolvedValue([])
    mockClient.commitBatch.mockResolvedValue(undefined)

    await useGitStore.getState().commitCurrentFile('update asset')

    expect(mockClient.commitBatch).toHaveBeenCalledWith(
      expect.any(Object),
      'update asset',
      [
        {
          kind: 'upsert',
          path: 'docs/.visualmd-assets/logo.png',
          content: 'Zm9v',
          encoding: 'base64',
          previousSha: 'asset-sha',
          isCreate: false,
        },
      ]
    )
  })

  it('commits a keep-local resolution after remote delete as a recreate without an old sha', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      treeByPath: {
        '': [
          { path: 'README.md', name: 'README.md', type: 'file', sha: 'old-sha' },
        ],
      },
      remoteSnapshotEntries: {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'old-sha' },
      },
      remoteSnapshotFetchedAt: 1,
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'old-sha',
          content: '# Title\n',
          originalContent: '# Title\n',
          draftContent: '# Local keep\n',
          isDirty: true,
          isNew: false,
          fileOrigin: 'remote',
          status: 'dirty',
          remoteContent: '# Title\n',
          remoteSha: 'old-sha',
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
          id: `git-draft:${documentId}`,
          kind: 'git-draft',
          label: 'README.md',
          repoPath: 'README.md',
          documentId,
          content: '# Local keep\n',
          originalContent: '# Title\n',
          baseSha: 'old-sha',
          originalSha: 'old-sha',
          blobSha: 'blob-local',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree
      .mockResolvedValueOnce([])
      .mockImplementation(async (_cfg: unknown, path = '') => {
        if (!path) {
          return [{ path: 'README.md', name: 'README.md', type: 'file', sha: 'recreated-sha' }]
        }
        return []
      })
    mockClient.getFile.mockResolvedValue({
      path: 'README.md',
      name: 'README.md',
      sha: 'recreated-sha',
      content: '# Local keep\n',
    })
    mockClient.commitBatch.mockResolvedValue(undefined)

    const refreshResult = await useGitStore.getState().refreshRepositoryFromRemote()
    expect(refreshResult.conflictedDocumentIds).toEqual([documentId])

    useGitStore.getState().acceptLocalVersion(documentId)

    await useGitStore.getState().commitCurrentFile('recreate README after remote delete')

    expect(mockClient.commitBatch).toHaveBeenCalledWith(
      expect.any(Object),
      'recreate README after remote delete',
      [
        {
          kind: 'upsert',
          path: 'README.md',
          content: '# Local keep\n',
          encoding: 'text',
          previousSha: undefined,
          isCreate: true,
        },
      ]
    )
  })

})
