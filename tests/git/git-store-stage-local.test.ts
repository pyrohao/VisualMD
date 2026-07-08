import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('nanoid', () => ({
  nanoid: () => 'asset01',
}))

import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useGitStore } from '@/stores/gitStore'
import { useTabsStore } from '@/stores/tabsStore'
import { buildGitDocumentId } from '@/lib/git/utils'

const config = {
  provider: 'github' as const,
  token: '',
  ownerOrNamespace: 'owner',
  repo: 'repo',
  branch: 'main',
  baseUrl: '',
  customFlavor: 'gitlab' as const,
}

function resetStores() {
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

  useTabsStore.setState({
    tabs: [],
    activeTabId: null,
  })
}

describe('gitStore stageLocalFile', () => {
  beforeEach(() => {
    resetStores()
  })

  it('marks repository-created local drafts as local-source untracked files before staging', async () => {
    await useGitStore.getState().createFile('docs/new-note.md', '# New\n', 'Create docs/new-note.md')

    const documentId = buildGitDocumentId(config, 'docs/new-note.md')
    const nextDraft = useGitStore.getState().drafts[documentId]

    expect(nextDraft).toMatchObject({
      documentId,
      path: 'docs/new-note.md',
      fileOrigin: 'local',
      isNew: true,
      isDirty: false,
    })
    expect(useGitStore.getState().stagedChanges).toEqual([])
  })

  it('creates a frozen staged git-draft snapshot when a local file is added to Git', () => {
    useFileSystemStore.setState({
      files: [
        {
          id: 'local-1',
          name: 'note.md',
          content: '# Initial\n',
          folderId: null,
          createdAt: 1,
          updatedAt: 1,
          isModified: false,
          sourceType: 'local',
        },
      ],
    } as never)

    useGitStore.getState().stageLocalFile('local-1', 'docs/note.md')

    const firstState = useGitStore.getState()
    expect(firstState.stagedChanges).toEqual([
      expect.objectContaining({
        kind: 'git-draft',
        repoPath: 'docs/note.md',
        content: '# Initial\n',
      }),
    ])

    useFileSystemStore.setState({
      files: [
        {
          id: 'local-1',
          name: 'note.md',
          content: '# Edited later\n',
          folderId: null,
          createdAt: 1,
          updatedAt: 2,
          isModified: true,
          sourceType: 'local',
        },
      ],
    } as never)

    const stagedSnapshot = useGitStore.getState().stagedChanges.find((item) => item.kind === 'git-draft')
    expect(stagedSnapshot?.content).toBe('# Initial\n')
  })

  it('restores a local file back out of Git when a staged local add is unstaged', () => {
    useFileSystemStore.setState({
      files: [
        {
          id: 'local-1',
          name: 'note.md',
          content: '# Initial\n',
          folderId: null,
          createdAt: 1,
          updatedAt: 1,
          isModified: false,
          sourceType: 'local',
        },
      ],
      currentFileId: 'local-1',
    } as never)

    useTabsStore.getState().openFileInTab('note.md', '# Initial\n', 'local-1')
    useGitStore.getState().stageLocalFile('local-1', 'docs/note.md')

    const documentId = buildGitDocumentId(config, 'docs/note.md')
    const stagedChangeId = `git-draft:${documentId}`

    useGitStore.getState().unstageChange(stagedChangeId)

    const nextState = useGitStore.getState()
    expect(nextState.drafts[documentId]).toBeUndefined()
    expect(nextState.stagedChanges).toEqual([])

    const activeTab = useTabsStore.getState().getActiveTab()
    expect(activeTab).toMatchObject({
      sourceType: 'local',
      fileId: 'local-1',
      fileName: 'note.md',
      content: '# Initial\n',
    })
  })

  it('drops a repository-local new file entirely when its staged add is unstaged', async () => {
    await useGitStore.getState().createFile('docs/new-note.md', '# New\n', 'Create docs/new-note.md')

    const documentId = buildGitDocumentId(config, 'docs/new-note.md')
    useGitStore.getState().stageGitDraft(documentId)
    useGitStore.getState().unstageChange(`git-draft:${documentId}`)

    const nextState = useGitStore.getState()
    expect(nextState.drafts[documentId]).toBeUndefined()
    expect(nextState.stagedChanges).toEqual([])
  })

  it('keeps the staged snapshot when a staged draft is edited again until the user explicitly restages', () => {
    const documentId = buildGitDocumentId(config, 'docs/note.md')

    useGitStore.setState({
      drafts: {
        [documentId]: {
          documentId,
          path: 'docs/note.md',
          name: 'note.md',
          sha: 'sha-1',
          content: '# Base\n',
          originalContent: '# Base\n',
          draftContent: '# Base\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: '# Base\n',
          remoteSha: 'sha-1',
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          ownerOrNamespace: config.ownerOrNamespace,
          repo: config.repo,
          branch: config.branch,
        },
      },
      stagedChanges: [
        {
          id: `git-draft:${documentId}`,
          kind: 'git-draft',
          label: 'note.md',
          repoPath: 'docs/note.md',
          documentId,
          content: '# Staged once\n',
          originalContent: '# Base\n',
          baseSha: 'sha-1',
          originalSha: 'sha-1',
          blobSha: 'blob-sha',
          updatedAt: 1,
        },
      ],
    })

    useGitStore.getState().updateDraftContent(documentId, '# Edited again\n')

    const nextState = useGitStore.getState()
    expect(nextState.drafts[documentId]).toMatchObject({
      draftContent: '# Edited again\n',
      isDirty: true,
    })
    expect(nextState.stagedChanges).toEqual([
      expect.objectContaining({
        id: `git-draft:${documentId}`,
        repoPath: 'docs/note.md',
        content: '# Staged once\n',
      }),
    ])
  })

  it('captures remote asset sha in pending asset changes so later staging/commit can update by path+sha', async () => {
    const documentId = buildGitDocumentId(config, 'docs/note.md')
    useGitStore.setState({
      remoteSnapshotEntries: {
        '.visualmd-assets/note-asset01.png': {
          path: '.visualmd-assets/note-asset01.png',
          name: 'note-asset01.png',
          type: 'file',
          sha: 'remote-asset-sha',
        },
      },
      drafts: {
        [documentId]: {
          documentId,
          path: 'docs/note.md',
          name: 'note.md',
          sha: 'doc-sha',
          content: '# Note\n',
          originalContent: '# Note\n',
          draftContent: '# Note\n',
          isDirty: false,
          isNew: false,
          fileOrigin: 'remote',
          status: 'clean',
          remoteContent: '# Note\n',
          remoteSha: 'doc-sha',
          hasRemoteUpdates: false,
          hasConflict: false,
          provider: config.provider,
          ownerOrNamespace: config.ownerOrNamespace,
          repo: config.repo,
          branch: config.branch,
        },
      },
    })

    const file = new File(['binary-content'], 'diagram.png', { type: 'image/png' })
    await useGitStore.getState().uploadAsset(documentId, file)

    expect(useGitStore.getState().pendingAssetChanges).toEqual([
      expect.objectContaining({
        documentId,
        label: 'note-asset01.png',
        repoPath: '.visualmd-assets/note-asset01.png',
        baseSha: 'remote-asset-sha',
        originalSha: 'remote-asset-sha',
      }),
    ])
  })
})
