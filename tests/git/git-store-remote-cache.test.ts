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

describe('gitStore remote cache boundaries', () => {
  beforeEach(() => {
    resetGitState()
  })

  it('opens a clean remote file without storing a duplicate remoteContent copy on the draft', async () => {
    useGitStore.setState({
      remoteSnapshotEntries: {
        'README.md': { path: 'README.md', name: 'README.md', type: 'file', sha: 'sha-1' },
      },
    })

    mockClient.getFile.mockResolvedValue({
      path: 'README.md',
      name: 'README.md',
      sha: 'sha-1',
      content: '# Remote\n',
    })

    const draft = await useGitStore.getState().openFile('README.md')

    expect(draft.originalContent).toBe('# Remote\n')
    expect(draft.draftContent).toBe('# Remote\n')
    expect(draft.remoteContent).toBeUndefined()
    expect(draft.remoteSha).toBeUndefined()
    expect(draft.hasRemoteUpdates).toBe(false)
  })

  it('keeps dirty local edits without persisting remoteContent when the remote file did not change', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'sha-1',
          content: '# Local edit\n',
          originalContent: '# Base\n',
          draftContent: '# Local edit\n',
          isDirty: true,
          isNew: false,
          fileOrigin: 'remote',
          status: 'dirty',
          remoteContent: '# Stale remote copy\n',
          remoteSha: 'stale-sha',
          remoteMissing: false,
          hasRemoteUpdates: true,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      currentDocumentId: documentId,
    })

    mockClient.getFile.mockResolvedValue({
      path: 'README.md',
      name: 'README.md',
      sha: 'sha-1',
      content: '# Base\n',
    })
    mockClient.listTree.mockResolvedValue([
      { path: 'README.md', name: 'README.md', type: 'file', sha: 'sha-1' },
    ])

    const nextDraft = await useGitStore.getState().fetchRemoteFile(documentId)

    expect(nextDraft?.draftContent).toBe('# Local edit\n')
    expect(nextDraft?.originalContent).toBe('# Base\n')
    expect(nextDraft?.isDirty).toBe(true)
    expect(nextDraft?.remoteContent).toBeUndefined()
    expect(nextDraft?.remoteSha).toBeUndefined()
    expect(nextDraft?.hasRemoteUpdates).toBe(false)
  })

  it('checks parent metadata first and skips getFile when the remote sha is unchanged', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'sha-1',
          content: '# Base\n',
          originalContent: '# Base\n',
          draftContent: '# Base\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: undefined,
          remoteSha: undefined,
          remoteMissing: false,
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      currentDocumentId: documentId,
    })

    mockClient.listTree.mockResolvedValue([
      { path: 'README.md', name: 'README.md', type: 'file', sha: 'sha-1' },
    ])

    const nextDraft = await useGitStore.getState().fetchRemoteFile(documentId)

    expect(mockClient.listTree).toHaveBeenCalledTimes(1)
    expect(mockClient.getFile).not.toHaveBeenCalled()
    expect(nextDraft?.draftContent).toBe('# Base\n')
    expect(nextDraft?.remoteContent).toBeUndefined()
  })

  it('reuses the path+sha remote content cache when metadata reports a newer remote sha', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'base-sha',
          content: '# Local edit\n',
          originalContent: '# Base\n',
          draftContent: '# Local edit\n',
          isDirty: true,
          isNew: false,
          fileOrigin: 'remote',
          status: 'dirty',
          remoteContent: undefined,
          remoteSha: undefined,
          remoteMissing: false,
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      remoteContentCache: {
        'README.md': {
          path: 'README.md',
          name: 'README.md',
          sha: 'remote-sha',
          content: '# Remote update\n',
          loadedAt: 1,
        },
      },
      currentDocumentId: documentId,
    })

    mockClient.listTree.mockResolvedValue([
      { path: 'README.md', name: 'README.md', type: 'file', sha: 'remote-sha' },
    ])

    const nextDraft = await useGitStore.getState().fetchRemoteFile(documentId)

    expect(mockClient.listTree).toHaveBeenCalledTimes(1)
    expect(mockClient.getFile).not.toHaveBeenCalled()
    expect(nextDraft?.draftContent).toBe('# Local edit\n')
    expect(nextDraft?.remoteContent).toBe('# Remote update\n')
    expect(nextDraft?.remoteSha).toBe('remote-sha')
    expect(nextDraft?.hasRemoteUpdates).toBe(true)
  })

  it('keeps remoteSnapshotFetchedAt unchanged when only a scoped tree path is loaded', async () => {
    useGitStore.setState({
      remoteSnapshotFetchedAt: 123,
      treeByPath: {
        '': [
          { path: 'docs', name: 'docs', type: 'dir' },
        ],
      },
      remoteSnapshotEntries: {
        docs: { path: 'docs', name: 'docs', type: 'dir' },
      },
    })

    mockClient.listTree.mockResolvedValue([
      { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
    ])

    await useGitStore.getState().loadTree('docs')

    const nextState = useGitStore.getState()
    expect(nextState.remoteSnapshotFetchedAt).toBe(123)
    expect(nextState.lastFetchedAt).not.toBeNull()
    expect(nextState.treeByPath.docs).toEqual([
      { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'sha-guide' },
    ])
  })

  it('keeps remoteSnapshotFetchedAt unchanged when fetchRemoteFile only refreshes parent metadata', async () => {
    const documentId = buildGitDocumentId(config, 'README.md')

    useGitStore.setState({
      remoteSnapshotFetchedAt: 456,
      drafts: {
        [documentId]: {
          documentId,
          path: 'README.md',
          name: 'README.md',
          sha: 'sha-1',
          content: '# Base\n',
          originalContent: '# Base\n',
          draftContent: '# Base\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: undefined,
          remoteSha: undefined,
          remoteMissing: false,
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          repo: config.repo,
          ownerOrNamespace: config.ownerOrNamespace,
          branch: config.branch,
        },
      },
      currentDocumentId: documentId,
    })

    mockClient.listTree.mockResolvedValue([
      { path: 'README.md', name: 'README.md', type: 'file', sha: 'sha-1' },
    ])

    await useGitStore.getState().fetchRemoteFile(documentId)

    const nextState = useGitStore.getState()
    expect(nextState.remoteSnapshotFetchedAt).toBe(456)
    expect(nextState.lastFetchedAt).not.toBeNull()
  })
})
