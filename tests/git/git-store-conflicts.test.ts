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

  Object.values(mockClient).forEach((fn) => {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset()
    }
  })
}

describe('gitStore conflict classification', () => {
  beforeEach(() => {
    resetGitState()
  })

  it('marks staged delete vs remote modify as a modify-delete conflict', async () => {
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
          draftContent: '# Title\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
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
          id: 'git-delete-file:README.md',
          kind: 'git-delete-file',
          label: 'README.md',
          repoPath: 'README.md',
          documentId,
          originalContent: '# Title\n',
          originalSha: 'old-sha',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (!path) {
        return [{ path: 'README.md', name: 'README.md', type: 'file', sha: 'new-sha' }]
      }
      return []
    })
    mockClient.getFile.mockResolvedValue({
      path: 'README.md',
      name: 'README.md',
      sha: 'new-sha',
      content: '# Remote update\n',
    })

    const result = await useGitStore.getState().refreshRepositoryFromRemote()
    const draft = useGitStore.getState().drafts[documentId]

    expect(result.conflictedDocumentIds).toEqual([documentId])
    expect(draft?.hasConflict).toBe(true)
    expect(draft?.conflictSnapshot?.kind).toBe('modify-delete')
  })

  it('keeps a staged tracked file as a staged recreate when the remote deletes it and the user accepts local', async () => {
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

    mockClient.listTree.mockResolvedValue([])

    const result = await useGitStore.getState().refreshRepositoryFromRemote()
    expect(result.conflictedDocumentIds).toEqual([documentId])

    useGitStore.getState().acceptLocalVersion(documentId)

    const nextState = useGitStore.getState()
    expect(nextState.drafts[documentId]).toMatchObject({
      path: 'README.md',
      draftContent: '# Local keep\n',
      originalContent: '',
      sha: undefined,
      hasConflict: false,
      status: 'dirty',
    })
    expect(nextState.stagedChanges.find((item) => item.id === `git-draft:${documentId}`)).toMatchObject({
      repoPath: 'README.md',
      content: '# Local keep\n',
      originalContent: '',
      baseSha: undefined,
      originalSha: undefined,
    })
  })

  it('turns a staged local same-path file into a conflict when the remote already has that path', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      remoteSnapshotEntries: {},
      remoteSnapshotFetchedAt: 1,
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: undefined,
          content: 'local draft',
          originalContent: '',
          draftContent: 'local draft',
          isDirty: true,
          isNew: true,
          fileOrigin: 'local',
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
          label: 'README.md',
          repoPath: 'README.md',
          documentId,
          content: 'local draft',
          originalContent: '',
          baseSha: undefined,
          originalSha: undefined,
          blobSha: 'blob-local',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (!path) {
        return [{ path: 'README.md', name: 'README.md', type: 'file', sha: 'remote-sha' }]
      }
      return []
    })
    mockClient.getFile.mockResolvedValue({
      path: 'README.md',
      name: 'README.md',
      sha: 'remote-sha',
      content: 'remote draft',
    })

    const result = await useGitStore.getState().refreshRepositoryFromRemote()
    const nextDraft = useGitStore.getState().drafts[documentId]

    expect(result.conflictedDocumentIds).toEqual([documentId])
    expect(nextDraft).toMatchObject({
      hasConflict: true,
      status: 'conflict',
      remoteContent: 'remote draft',
      remoteSha: 'remote-sha',
    })
    expect(nextDraft?.conflictSnapshot?.kind).toBe('content')
    expect(nextDraft?.conflictSnapshot?.baseContent).toBe('')
    expect(nextDraft?.conflictSnapshot?.localContent).toBe('local draft')
    expect(nextDraft?.conflictSnapshot?.remoteContent).toBe('remote draft')
  })

  it('acceptLocal on a staged local same-path conflict keeps the local snapshot staged against the remote sha', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: undefined,
          content: 'local draft',
          originalContent: '',
          draftContent: 'local draft',
          isDirty: true,
          isNew: true,
          fileOrigin: 'local',
          status: 'conflict',
          remoteContent: 'remote draft',
          remoteSha: 'remote-sha',
          hasRemoteUpdates: true,
          hasConflict: true,
          conflictSnapshot: {
            kind: 'content',
            baseContent: '',
            baseSha: undefined,
            localContent: 'local draft',
            remoteContent: 'remote draft',
            remoteSha: 'remote-sha',
            remoteMissing: false,
            resolvedContent: 'local draft',
          },
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
          content: 'local draft',
          originalContent: '',
          baseSha: undefined,
          originalSha: undefined,
          blobSha: 'blob-local',
          updatedAt: 1,
        },
      ],
    })

    useGitStore.getState().acceptLocalVersion(documentId)

    const nextState = useGitStore.getState()
    expect(nextState.drafts[documentId]).toMatchObject({
      draftContent: 'local draft',
      originalContent: 'remote draft',
      sha: 'remote-sha',
      hasConflict: false,
      status: 'dirty',
    })
    expect(nextState.stagedChanges.find((item) => item.id === `git-draft:${documentId}`)).toMatchObject({
      content: 'local draft',
      originalContent: 'remote draft',
      baseSha: 'remote-sha',
      originalSha: 'remote-sha',
    })
  })

  it('acceptRemote on a staged local same-path conflict removes the local staged add', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: undefined,
          content: 'local draft',
          originalContent: '',
          draftContent: 'local draft',
          isDirty: true,
          isNew: true,
          fileOrigin: 'local',
          status: 'conflict',
          remoteContent: 'remote draft',
          remoteSha: 'remote-sha',
          hasRemoteUpdates: true,
          hasConflict: true,
          conflictSnapshot: {
            kind: 'content',
            baseContent: '',
            baseSha: undefined,
            localContent: 'local draft',
            remoteContent: 'remote draft',
            remoteSha: 'remote-sha',
            remoteMissing: false,
            resolvedContent: 'local draft',
          },
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
          content: 'local draft',
          originalContent: '',
          baseSha: undefined,
          originalSha: undefined,
          blobSha: 'blob-local',
          updatedAt: 1,
        },
      ],
    })

    useGitStore.getState().acceptRemoteVersion(documentId)

    const nextState = useGitStore.getState()
    expect(nextState.drafts[documentId]).toMatchObject({
      draftContent: 'remote draft',
      originalContent: 'remote draft',
      sha: 'remote-sha',
      isNew: false,
      isDirty: false,
      hasConflict: false,
      status: 'clean',
    })
    expect(nextState.stagedChanges.find((item) => item.documentId === documentId)).toBeUndefined()
  })

  it('acceptRemote applies an empty remote file content instead of treating it as missing', () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'base-sha',
          content: '# local',
          originalContent: '# base',
          draftContent: '# local',
          isDirty: true,
          isNew: false,
          fileOrigin: 'remote',
          status: 'conflict',
          remoteContent: '',
          remoteSha: 'empty-remote-sha',
          hasRemoteUpdates: true,
          hasConflict: true,
          conflictSnapshot: {
            kind: 'content',
            baseContent: '# base',
            baseSha: 'base-sha',
            localContent: '# local',
            remoteContent: '',
            remoteSha: 'empty-remote-sha',
            remoteMissing: false,
            resolvedContent: '# local',
          },
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
          content: '# local',
          originalContent: '# base',
          baseSha: 'base-sha',
          originalSha: 'base-sha',
          blobSha: 'blob-local',
          updatedAt: 1,
        },
      ],
    })

    useGitStore.getState().acceptRemoteVersion(documentId)

    const nextState = useGitStore.getState()
    expect(nextState.drafts[documentId]).toMatchObject({
      draftContent: '',
      originalContent: '',
      sha: 'empty-remote-sha',
      isDirty: false,
      isNew: false,
      hasConflict: false,
      status: 'clean',
    })
    expect(nextState.stagedChanges.find((item) => item.documentId === documentId)).toBeUndefined()
  })

  it('does not treat partial snapshot metadata as a complete remote baseline during refresh', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      treeByPath: {
        '': [
          { path: 'README.md', name: 'README.md', type: 'file', sha: 'same-sha' },
        ],
      },
      remoteSnapshotEntries: {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'same-sha' },
      },
      remoteSnapshotFetchedAt: null,
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: undefined,
          content: 'local draft',
          originalContent: '',
          draftContent: 'local draft',
          isDirty: true,
          isNew: true,
          fileOrigin: 'local',
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
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (!path) {
        return [{ path: 'README.md', name: 'README.md', type: 'file', sha: 'same-sha' }]
      }
      return []
    })

    await expect(
      useGitStore.getState().refreshRepositoryFromRemote()
    ).rejects.toThrow("Local untracked file 'README.md' would be overwritten by remote changes")
  })

  it('materializes delete-directory/add-file as a persistent path conflict draft', async () => {
    const documentId = buildGitDocumentId(config, 'docs/old.md')

    useGitStore.setState({
      treeByPath: {
        '': [
          { path: 'docs', name: 'docs', type: 'dir' },
        ],
        docs: [
          { path: 'docs/old.md', name: 'old.md', type: 'file', sha: 'old-sha' },
        ],
      },
      remoteSnapshotEntries: {
        docs: { path: 'docs', name: 'docs', type: 'dir' },
        'docs/old.md': { path: 'docs/old.md', name: 'old.md', type: 'file', sha: 'old-sha' },
      },
      remoteSnapshotFetchedAt: 1,
      stagedChanges: [
        {
          id: 'git-delete-folder:docs',
          kind: 'git-delete-folder',
          label: 'docs',
          repoPath: 'docs',
          updatedAt: 1,
        },
        {
          id: 'git-delete-file:docs/old.md',
          kind: 'git-delete-file',
          label: 'old.md',
          repoPath: 'docs/old.md',
          documentId,
          originalContent: 'old content',
          originalSha: 'old-sha',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (!path) {
        return [{ path: 'docs', name: 'docs', type: 'dir' }]
      }
      if (path === 'docs') {
        return [
          { path: 'docs/old.md', name: 'old.md', type: 'file', sha: 'old-sha' },
          { path: 'docs/new.md', name: 'new.md', type: 'file', sha: 'new-sha' },
        ]
      }
      return []
    })
    mockClient.getFile.mockResolvedValue({
      path: 'docs/old.md',
      name: 'old.md',
      sha: 'old-sha',
      content: 'old content',
    })

    await expect(
      useGitStore.getState().refreshRepositoryFromRemote()
    ).rejects.toThrow("Remote added 'docs/new.md' inside locally deleted folder 'docs'")

    const nextDraft = useGitStore.getState().drafts[documentId]
    expect(nextDraft).toBeDefined()
    expect(nextDraft?.hasConflict).toBe(true)
    expect(nextDraft?.conflictSnapshot?.kind).toBe('path')
    expect(nextDraft?.conflictSnapshot?.pathHint).toBe('docs/new.md')
  })

  it('acceptLocal on a path conflict appends the remote-added path to the folder delete plan', () => {
    const documentId = buildGitDocumentId(config, 'docs/old.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'docs/old.md',
          name: 'old.md',
          sha: 'old-sha',
          content: 'old content',
          originalContent: 'old content',
          draftContent: 'old content',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'conflict',
          remoteContent: '',
          remoteSha: undefined,
          hasRemoteUpdates: true,
          hasConflict: true,
          conflictSnapshot: {
            kind: 'path',
            baseContent: 'old content',
            baseSha: 'old-sha',
            localContent: 'old content',
            remoteContent: '',
            remoteSha: undefined,
            remoteMissing: true,
            resolvedContent: 'old content',
            pathHint: 'docs/new.md',
          },
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      stagedChanges: [
        {
          id: 'git-delete-folder:docs',
          kind: 'git-delete-folder',
          label: 'docs',
          repoPath: 'docs',
          updatedAt: 1,
        },
        {
          id: 'git-delete-file:docs/old.md',
          kind: 'git-delete-file',
          label: 'old.md',
          repoPath: 'docs/old.md',
          documentId,
          originalContent: 'old content',
          originalSha: 'old-sha',
          updatedAt: 1,
        },
        {
          id: `git-asset:${documentId}:docs/.visualmd-assets/old-asset.png`,
          kind: 'git-asset',
          label: 'old-asset.png',
          repoPath: 'docs/.visualmd-assets/old-asset.png',
          documentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      pendingAssetChanges: [
        {
          id: `git-asset:${documentId}:docs/.visualmd-assets/pending-asset.png`,
          kind: 'git-asset',
          label: 'pending-asset.png',
          repoPath: 'docs/.visualmd-assets/pending-asset.png',
          documentId,
          contentBase64: 'YmFy',
          updatedAt: 1,
        },
      ],
    })

    useGitStore.getState().acceptLocalVersion(documentId)
    const nextState = useGitStore.getState()

    expect(nextState.drafts[documentId]).toBeUndefined()
    expect(nextState.stagedChanges.find((item) => item.repoPath === 'docs/new.md')).toMatchObject({
      kind: 'git-delete-file',
      repoPath: 'docs/new.md',
    })
    expect(nextState.stagedChanges.find((item) => item.kind === 'git-asset')).toBeUndefined()
    expect(nextState.pendingAssetChanges).toEqual([])
  })

  it('acceptRemote on a path conflict clears the local folder delete plan', () => {
    const documentId = buildGitDocumentId(config, 'docs/old.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'docs/old.md',
          name: 'old.md',
          sha: 'old-sha',
          content: 'old content',
          originalContent: 'old content',
          draftContent: 'old content',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'conflict',
          remoteContent: '',
          remoteSha: undefined,
          hasRemoteUpdates: true,
          hasConflict: true,
          conflictSnapshot: {
            kind: 'path',
            baseContent: 'old content',
            baseSha: 'old-sha',
            localContent: 'old content',
            remoteContent: '',
            remoteSha: undefined,
            remoteMissing: true,
            resolvedContent: 'old content',
            pathHint: 'docs/new.md',
          },
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      stagedChanges: [
        {
          id: 'git-delete-folder:docs',
          kind: 'git-delete-folder',
          label: 'docs',
          repoPath: 'docs',
          updatedAt: 1,
        },
        {
          id: 'git-delete-file:docs/old.md',
          kind: 'git-delete-file',
          label: 'old.md',
          repoPath: 'docs/old.md',
          documentId,
          originalContent: 'old content',
          originalSha: 'old-sha',
          updatedAt: 1,
        },
        {
          id: `git-asset:${documentId}:docs/.visualmd-assets/old-asset.png`,
          kind: 'git-asset',
          label: 'old-asset.png',
          repoPath: 'docs/.visualmd-assets/old-asset.png',
          documentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      pendingAssetChanges: [
        {
          id: `git-asset:${documentId}:docs/.visualmd-assets/pending-asset.png`,
          kind: 'git-asset',
          label: 'pending-asset.png',
          repoPath: 'docs/.visualmd-assets/pending-asset.png',
          documentId,
          contentBase64: 'YmFy',
          updatedAt: 1,
        },
      ],
    })

    useGitStore.getState().acceptRemoteVersion(documentId)
    const nextState = useGitStore.getState()

    expect(nextState.drafts[documentId]).toBeUndefined()
    expect(nextState.stagedChanges.find((item) => item.repoPath === 'docs')).toBeUndefined()
    expect(nextState.stagedChanges.find((item) => item.repoPath === 'docs/old.md')).toBeUndefined()
    expect(nextState.stagedChanges.find((item) => item.kind === 'git-asset')).toBeUndefined()
    expect(nextState.pendingAssetChanges).toEqual([])
  })

  it('acceptRemote on a path conflict restores shelved subtree state from the folder delete plan', () => {
    const trackedDocumentId = buildGitDocumentId(config, 'docs/old.md')
    const localDocumentId = buildGitDocumentId(config, 'docs/local.md')

    useGitStore.setState({
      drafts: {
        [trackedDocumentId]: {
          documentId: trackedDocumentId,
          path: 'docs/old.md',
          name: 'old.md',
          sha: 'old-sha',
          content: 'old content',
          originalContent: 'old content',
          draftContent: 'old content',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'conflict',
          remoteContent: '',
          remoteSha: undefined,
          hasRemoteUpdates: true,
          hasConflict: true,
          conflictSnapshot: {
            kind: 'path',
            baseContent: 'old content',
            baseSha: 'old-sha',
            localContent: 'old content',
            remoteContent: '',
            remoteSha: undefined,
            remoteMissing: true,
            resolvedContent: 'old content',
            pathHint: 'docs/new.md',
          },
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      stagedChanges: [
        {
          id: 'git-delete-folder:docs',
          kind: 'git-delete-folder',
          label: 'docs',
          repoPath: 'docs',
          shelvedDrafts: [
            {
              documentId: localDocumentId,
              path: 'docs/local.md',
              name: 'local.md',
              sha: undefined,
              content: '# Local\n',
              originalContent: '# Local\n',
              draftContent: '# Local\n',
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
          ],
          shelvedStagedChanges: [
            {
              id: `git-draft:${localDocumentId}`,
              kind: 'git-draft',
              label: 'local.md',
              repoPath: 'docs/local.md',
              documentId: localDocumentId,
              content: '# Local staged\n',
              originalContent: '# Local\n',
              updatedAt: 1,
            },
          ],
          shelvedPendingAssetChanges: [
            {
              id: `git-asset:${localDocumentId}:docs/.visualmd-assets/banner.png`,
              kind: 'git-asset',
              label: 'banner.png',
              repoPath: 'docs/.visualmd-assets/banner.png',
              documentId: localDocumentId,
              contentBase64: 'YmFy',
              updatedAt: 1,
            },
          ],
          shelvedPendingStructuralChanges: [
            {
              id: 'git-create-folder:docs/new-sub',
              kind: 'git-create-folder',
              label: 'new-sub',
              repoPath: 'docs/new-sub',
              updatedAt: 1,
            },
          ],
          updatedAt: 1,
        },
        {
          id: 'git-delete-file:docs/old.md',
          kind: 'git-delete-file',
          label: 'old.md',
          repoPath: 'docs/old.md',
          documentId: trackedDocumentId,
          originalContent: 'old content',
          originalSha: 'old-sha',
          updatedAt: 1,
        },
      ],
    })

    useGitStore.getState().acceptRemoteVersion(trackedDocumentId)
    const nextState = useGitStore.getState()

    expect(nextState.drafts[trackedDocumentId]).toBeUndefined()
    expect(nextState.drafts[localDocumentId]).toMatchObject({
      path: 'docs/local.md',
      isNew: true,
    })
    expect(nextState.stagedChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `git-draft:${localDocumentId}`,
        repoPath: 'docs/local.md',
        documentId: localDocumentId,
      }),
    ]))
    expect(nextState.pendingAssetChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `git-asset:${localDocumentId}:docs/.visualmd-assets/banner.png`,
        repoPath: 'docs/.visualmd-assets/banner.png',
        documentId: localDocumentId,
      }),
    ]))
    expect(nextState.pendingStructuralChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'git-create-folder:docs/new-sub',
        repoPath: 'docs/new-sub',
      }),
    ]))
    expect(nextState.stagedChanges.find((item) => item.repoPath === 'docs')).toBeUndefined()
    expect(nextState.stagedChanges.find((item) => item.repoPath === 'docs/old.md')).toBeUndefined()
  })

  it('treats staged local rename vs remote rename-to-different-path as a delete-class conflict', async () => {
    const oldDocumentId = buildGitDocumentId(config, 'README.md')
    const nextDocumentId = buildGitDocumentId(config, 'docs/local-name.md')

    useGitStore.setState({
      treeByPath: {
        '': [
          { path: 'README.md', name: 'README.md', type: 'file', sha: 'old-sha' },
          { path: 'docs', name: 'docs', type: 'dir' },
        ],
        docs: [],
      },
      remoteSnapshotEntries: {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'old-sha' },
        docs: { path: 'docs', name: 'docs', type: 'dir' },
      },
      remoteSnapshotFetchedAt: 1,
      drafts: {
        [nextDocumentId]: {
          documentId: nextDocumentId,
          path: 'docs/local-name.md',
          name: 'local-name.md',
          sha: undefined,
          content: 'same content',
          originalContent: '',
          draftContent: 'same content',
          isDirty: true,
          isNew: true,
          renamedFromPath: 'README.md',
          renamedFromSha: 'old-sha',
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
          id: `git-draft:${nextDocumentId}`,
          kind: 'git-draft',
          label: 'local-name.md',
          repoPath: 'docs/local-name.md',
          documentId: nextDocumentId,
          content: 'same content',
          originalContent: '',
          baseSha: undefined,
          originalSha: undefined,
          blobSha: 'blob-local',
          renamedFromPath: 'README.md',
          renamedFromSha: 'old-sha',
          updatedAt: 1,
        },
        {
          id: 'git-delete-file:README.md',
          kind: 'git-delete-file',
          label: 'README.md',
          repoPath: 'README.md',
          documentId: oldDocumentId,
          originalContent: 'same content',
          originalSha: 'old-sha',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (!path) {
        return [
          { path: 'docs', name: 'docs', type: 'dir' },
          { path: 'remote-name.md', name: 'remote-name.md', type: 'file', sha: 'old-sha' },
        ]
      }
      if (path === 'docs') {
        return []
      }
      return []
    })
    const result = await useGitStore.getState().refreshRepositoryFromRemote()
    const nextDraft = useGitStore.getState().drafts[nextDocumentId]

    expect(result.conflictedDocumentIds).toEqual([nextDocumentId])
    expect(nextDraft?.hasConflict).toBe(true)
    expect(nextDraft?.conflictSnapshot?.kind).toBe('modify-delete')
    expect(nextDraft?.conflictSnapshot?.remoteMissing).toBe(true)
    expect(nextDraft?.conflictSnapshot?.remoteContent).toBe('')

    useGitStore.getState().acceptRemoteVersion(nextDocumentId)
    const nextState = useGitStore.getState()
    expect(nextState.drafts[nextDocumentId]).toBeUndefined()
    expect(nextState.stagedChanges.find((item) => item.repoPath === 'README.md')).toBeUndefined()
    expect(nextState.drafts[buildGitDocumentId(config, 'remote-name.md')]).toBeUndefined()
  })

  it('treats single-target remote rename+modify as a delete-class conflict and can accept the remote deletion', async () => {
    const oldDocumentId = buildGitDocumentId(config, 'README.md')
    const nextDocumentId = buildGitDocumentId(config, 'docs/local-name.md')

    useGitStore.setState({
      treeByPath: {
        '': [
          { path: 'README.md', name: 'README.md', type: 'file', sha: 'old-sha' },
          { path: 'docs', name: 'docs', type: 'dir' },
        ],
        docs: [],
      },
      remoteSnapshotEntries: {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'old-sha' },
        docs: { path: 'docs', name: 'docs', type: 'dir' },
      },
      remoteSnapshotFetchedAt: 1,
      drafts: {
        [nextDocumentId]: {
          documentId: nextDocumentId,
          path: 'docs/local-name.md',
          name: 'local-name.md',
          sha: undefined,
          content: 'local changed content',
          originalContent: '',
          draftContent: 'local changed content',
          isDirty: true,
          isNew: true,
          renamedFromPath: 'README.md',
          renamedFromSha: 'old-sha',
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
          id: `git-draft:${nextDocumentId}`,
          kind: 'git-draft',
          label: 'local-name.md',
          repoPath: 'docs/local-name.md',
          documentId: nextDocumentId,
          content: 'local changed content',
          originalContent: '',
          baseSha: undefined,
          originalSha: undefined,
          blobSha: 'blob-local',
          renamedFromPath: 'README.md',
          renamedFromSha: 'old-sha',
          updatedAt: 1,
        },
        {
          id: 'git-delete-file:README.md',
          kind: 'git-delete-file',
          label: 'README.md',
          repoPath: 'README.md',
          documentId: oldDocumentId,
          originalContent: 'base content',
          originalSha: 'old-sha',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (!path) {
        return [
          { path: 'docs', name: 'docs', type: 'dir' },
          { path: 'remote-name.md', name: 'remote-name.md', type: 'file', sha: 'new-remote-sha' },
        ]
      }
      if (path === 'docs') {
        return []
      }
      return []
    })
    const result = await useGitStore.getState().refreshRepositoryFromRemote()
    const nextDraft = useGitStore.getState().drafts[nextDocumentId]

    expect(result.conflictedDocumentIds).toEqual([nextDocumentId])
    expect(nextDraft?.hasConflict).toBe(true)
    expect(nextDraft?.conflictSnapshot?.kind).toBe('modify-delete')
    expect(nextDraft?.conflictSnapshot?.remoteMissing).toBe(true)
    expect(nextDraft?.conflictSnapshot?.remoteContent).toBe('')
    expect(nextDraft?.conflictSnapshot?.baseContent).toBe('base content')

    useGitStore.getState().acceptRemoteVersion(nextDocumentId)
    const nextState = useGitStore.getState()
    expect(nextState.drafts[nextDocumentId]).toBeUndefined()
    expect(nextState.stagedChanges.find((item) => item.repoPath === 'README.md')).toBeUndefined()
  })

  it('acceptLocal on a remote-rename conflict keeps the local renamed file and clears the stale source delete intent', async () => {
    const oldDocumentId = buildGitDocumentId(config, 'README.md')
    const nextDocumentId = buildGitDocumentId(config, 'docs/local-name.md')

    useGitStore.setState({
      drafts: {
        [nextDocumentId]: {
          documentId: nextDocumentId,
          path: 'docs/local-name.md',
          name: 'local-name.md',
          sha: undefined,
          content: 'local changed content',
          originalContent: 'base content',
          draftContent: 'local changed content',
          isDirty: true,
          isNew: true,
          renamedFromPath: 'README.md',
          renamedFromSha: 'old-sha',
          fileOrigin: 'remote',
          status: 'conflict',
          remoteContent: 'remote changed content',
          remoteSha: 'new-remote-sha',
          hasRemoteUpdates: true,
          hasConflict: true,
          conflictResolvedContent: 'local changed content',
          conflictSnapshot: {
            kind: 'modify-delete',
            baseContent: 'base content',
            baseSha: 'old-sha',
            localContent: 'local changed content',
            remoteContent: '',
            remoteSha: undefined,
            remoteMissing: true,
            resolvedContent: 'local changed content',
          },
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      stagedChanges: [
        {
          id: `git-draft:${nextDocumentId}`,
          kind: 'git-draft',
          label: 'local-name.md',
          repoPath: 'docs/local-name.md',
          documentId: nextDocumentId,
          content: 'local changed content',
          originalContent: '',
          baseSha: undefined,
          originalSha: undefined,
          blobSha: 'blob-local',
          renamedFromPath: 'README.md',
          renamedFromSha: 'old-sha',
          updatedAt: 1,
        },
        {
          id: 'git-delete-file:README.md',
          kind: 'git-delete-file',
          label: 'README.md',
          repoPath: 'README.md',
          documentId: oldDocumentId,
          originalContent: 'base content',
          originalSha: 'old-sha',
          updatedAt: 1,
        },
      ],
    })

    useGitStore.getState().acceptLocalVersion(nextDocumentId)
    const nextState = useGitStore.getState()

    expect(nextState.drafts[nextDocumentId]).toMatchObject({
      hasConflict: false,
      status: 'dirty',
      renamedFromPath: undefined,
      renamedFromSha: undefined,
      draftContent: 'local changed content',
      originalContent: '',
      sha: undefined,
    })
    expect(nextState.stagedChanges.find((item) => item.repoPath === 'README.md')).toBeUndefined()
    expect(nextState.stagedChanges.find((item) => item.id === `git-draft:${nextDocumentId}`)).toMatchObject({
      repoPath: 'docs/local-name.md',
      content: 'local changed content',
      originalContent: '',
      baseSha: undefined,
      originalSha: undefined,
    })
    expect(nextState.stagedChanges.find((item) => item.repoPath === 'remote-name.md')).toBeUndefined()
  })

  it('clears document-bound asset changes when the same file is deleted both locally and remotely', async () => {
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
          draftContent: '# Title\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
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
          id: 'git-delete-file:README.md',
          kind: 'git-delete-file',
          label: 'README.md',
          repoPath: 'README.md',
          documentId,
          originalContent: '# Title\n',
          originalSha: 'old-sha',
          updatedAt: 1,
        },
        {
          id: `git-asset:${documentId}:.visualmd-assets/logo.png`,
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          documentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      pendingAssetChanges: [
        {
          id: `git-asset:${documentId}:.visualmd-assets/banner.png`,
          kind: 'git-asset',
          label: 'banner.png',
          repoPath: '.visualmd-assets/banner.png',
          documentId,
          contentBase64: 'YmFy',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockResolvedValue([])

    const result = await useGitStore.getState().refreshRepositoryFromRemote()
    const nextState = useGitStore.getState()

    expect(result.deletedPaths).toEqual(['README.md'])
    expect(nextState.drafts[documentId]).toBeUndefined()
    expect(nextState.stagedChanges.find((item) => item.documentId === documentId)).toBeUndefined()
    expect(nextState.pendingAssetChanges.find((item) => item.documentId === documentId)).toBeUndefined()
  })

  it('treats document-bound asset changes as local work when the remote deletes the file', async () => {
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
          draftContent: '# Title\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
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
      pendingAssetChanges: [
        {
          id: `git-asset:${documentId}:.visualmd-assets/banner.png`,
          kind: 'git-asset',
          label: 'banner.png',
          repoPath: '.visualmd-assets/banner.png',
          documentId,
          contentBase64: 'YmFy',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockResolvedValue([])

    const result = await useGitStore.getState().refreshRepositoryFromRemote()
    const nextState = useGitStore.getState()

    expect(result.conflictedDocumentIds).toEqual([])
    expect(nextState.drafts[documentId]).toMatchObject({
      remoteMissing: true,
      hasRemoteUpdates: true,
      draftContent: '# Title\n',
    })
    expect(nextState.pendingAssetChanges.find((item) => item.documentId === documentId)).toBeDefined()
  })

  it('clears document-bound asset changes when a tracked file is staged for deletion locally', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'old-sha',
          content: '# Title\n',
          originalContent: '# Title\n',
          draftContent: '# Title\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
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
          id: `git-asset:${documentId}:.visualmd-assets/logo.png`,
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          documentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      pendingAssetChanges: [
        {
          id: `git-asset:${documentId}:.visualmd-assets/banner.png`,
          kind: 'git-asset',
          label: 'banner.png',
          repoPath: '.visualmd-assets/banner.png',
          documentId,
          contentBase64: 'YmFy',
          updatedAt: 1,
        },
      ],
    })

    await useGitStore.getState().stageDeletedGitFile('README.md')
    const nextState = useGitStore.getState()

    expect(nextState.pendingStructuralChanges.find((item) => item.repoPath === 'README.md')).toMatchObject({
      kind: 'git-delete-file',
      documentId,
      originalSha: 'old-sha',
    })
    expect(nextState.stagedChanges.find((item) => item.kind === 'git-asset' && item.documentId === documentId)).toBeUndefined()
    expect(nextState.pendingAssetChanges.find((item) => item.documentId === documentId)).toBeUndefined()
  })

  it('restores shelved staged document changes and assets when a pending file delete is discarded', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'old-sha',
          content: '# Title\n',
          originalContent: '# Title\n',
          draftContent: '# Title\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
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
          content: '# Staged\n',
          originalContent: '# Title\n',
          baseSha: 'old-sha',
          originalSha: 'old-sha',
          updatedAt: 1,
        },
        {
          id: `git-asset:${documentId}:.visualmd-assets/logo.png`,
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          documentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      pendingAssetChanges: [
        {
          id: `git-asset:${documentId}:.visualmd-assets/banner.png`,
          kind: 'git-asset',
          label: 'banner.png',
          repoPath: '.visualmd-assets/banner.png',
          documentId,
          contentBase64: 'YmFy',
          updatedAt: 1,
        },
      ],
    })

    await useGitStore.getState().stageDeletedGitFile('README.md')
    const deleteIntent = useGitStore.getState().pendingStructuralChanges.find((item) => item.repoPath === 'README.md')
    expect(deleteIntent?.kind).toBe('git-delete-file')

    useGitStore.getState().discardPendingStructuralChange(deleteIntent!.id)
    const nextState = useGitStore.getState()

    expect(nextState.pendingStructuralChanges.find((item) => item.repoPath === 'README.md')).toBeUndefined()
    expect(nextState.stagedChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `git-draft:${documentId}`,
        kind: 'git-draft',
        documentId,
      }),
      expect.objectContaining({
        id: `git-asset:${documentId}:.visualmd-assets/logo.png`,
        kind: 'git-asset',
        documentId,
      }),
    ]))
    expect(nextState.pendingAssetChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `git-asset:${documentId}:.visualmd-assets/banner.png`,
        kind: 'git-asset',
        documentId,
      }),
    ]))
  })

  it('staging a tracked folder deletion removes local asset overlays and adds remote asset files to the delete plan', async () => {
    const documentId = buildGitDocumentId(config, 'docs/readme.md')

    useGitStore.setState({
      treeByPath: {
        '': [{ path: 'docs', name: 'docs', type: 'dir' }],
        docs: [
          { path: 'docs/readme.md', name: 'readme.md', type: 'file', sha: 'doc-sha' },
          { path: 'docs/.visualmd-assets', name: '.visualmd-assets', type: 'dir' },
        ],
        'docs/.visualmd-assets': [
          { path: 'docs/.visualmd-assets/logo.png', name: 'logo.png', type: 'file', sha: 'asset-sha' },
        ],
      },
      remoteSnapshotEntries: {
        docs: { path: 'docs', name: 'docs', type: 'dir' },
        'docs/readme.md': { path: 'docs/readme.md', name: 'readme.md', type: 'file', sha: 'doc-sha' },
        'docs/.visualmd-assets': { path: 'docs/.visualmd-assets', name: '.visualmd-assets', type: 'dir' },
        'docs/.visualmd-assets/logo.png': {
          path: 'docs/.visualmd-assets/logo.png',
          name: 'logo.png',
          type: 'file',
          sha: 'asset-sha',
        },
      },
      drafts: {
        [documentId]: {
          documentId,
          path: 'docs/readme.md',
          name: 'readme.md',
          sha: 'doc-sha',
          content: '# Doc\n',
          originalContent: '# Doc\n',
          draftContent: '# Doc\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: '# Doc\n',
          remoteSha: 'doc-sha',
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
          id: `git-asset:${documentId}:docs/.visualmd-assets/logo.png`,
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: 'docs/.visualmd-assets/logo.png',
          documentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      pendingAssetChanges: [
        {
          id: `git-asset:${documentId}:docs/.visualmd-assets/banner.png`,
          kind: 'git-asset',
          label: 'banner.png',
          repoPath: 'docs/.visualmd-assets/banner.png',
          documentId,
          contentBase64: 'YmFy',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (path === 'docs') {
        return [
          { path: 'docs/readme.md', name: 'readme.md', type: 'file', sha: 'doc-sha' },
          { path: 'docs/.visualmd-assets', name: '.visualmd-assets', type: 'dir' },
        ]
      }
      if (path === 'docs/.visualmd-assets') {
        return [
          { path: 'docs/.visualmd-assets/logo.png', name: 'logo.png', type: 'file', sha: 'asset-sha' },
        ]
      }
      return []
    })

    await useGitStore.getState().stageDeletedGitFolder('docs')
    const nextState = useGitStore.getState()

    expect(nextState.stagedChanges.find((item) => item.kind === 'git-asset')).toBeUndefined()
    expect(nextState.pendingAssetChanges).toEqual([])
    expect(nextState.pendingStructuralChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'git-delete-folder',
        repoPath: 'docs',
      }),
      expect.objectContaining({
        kind: 'git-delete-folder',
        repoPath: 'docs/.visualmd-assets',
      }),
      expect.objectContaining({
        kind: 'git-delete-file',
        repoPath: 'docs/readme.md',
        documentId,
      }),
      expect.objectContaining({
        kind: 'git-delete-file',
        repoPath: 'docs/.visualmd-assets/logo.png',
      }),
    ]))
  })

  it('restores shelved subtree drafts and changes when a pending folder delete is discarded', async () => {
    const trackedDocumentId = buildGitDocumentId(config, 'docs/readme.md')
    const localDocumentId = buildGitDocumentId(config, 'docs/local.md')

    useGitStore.setState({
      treeByPath: {
        '': [{ path: 'docs', name: 'docs', type: 'dir' }],
        docs: [
          { path: 'docs/readme.md', name: 'readme.md', type: 'file', sha: 'doc-sha' },
          { path: 'docs/.visualmd-assets', name: '.visualmd-assets', type: 'dir' },
        ],
        'docs/.visualmd-assets': [
          { path: 'docs/.visualmd-assets/logo.png', name: 'logo.png', type: 'file', sha: 'asset-sha' },
        ],
      },
      remoteSnapshotEntries: {
        docs: { path: 'docs', name: 'docs', type: 'dir' },
        'docs/readme.md': { path: 'docs/readme.md', name: 'readme.md', type: 'file', sha: 'doc-sha' },
        'docs/.visualmd-assets': { path: 'docs/.visualmd-assets', name: '.visualmd-assets', type: 'dir' },
        'docs/.visualmd-assets/logo.png': {
          path: 'docs/.visualmd-assets/logo.png',
          name: 'logo.png',
          type: 'file',
          sha: 'asset-sha',
        },
      },
      drafts: {
        [trackedDocumentId]: {
          documentId: trackedDocumentId,
          path: 'docs/readme.md',
          name: 'readme.md',
          sha: 'doc-sha',
          content: '# Doc\n',
          originalContent: '# Doc\n',
          draftContent: '# Doc\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: '# Doc\n',
          remoteSha: 'doc-sha',
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
        [localDocumentId]: {
          documentId: localDocumentId,
          path: 'docs/local.md',
          name: 'local.md',
          sha: undefined,
          content: '# Local\n',
          originalContent: '# Local\n',
          draftContent: '# Local\n',
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
      stagedChanges: [
        {
          id: `git-draft:${trackedDocumentId}`,
          kind: 'git-draft',
          label: 'readme.md',
          repoPath: 'docs/readme.md',
          documentId: trackedDocumentId,
          content: '# Staged Doc\n',
          originalContent: '# Doc\n',
          baseSha: 'doc-sha',
          originalSha: 'doc-sha',
          updatedAt: 1,
        },
        {
          id: `git-asset:${trackedDocumentId}:docs/.visualmd-assets/logo.png`,
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: 'docs/.visualmd-assets/logo.png',
          documentId: trackedDocumentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      pendingAssetChanges: [
        {
          id: `git-asset:${trackedDocumentId}:docs/.visualmd-assets/banner.png`,
          kind: 'git-asset',
          label: 'banner.png',
          repoPath: 'docs/.visualmd-assets/banner.png',
          documentId: trackedDocumentId,
          contentBase64: 'YmFy',
          updatedAt: 1,
        },
      ],
      pendingStructuralChanges: [
        {
          id: 'git-create-folder:docs/new-sub',
          kind: 'git-create-folder',
          label: 'new-sub',
          repoPath: 'docs/new-sub',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockImplementation(async (_cfg: unknown, path = '') => {
      if (path === 'docs') {
        return [
          { path: 'docs/readme.md', name: 'readme.md', type: 'file', sha: 'doc-sha' },
          { path: 'docs/.visualmd-assets', name: '.visualmd-assets', type: 'dir' },
        ]
      }
      if (path === 'docs/.visualmd-assets') {
        return [
          { path: 'docs/.visualmd-assets/logo.png', name: 'logo.png', type: 'file', sha: 'asset-sha' },
        ]
      }
      return []
    })

    await useGitStore.getState().stageDeletedGitFolder('docs')
    const rootDelete = useGitStore.getState().pendingStructuralChanges.find((item) => item.kind === 'git-delete-folder' && item.repoPath === 'docs')
    expect(rootDelete).toBeDefined()

    useGitStore.getState().discardPendingStructuralChange(rootDelete!.id)
    const nextState = useGitStore.getState()

    expect(nextState.pendingStructuralChanges.find((item) => item.kind === 'git-delete-folder' && item.repoPath === 'docs')).toBeUndefined()
    expect(nextState.drafts[localDocumentId]).toMatchObject({
      path: 'docs/local.md',
      isNew: true,
    })
    expect(nextState.stagedChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `git-draft:${trackedDocumentId}`,
        kind: 'git-draft',
      }),
      expect.objectContaining({
        id: `git-asset:${trackedDocumentId}:docs/.visualmd-assets/logo.png`,
        kind: 'git-asset',
      }),
    ]))
    expect(nextState.pendingAssetChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `git-asset:${trackedDocumentId}:docs/.visualmd-assets/banner.png`,
        kind: 'git-asset',
      }),
    ]))
    expect(nextState.pendingStructuralChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'git-create-folder:docs/new-sub',
        kind: 'git-create-folder',
      }),
    ]))
  })

  it('drops orphan staged and pending assets when discarding a pending draft change that reverts the image reference', () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'doc-sha',
          content: '# Base\n',
          originalContent: '# Base\n',
          draftContent: '# Base\n![logo](.visualmd-assets/logo.png)\n',
          isDirty: true,
          isNew: false,
          fileOrigin: 'remote',
          status: 'dirty',
          remoteContent: '# Base\n',
          remoteSha: 'doc-sha',
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
          id: `git-asset:${documentId}:.visualmd-assets/logo.png`,
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          documentId,
          contentBase64: 'Zm9v',
          updatedAt: 1,
        },
      ],
      pendingAssetChanges: [
        {
          id: `git-asset:${documentId}:.visualmd-assets/logo.png:pending`,
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          documentId,
          contentBase64: 'YmFy',
          updatedAt: 1,
        },
      ],
    })

    useGitStore.getState().discardDraftChange(documentId)
    const nextState = useGitStore.getState()

    expect(nextState.drafts[documentId]).toMatchObject({
      draftContent: '# Base\n',
      isDirty: false,
    })
    expect(nextState.stagedChanges.find((item) => item.documentId === documentId && item.kind === 'git-asset')).toBeUndefined()
    expect(nextState.pendingAssetChanges.find((item) => item.documentId === documentId && item.kind === 'git-asset')).toBeUndefined()
  })

  it('fails refresh early when a staged tracked asset changed remotely after staging', async () => {
    useGitStore.setState({
      treeByPath: {
        '': [
          { path: '.visualmd-assets/logo.png', name: 'logo.png', type: 'file', sha: 'old-asset-sha' },
        ],
      },
      remoteSnapshotEntries: {
        '.visualmd-assets/logo.png': {
          path: '.visualmd-assets/logo.png',
          name: 'logo.png',
          type: 'file',
          sha: 'old-asset-sha',
        },
      },
      remoteSnapshotFetchedAt: 1,
      stagedChanges: [
        {
          id: 'git-asset:doc-1:.visualmd-assets/logo.png',
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          documentId: 'doc-1',
          contentBase64: 'Zm9v',
          baseSha: 'old-asset-sha',
          originalSha: 'old-asset-sha',
          updatedAt: 1,
        },
      ],
    })

    mockClient.listTree.mockResolvedValue([
      { path: '.visualmd-assets/logo.png', name: 'logo.png', type: 'file', sha: 'new-asset-sha' },
    ])

    await expect(
      useGitStore.getState().refreshRepositoryFromRemote()
    ).rejects.toThrow("Remote file '.visualmd-assets/logo.png' changed since the asset was staged")
  })
})
