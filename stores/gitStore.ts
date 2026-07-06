import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import { getGitProviderClient } from '@/lib/git/providers'
import { mergeGitText } from '@/lib/git/merge'
import { hasMeaningfulLocalGitChange, hasMeaningfulRemoteGitChange } from '@/lib/git/sync'
import { isPureLocalNewGitDraft } from '@/lib/git/draft-guards'
import { createIndexedDbPersistStorage } from '@/lib/git-store-persist-storage'
import type { GitBatchCommitAction, GitBranchRef, GitConflictSnapshot, GitDraftFile, GitProviderConfig, GitRepoRef, GitTreeItem, StagedGitChange } from '@/lib/git/types'
import { arrayBufferToBase64, buildGitDocumentId, getGitFileName, joinGitPath, normalizeGitPath, parseGitDocumentId } from '@/lib/git/utils'
import { decryptSecret, encryptSecret, normalizeEncryptedSecret } from '@/lib/secret-storage'
import { useDocumentStore } from './documentStore'
import { useFileSystemStore } from './fileSystemStore'
import { useTabsStore } from './tabsStore'

interface GitStore {
  config: GitProviderConfig
  lastConnectedConfigSignature: string | null
  repos: GitRepoRef[]
  branches: GitBranchRef[]
  treeByPath: Record<string, GitTreeItem[]>
  baseTreeMap: Record<string, string>
  expandedPaths: string[]
  drafts: Record<string, GitDraftFile>
  stagedChanges: StagedGitChange[]
  pendingAssetChanges: StagedGitChange[]
  pendingStructuralChanges: StagedGitChange[]
  currentDocumentId: string | null
  workspaceStateByKey: Record<string, GitWorkspaceState>
  isConnecting: boolean
  isLoadingTree: boolean
  isCommitting: boolean
  isFetchingRemote: boolean
  error: string | null
  pendingCommitMessage: string | null
  connected: boolean
  lastFetchedAt: number | null
  setConfig: (updates: Partial<GitProviderConfig>) => void
  getDecryptedToken: () => string
  clearError: () => void
  clearPendingCommit: () => void
  validateAndLoad: () => Promise<void>
  loadRepos: () => Promise<void>
  loadBranches: () => Promise<void>
  loadTree: (path?: string) => Promise<void>
  refreshRepositoryFromRemote: () => Promise<{
    addedPaths: string[]
    deletedPaths: string[]
    updatedPaths: string[]
    conflictedDocumentIds: string[]
  }>
  toggleExpandedPath: (path: string) => Promise<void>
  openFile: (path: string) => Promise<GitDraftFile>
  setCurrentDocumentId: (documentId: string | null) => void
  updateDraftContent: (documentId: string, content: string) => void
  stageGitDraft: (documentId: string) => void
  stageLocalFile: (fileId: string, repoPath: string) => void
  stageDeletedGitFile: (path: string) => Promise<void>
  stageDeletedGitFolder: (path: string) => Promise<void>
  unstageChange: (changeId: string) => void
  restagePendingAsset: (changeId: string) => void
  stagePendingStructuralChange: (changeId: string) => void
  discardDraftChange: (documentId: string) => void
  discardPendingAsset: (changeId: string) => void
  discardPendingStructuralChange: (changeId: string) => void
  uploadAsset: (documentId: string, file: File) => Promise<{ repoPath: string; draftPath: string }>
  refreshCurrentFile: () => Promise<void>
  fetchRemoteFile: (
    documentId?: string,
    options?: {
      reconcileLocalChanges?: boolean
      blockOnAnyConflict?: boolean
    }
  ) => Promise<GitDraftFile | null>
  syncRemoteStatus: () => Promise<void>
  resolveConflictUsingContent: (documentId: string, content: string) => void
  acceptRemoteVersion: (documentId: string) => void
  acceptLocalVersion: (documentId: string) => void
  commitCurrentFile: (message: string) => Promise<void>
  createFile: (path: string, content: string, message: string) => Promise<void>
  renameFile: (oldPath: string, newPath: string, message: string) => Promise<void>
  deleteFile: (path: string) => Promise<void>
  createFolder: (path: string, message: string) => Promise<void>
  deleteFolder: (path: string) => Promise<void>
}

type GitWorkspaceState = {
  drafts: Record<string, GitDraftFile>
  stagedChanges: StagedGitChange[]
  pendingAssetChanges: StagedGitChange[]
  pendingStructuralChanges: StagedGitChange[]
  currentDocumentId: string | null
  expandedPaths: string[]
  pendingCommitMessage: string | null
  baseTreeMap: Record<string, string>
}

type GitStorePersistedState = {
  config: GitProviderConfig
  lastConnectedConfigSignature: string | null
  connected: boolean
  drafts: Record<string, GitDraftFile>
  stagedChanges: StagedGitChange[]
  pendingAssetChanges: StagedGitChange[]
  pendingStructuralChanges: StagedGitChange[]
  currentDocumentId: string | null
  expandedPaths: string[]
  pendingCommitMessage: string | null
  baseTreeMap: Record<string, string>
  workspaceStateByKey: Record<string, GitWorkspaceState>
}

const DEFAULT_CONFIG: GitProviderConfig = {
  provider: 'github',
  token: '',
  ownerOrNamespace: '',
  repo: '',
  branch: '',
  baseUrl: '',
  customFlavor: 'gitlab',
}

function getConfigError(config: GitProviderConfig) {
  if (!decryptSecret(config.token).trim()) return 'Missing access token'
  if (!config.ownerOrNamespace.trim()) return 'Missing owner or namespace'
  if (!config.repo.trim()) return 'Missing repository name'
  if (config.provider === 'custom' && !config.baseUrl?.trim()) return 'Missing custom API base URL'
  return null
}

function toRuntimeConfig(config: GitProviderConfig): GitProviderConfig {
  return {
    ...config,
    token: decryptSecret(config.token),
  }
}

function buildConfigSignature(config: GitProviderConfig) {
  return JSON.stringify({
    provider: config.provider,
    token: normalizeEncryptedSecret(config.token || ''),
    ownerOrNamespace: config.ownerOrNamespace.trim(),
    repo: config.repo.trim(),
    branch: config.branch.trim(),
    baseUrl: config.baseUrl?.trim() || '',
    customFlavor: config.customFlavor || 'gitlab',
  })
}

function draftReferencesRepoPath(draftPath: string, content: string, repoPath: string) {
  const normalizedDraftPath = normalizeGitPath(draftPath)
  const draftDir = normalizedDraftPath.includes('/')
    ? normalizedDraftPath.split('/').slice(0, -1).join('/')
    : ''
  const relativePath = draftDir && repoPath.startsWith(`${draftDir}/`)
    ? repoPath.slice(draftDir.length + 1)
    : repoPath
  const encodedRelativePath = encodeURI(relativePath)
  const encodedRepoPath = encodeURI(repoPath)

  return (
    content.includes(relativePath) ||
    content.includes(repoPath) ||
    content.includes(encodedRelativePath) ||
    content.includes(encodedRepoPath)
  )
}

function getFolderPlaceholderPath(path: string) {
  return joinGitPath(normalizeGitPath(path), '.gitkeep')
}

function isGitPathWithinFolder(candidatePath: string, folderPath: string) {
  const normalizedCandidatePath = normalizeGitPath(candidatePath)
  const normalizedFolderPath = normalizeGitPath(folderPath)

  return (
    normalizedCandidatePath === normalizedFolderPath ||
    normalizedCandidatePath.startsWith(`${normalizedFolderPath}/`)
  )
}

function resolveDraftAgainstRemoteBase(draft: GitDraftFile, nextContent: string): GitDraftFile {
  const remoteMissing = draft.remoteMissing === true
  const nextBaseContent = remoteMissing
    ? ''
    : (draft.remoteContent ?? draft.originalContent)
  const nextSha = remoteMissing
    ? undefined
    : (draft.remoteSha ?? draft.sha)
  const isDirty = hasMeaningfulLocalGitChange(nextContent, nextBaseContent)
  const status = isDirty ? 'resolved-pending-commit' : 'clean'

  return {
    ...draft,
    sha: nextSha,
    content: nextContent,
    originalContent: nextBaseContent,
    draftContent: nextContent,
    remoteContent: nextBaseContent,
    remoteSha: nextSha,
    remoteMissing,
    conflictResolvedContent: nextContent,
    conflictSnapshot: undefined,
    isDirty,
    status,
    hasConflict: false,
    hasRemoteUpdates: false,
  }
}

function createConflictSnapshot(
  draft: Pick<GitDraftFile, 'originalContent' | 'draftContent' | 'remoteContent' | 'sha' | 'remoteSha'>,
  remoteContent: string,
  remoteSha?: string,
  resolvedContent?: string,
  remoteMissing = false
): GitConflictSnapshot {
  return {
    baseContent: draft.originalContent,
    baseSha: draft.sha,
    localContent: draft.draftContent,
    remoteContent,
    remoteSha: remoteSha ?? draft.remoteSha,
    remoteMissing,
    resolvedContent,
  }
}

function getDraftConflictSnapshot(draft: GitDraftFile) {
  return draft.conflictSnapshot ?? {
    baseContent: draft.originalContent,
    baseSha: draft.sha,
    localContent: draft.draftContent,
    remoteContent: draft.remoteContent ?? draft.originalContent,
    remoteSha: draft.remoteSha,
    remoteMissing: draft.remoteMissing ?? false,
    resolvedContent: draft.conflictResolvedContent,
  }
}

function getDraftStatus(draft: GitDraftFile): NonNullable<GitDraftFile['status']> {
  if (draft.status) {
    return draft.status
  }

  if (draft.hasConflict) {
    return 'conflict'
  }

  if (draft.isDirty || draft.isNew) {
    return 'dirty'
  }

  return 'clean'
}

function isDraftConflictLocked(draft: GitDraftFile) {
  return getDraftStatus(draft) === 'conflict'
}

function getConflictDocumentIds(drafts: Record<string, GitDraftFile>) {
  return Object.values(drafts)
    .filter((draft) => getDraftStatus(draft) === 'conflict')
    .map((draft) => draft.documentId)
}

function getFirstConflictDocumentId(drafts: Record<string, GitDraftFile>) {
  return getConflictDocumentIds(drafts)[0] || null
}

function hasAnyConflictDraft(drafts: Record<string, GitDraftFile>) {
  return getConflictDocumentIds(drafts).length > 0
}

function applyConflictState(
  draft: GitDraftFile,
  remoteContent: string,
  remoteSha: string | undefined,
  resolvedContent: string,
  remoteMissing = false
): GitDraftFile {
  const snapshot = createConflictSnapshot(draft, remoteContent, remoteSha, resolvedContent, remoteMissing)

  return {
    ...draft,
    content: snapshot.localContent,
    draftContent: snapshot.localContent,
    remoteContent: snapshot.remoteContent,
    remoteSha: snapshot.remoteSha,
    remoteMissing,
    status: 'conflict',
    hasConflict: true,
    hasRemoteUpdates: true,
    conflictResolvedContent: resolvedContent,
    conflictSnapshot: snapshot,
  }
}

function syncGitDraftStageState(store: Pick<GitStore, 'drafts' | 'stagedChanges' | 'stageGitDraft' | 'unstageChange'>, documentId: string) {
  const nextDraft = store.drafts[documentId]
  if (!nextDraft) {
    return
  }

  const stagedItem = store.stagedChanges.find((item) => item.kind === 'git-draft' && item.documentId === documentId)
  if (!nextDraft.isDirty && !nextDraft.isNew && stagedItem) {
    store.unstageChange(stagedItem.id)
    return
  }

  if (stagedItem) {
    store.unstageChange(stagedItem.id)
  }
}

function isConflictLikeGitErrorMessage(message: string) {
  const lowerMessage = message.toLowerCase()

  return (
    lowerMessage.includes('conflict') ||
    lowerMessage.includes('sha') ||
    lowerMessage.includes('outdated') ||
    lowerMessage.includes('does not match') ||
    lowerMessage.includes('failed to update') ||
    lowerMessage.includes('already exists') ||
    lowerMessage.includes('last_commit_id') ||
    lowerMessage.includes('fast forward')
  )
}

function getParentGitPath(path: string) {
  const normalizedPath = normalizeGitPath(path)
  return normalizedPath.includes('/')
    ? normalizedPath.split('/').slice(0, -1).join('/')
    : ''
}

function sortGitTreeItems(items: GitTreeItem[]) {
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function upsertGitTreeItem(items: GitTreeItem[], nextItem: GitTreeItem) {
  return sortGitTreeItems([
    ...items.filter((item) => normalizeGitPath(item.path) !== normalizeGitPath(nextItem.path) && item.name !== '.gitkeep'),
    nextItem,
  ])
}

function buildTreeItemsForPath(remoteItems: GitTreeItem[] = []) {
  const itemMap = new Map<string, GitTreeItem>()

  remoteItems
    .filter((item) => item.name !== '.gitkeep')
    .forEach((item) => {
      itemMap.set(normalizeGitPath(item.path), item)
    })

  return sortGitTreeItems(Array.from(itemMap.values()))
}

function buildTreeShaMap(items: GitTreeItem[]) {
  return Object.fromEntries(
    items
      .filter((item) => item.type === 'file')
      .map((item) => [normalizeGitPath(item.path), item.sha || ''])
  )
}

function diffTreeShaMaps(baseTreeMap: Record<string, string>, remoteTreeMap: Record<string, string>) {
  const deletedPaths = Object.keys(baseTreeMap).filter((path) => !(path in remoteTreeMap))
  const addedPaths = Object.keys(remoteTreeMap).filter((path) => !(path in baseTreeMap))
  const updatedPaths = Object.keys(remoteTreeMap).filter((path) => {
    if (!(path in baseTreeMap)) {
      return false
    }

    return remoteTreeMap[path] !== baseTreeMap[path]
  })

  return {
    deletedPaths,
    addedPaths,
    updatedPaths,
  }
}

async function loadCompleteRemoteTree(
  client: ReturnType<typeof getGitProviderClient>,
  config: GitProviderConfig
) {
  const treeByPath: Record<string, GitTreeItem[]> = {}
  const fileItems: GitTreeItem[] = []
  const queue = ['']
  const visited = new Set<string>()

  while (queue.length > 0) {
    const currentPath = normalizeGitPath(queue.shift() || '')
    if (visited.has(currentPath)) {
      continue
    }
    visited.add(currentPath)

    const items = await client.listTree(config, currentPath)
    treeByPath[currentPath] = sortGitTreeItems(items.filter((item) => item.name !== '.gitkeep'))

    items.forEach((item) => {
      if (item.name === '.gitkeep') {
        return
      }

      if (item.type === 'dir') {
        queue.push(normalizeGitPath(item.path))
        return
      }

      fileItems.push({
        ...item,
        path: normalizeGitPath(item.path),
      })
    })
  }

  return {
    treeByPath,
    treeMap: buildTreeShaMap(fileItems),
  }
}

async function loadRemoteFolderSubtree(
  client: ReturnType<typeof getGitProviderClient>,
  config: GitProviderConfig,
  rootPath: string
) {
  const normalizedRootPath = normalizeGitPath(rootPath)
  const queue = [normalizedRootPath]
  const visited = new Set<string>()
  const dirPaths = new Set<string>([normalizedRootPath])
  const fileItems: GitTreeItem[] = []

  while (queue.length > 0) {
    const currentPath = normalizeGitPath(queue.shift() || '')
    if (!currentPath || visited.has(currentPath)) {
      continue
    }
    visited.add(currentPath)

    const items = await client.listTree(config, currentPath)
    for (const item of items) {
      if (item.name === '.gitkeep') {
        continue
      }

      const normalizedItemPath = normalizeGitPath(item.path)
      if (item.type === 'dir') {
        dirPaths.add(normalizedItemPath)
        queue.push(normalizedItemPath)
      } else {
        fileItems.push({
          ...item,
          path: normalizedItemPath,
        })
      }
    }
  }

  return {
    dirPaths: Array.from(dirPaths).sort((a, b) => a.localeCompare(b)),
    fileItems,
  }
}

async function reloadVisibleGitTreePaths(store: Pick<GitStore, 'expandedPaths' | 'loadTree'>) {
  await store.loadTree('')

  const visibleExpandedPaths = store.expandedPaths
    .filter((path) => normalizeGitPath(path).length > 0)
    .sort((a, b) => a.localeCompare(b))

  for (const path of visibleExpandedPaths) {
    await store.loadTree(path)
  }
}

function syncOpenGitTabFromDraft(documentId: string, draft: GitDraftFile | undefined) {
  if (!draft) {
    return
  }

  const tabsStore = useTabsStore.getState()
  const tab = tabsStore.findTabByFileId(documentId)
  if (!tab) {
    return
  }

  tabsStore.updateTabContent(tab.id, draft.draftContent)
  if (draft.hasConflict || draft.isDirty || draft.isNew) {
    tabsStore.markTabAsModified(tab.id, true)
    return
  }

  tabsStore.markTabAsSaved(tab.id, draft.name)
}

function buildGitTabStateFromDraft(draft: GitDraftFile) {
  return {
    fileName: draft.name,
    content: draft.draftContent,
    savedContent: draft.draftContent,
    isModified: draft.isDirty || draft.isNew === true,
    isNew: false,
    fileId: draft.documentId,
    sourceType: 'git' as const,
    gitMeta: {
      provider: draft.provider,
      ownerOrNamespace: draft.ownerOrNamespace,
      repo: draft.repo,
      branch: draft.branch,
      path: draft.path,
      sha: draft.sha,
      fileKind: 'text' as const,
    },
  }
}

function syncLocalTabToGitDraft(localFileId: string, draft: GitDraftFile) {
  const tabsStore = useTabsStore.getState()
  const documentStore = useDocumentStore.getState()
  const localTab = tabsStore.tabs.find((tab) => tab.sourceType !== 'git' && tab.fileId === localFileId) || null
  const gitTab = tabsStore.tabs.find((tab) => tab.sourceType === 'git' && tab.fileId === draft.documentId) || null

  if (!localTab && !gitTab) {
    return false
  }

  const nextTabState = buildGitTabStateFromDraft(draft)

  useTabsStore.setState((state) => {
    const currentLocalTab = state.tabs.find((tab) => tab.sourceType !== 'git' && tab.fileId === localFileId) || null
    const currentGitTab = state.tabs.find((tab) => tab.sourceType === 'git' && tab.fileId === draft.documentId) || null
    let nextTabs = state.tabs
    let nextActiveTabId = state.activeTabId

    if (currentGitTab) {
      nextTabs = nextTabs.map((tab) => (
        tab.id === currentGitTab.id
          ? { ...tab, ...nextTabState }
          : tab
      ))
    }

    if (currentLocalTab) {
      if (currentGitTab && currentGitTab.id !== currentLocalTab.id) {
        nextTabs = nextTabs.filter((tab) => tab.id !== currentLocalTab.id)
        if (state.activeTabId === currentLocalTab.id) {
          nextActiveTabId = currentGitTab.id
        }
      } else {
        nextTabs = nextTabs.map((tab) => (
          tab.id === currentLocalTab.id
            ? { ...tab, ...nextTabState }
            : tab
        ))
      }
    }

    return {
      tabs: nextTabs,
      activeTabId: nextActiveTabId,
    }
  })

  const activeTab = useTabsStore.getState().getActiveTab()
  const shouldReloadDocument = (
    activeTab?.sourceType === 'git' &&
    activeTab.fileId === draft.documentId &&
    (
      documentStore.document?.fileId === localFileId ||
      documentStore.document?.fileId === draft.documentId
    )
  )

  if (shouldReloadDocument) {
    documentStore.loadDocument(draft.draftContent, draft.name, draft.documentId)
    return true
  }

  return activeTab?.sourceType === 'git' && activeTab.fileId === draft.documentId
}

function ensureTreePath(
  treeByPath: Record<string, GitTreeItem[]>,
  path: string,
  leafType: GitTreeItem['type']
) {
  const normalizedPath = normalizeGitPath(path)
  if (!normalizedPath) {
    return treeByPath
  }

  const nextTreeByPath = { ...treeByPath }
  const segments = normalizedPath.split('/').filter(Boolean)
  let currentPath = ''

  segments.forEach((segment, index) => {
    const parentPath = currentPath
    currentPath = currentPath ? joinGitPath(currentPath, segment) : segment
    const isLeaf = index === segments.length - 1
    const nextType: GitTreeItem['type'] = isLeaf ? leafType : 'dir'
    const item: GitTreeItem = {
      path: currentPath,
      name: segment,
      type: nextType,
    }

    nextTreeByPath[parentPath] = upsertGitTreeItem(nextTreeByPath[parentPath] || [], item)
    if (nextType === 'dir' && !nextTreeByPath[currentPath]) {
      nextTreeByPath[currentPath] = []
    }
  })

  return nextTreeByPath
}

function createAssetFileName(draftPath: string, file: File) {
  const normalizedDraftPath = normalizeGitPath(draftPath)
  const baseName = getGitFileName(normalizedDraftPath).replace(/\.[^.]+$/, '') || 'document'
  const extension = file.name.includes('.')
    ? file.name.split('.').pop()?.toLowerCase() || 'png'
    : file.type.split('/')[1]?.toLowerCase() || 'png'
  const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'png'
  const shortSuffix = nanoid(6).toLowerCase()
  return `${baseName}-${shortSuffix}.${safeExtension}`
}

function sanitizePersistedDrafts(input: unknown): Record<string, GitDraftFile> {
  if (!input || typeof input !== 'object') return {}

  return Object.fromEntries(
    Object.entries(input as Record<string, GitDraftFile>).map(([documentId, draft]) => {
      const status = draft.status || (
        draft.hasConflict
          ? 'conflict'
          : (draft.isDirty || draft.isNew)
            ? 'dirty'
            : 'clean'
      )

      return [documentId, {
        ...draft,
        status,
      }]
    })
  )
}

function sanitizePersistedStagedChanges(input: unknown): StagedGitChange[] {
  if (!Array.isArray(input)) return []
  return input as StagedGitChange[]
}

function sanitizePersistedPendingAssetChanges(input: unknown): StagedGitChange[] {
  if (!Array.isArray(input)) return []
  return input.filter((item): item is StagedGitChange => (
    !!item &&
    typeof item === 'object' &&
    (item as StagedGitChange).kind === 'git-asset' &&
    typeof (item as StagedGitChange).id === 'string' &&
    typeof (item as StagedGitChange).repoPath === 'string' &&
    typeof (item as StagedGitChange).label === 'string'
  ))
}

function sanitizePersistedPendingStructuralChanges(input: unknown): StagedGitChange[] {
  if (!Array.isArray(input)) return []
  return input.filter((item): item is StagedGitChange => (
    !!item &&
    typeof item === 'object' &&
    ((item as StagedGitChange).kind === 'git-create-folder' ||
      (item as StagedGitChange).kind === 'git-delete-file' ||
      (item as StagedGitChange).kind === 'git-delete-folder') &&
    typeof (item as StagedGitChange).id === 'string' &&
    typeof (item as StagedGitChange).repoPath === 'string' &&
    typeof (item as StagedGitChange).label === 'string'
  ))
}

function sanitizePersistedExpandedPaths(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.filter((item): item is string => typeof item === 'string')
}

function createEmptyGitWorkspaceState(): GitWorkspaceState {
  return {
    drafts: {},
    stagedChanges: [],
    pendingAssetChanges: [],
    pendingStructuralChanges: [],
    currentDocumentId: null,
    expandedPaths: [],
    pendingCommitMessage: null,
    baseTreeMap: {},
  }
}

function sanitizePersistedWorkspaceState(input: unknown): GitWorkspaceState {
  if (!input || typeof input !== 'object') {
    return createEmptyGitWorkspaceState()
  }

  const state = input as Partial<GitWorkspaceState>
  const drafts = sanitizePersistedDrafts(state.drafts)
  const currentDocumentId =
    typeof state.currentDocumentId === 'string' && drafts[state.currentDocumentId]
      ? state.currentDocumentId
      : null

  return {
    drafts,
    stagedChanges: sanitizePersistedStagedChanges(state.stagedChanges),
    pendingAssetChanges: sanitizePersistedPendingAssetChanges(state.pendingAssetChanges),
    pendingStructuralChanges: sanitizePersistedPendingStructuralChanges(state.pendingStructuralChanges),
    currentDocumentId,
    expandedPaths: sanitizePersistedExpandedPaths(state.expandedPaths),
    pendingCommitMessage: typeof state.pendingCommitMessage === 'string' ? state.pendingCommitMessage : null,
    baseTreeMap:
      state.baseTreeMap && typeof state.baseTreeMap === 'object'
        ? state.baseTreeMap as Record<string, string>
        : {},
  }
}

function sanitizePersistedWorkspaceStateByKey(input: unknown): Record<string, GitWorkspaceState> {
  if (!input || typeof input !== 'object') return {}

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([key]) => typeof key === 'string' && key.length > 0)
      .map(([key, value]) => [key, sanitizePersistedWorkspaceState(value)])
  )
}

function normalizeSupportedProvider(provider: GitProviderConfig['provider'] | undefined): GitProviderConfig['provider'] {
  return provider === 'gitee' ? 'gitee' : 'github'
}

function buildGitWorkspaceKey(config: Pick<GitProviderConfig, 'provider' | 'ownerOrNamespace' | 'repo' | 'branch'>) {
  const provider = normalizeSupportedProvider(config.provider)
  const ownerOrNamespace = config.ownerOrNamespace.trim()
  const repo = config.repo.trim()
  const branch = config.branch.trim()

  if (!ownerOrNamespace || !repo || !branch) {
    return null
  }

  return `${provider}:${ownerOrNamespace}:${repo}:${branch}`
}

function captureGitWorkspaceState(
  state: Pick<GitStore, 'drafts' | 'stagedChanges' | 'pendingAssetChanges' | 'pendingStructuralChanges' | 'currentDocumentId' | 'expandedPaths' | 'pendingCommitMessage' | 'baseTreeMap'>
): GitWorkspaceState {
  return {
    drafts: state.drafts,
    stagedChanges: state.stagedChanges,
    pendingAssetChanges: state.pendingAssetChanges,
    pendingStructuralChanges: state.pendingStructuralChanges,
    currentDocumentId:
      state.currentDocumentId && state.drafts[state.currentDocumentId]
        ? state.currentDocumentId
        : null,
    expandedPaths: state.expandedPaths,
    pendingCommitMessage: state.pendingCommitMessage || null,
    baseTreeMap: state.baseTreeMap,
  }
}

function upsertWorkspaceStateForConfig(
  workspaceStateByKey: Record<string, GitWorkspaceState>,
  config: Pick<GitProviderConfig, 'provider' | 'ownerOrNamespace' | 'repo' | 'branch'>,
  workspaceState: GitWorkspaceState
) {
  const key = buildGitWorkspaceKey(config)
  if (!key) return workspaceStateByKey

  return {
    ...workspaceStateByKey,
    [key]: sanitizePersistedWorkspaceState(workspaceState),
  }
}

function getWorkspaceStateForConfig(
  workspaceStateByKey: Record<string, GitWorkspaceState>,
  config: Pick<GitProviderConfig, 'provider' | 'ownerOrNamespace' | 'repo' | 'branch'>
) {
  const key = buildGitWorkspaceKey(config)
  if (!key) {
    return createEmptyGitWorkspaceState()
  }

  return workspaceStateByKey[key] || createEmptyGitWorkspaceState()
}

function resolveGitWorkspaceTransition(
  state: Pick<GitStore, 'config' | 'drafts' | 'stagedChanges' | 'pendingAssetChanges' | 'pendingStructuralChanges' | 'currentDocumentId' | 'expandedPaths' | 'pendingCommitMessage' | 'baseTreeMap' | 'workspaceStateByKey'>,
  nextConfig: GitProviderConfig
) {
  const currentWorkspaceKey = buildGitWorkspaceKey(state.config)
  const nextWorkspaceKey = buildGitWorkspaceKey(nextConfig)
  const currentWorkspaceState = captureGitWorkspaceState(state)
  const nextWorkspaceStateByKey = currentWorkspaceKey
    ? upsertWorkspaceStateForConfig(state.workspaceStateByKey, state.config, currentWorkspaceState)
    : state.workspaceStateByKey
  const nextWorkspaceState = currentWorkspaceKey === nextWorkspaceKey
    ? currentWorkspaceState
    : getWorkspaceStateForConfig(nextWorkspaceStateByKey, nextConfig)

  return {
    workspaceStateByKey: nextWorkspaceStateByKey,
    ...nextWorkspaceState,
  }
}

function resolveGitWorkspaceConfigForDocumentId(state: Pick<GitStore, 'config'>, documentId: string) {
  const parsed = parseGitDocumentId(documentId)
  if (!parsed) {
    return null
  }

  return {
    ...state.config,
    provider: normalizeSupportedProvider(parsed.provider),
    ownerOrNamespace: parsed.ownerOrNamespace,
    repo: parsed.repo,
    branch: parsed.branch,
  }
}

export function migrateGitStorePersistedState(
  persistedState: unknown,
  fromVersion: number
): Partial<GitStorePersistedState> {
  if (!persistedState || typeof persistedState !== 'object') {
    return {}
  }

  const state = persistedState as Partial<GitStorePersistedState>
  const normalizedConfig: GitProviderConfig = {
    ...DEFAULT_CONFIG,
    ...(state.config || {}),
    token: normalizeEncryptedSecret(state.config?.token || ''),
    provider: normalizeSupportedProvider(state.config?.provider),
  }
  const normalizedWorkspaceStateByKey = sanitizePersistedWorkspaceStateByKey(state.workspaceStateByKey)
  const legacyWorkspaceState = sanitizePersistedWorkspaceState({
    drafts: state.drafts,
    stagedChanges: state.stagedChanges,
    pendingAssetChanges: state.pendingAssetChanges,
    pendingStructuralChanges: state.pendingStructuralChanges,
    currentDocumentId: state.currentDocumentId,
    expandedPaths: state.expandedPaths,
    pendingCommitMessage: state.pendingCommitMessage,
    baseTreeMap: state.baseTreeMap,
  })
  const migratedWorkspaceStateByKey = fromVersion < 3
    ? upsertWorkspaceStateForConfig(normalizedWorkspaceStateByKey, normalizedConfig, legacyWorkspaceState)
    : normalizedWorkspaceStateByKey
  const currentWorkspaceState = buildGitWorkspaceKey(normalizedConfig)
    ? getWorkspaceStateForConfig(migratedWorkspaceStateByKey, normalizedConfig)
    : legacyWorkspaceState

  // v1 only persisted connection config. v2 adds a single global Git workspace.
  // v3 buckets Git workspace state by provider + owner/namespace + repo + branch.
  // v4 adds pending structural Git changes separate from staged changes.
  if (fromVersion < 2) {
    return {
      config: normalizedConfig,
      lastConnectedConfigSignature: state.lastConnectedConfigSignature || null,
      connected: state.connected === true,
      drafts: currentWorkspaceState.drafts,
      stagedChanges: currentWorkspaceState.stagedChanges,
      pendingAssetChanges: currentWorkspaceState.pendingAssetChanges,
      pendingStructuralChanges: currentWorkspaceState.pendingStructuralChanges,
      currentDocumentId: currentWorkspaceState.currentDocumentId,
      expandedPaths: currentWorkspaceState.expandedPaths,
      pendingCommitMessage: currentWorkspaceState.pendingCommitMessage,
      baseTreeMap: currentWorkspaceState.baseTreeMap,
      workspaceStateByKey: migratedWorkspaceStateByKey,
    }
  }

  return {
    ...state,
    config: normalizedConfig,
    lastConnectedConfigSignature: state.lastConnectedConfigSignature || null,
    connected: state.connected === true,
    drafts: currentWorkspaceState.drafts,
    stagedChanges: currentWorkspaceState.stagedChanges,
    pendingAssetChanges: currentWorkspaceState.pendingAssetChanges,
    pendingStructuralChanges: currentWorkspaceState.pendingStructuralChanges,
    currentDocumentId: currentWorkspaceState.currentDocumentId,
    expandedPaths: currentWorkspaceState.expandedPaths,
    pendingCommitMessage: currentWorkspaceState.pendingCommitMessage,
    baseTreeMap: currentWorkspaceState.baseTreeMap,
    workspaceStateByKey: migratedWorkspaceStateByKey,
  }
}

export const useGitStore = create<GitStore>()(
  devtools(
    persist(
      (set, get) => ({
        config: DEFAULT_CONFIG,
        lastConnectedConfigSignature: null,
        repos: [],
        branches: [],
        treeByPath: {},
        baseTreeMap: {},
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
        connected: false,
        lastFetchedAt: null,

        setConfig: (updates) => {
          set((state) => {
            const nextConfig = {
              ...state.config,
              ...updates,
              token: updates.token !== undefined ? encryptSecret(updates.token) : state.config.token,
              provider: normalizeSupportedProvider(
                (updates.provider as GitProviderConfig['provider'] | undefined) ?? state.config.provider
              ),
            }
            const nextSignature = buildConfigSignature(nextConfig)
            const configChanged = nextSignature !== state.lastConnectedConfigSignature
            const nextWorkspace = resolveGitWorkspaceTransition(state, nextConfig)

            return {
              config: nextConfig,
              workspaceStateByKey: nextWorkspace.workspaceStateByKey,
              drafts: nextWorkspace.drafts,
              stagedChanges: nextWorkspace.stagedChanges,
              pendingAssetChanges: nextWorkspace.pendingAssetChanges,
              pendingStructuralChanges: nextWorkspace.pendingStructuralChanges,
              currentDocumentId: nextWorkspace.currentDocumentId,
              connected: configChanged ? false : state.connected,
              repos: configChanged ? [] : state.repos,
              branches: configChanged ? [] : state.branches,
              treeByPath: configChanged ? {} : state.treeByPath,
              baseTreeMap: configChanged ? {} : state.baseTreeMap,
              expandedPaths: nextWorkspace.expandedPaths,
            }
          })
        },

        getDecryptedToken: () => decryptSecret(get().config.token),

        clearError: () => set({ error: null }),
        clearPendingCommit: () => set({ pendingCommitMessage: null }),

        validateAndLoad: async () => {
          const { config } = get()
          const validationError = getConfigError(config)
          if (validationError) {
            set({ error: validationError, connected: false })
            throw new Error(validationError)
          }

          set({ isConnecting: true, error: null })
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            await client.validateConnection(runtimeConfig)
            const branches = await client.getBranches(runtimeConfig)
            const nextBranch = config.branch || branches[0]?.name || 'main'
            const nextConfig = { ...config, branch: nextBranch }
            set((state) => {
              const nextWorkspace = resolveGitWorkspaceTransition(state, nextConfig)

              return {
                branches,
                config: nextConfig,
                connected: true,
                lastConnectedConfigSignature: buildConfigSignature(nextConfig),
                treeByPath: {},
                baseTreeMap: nextWorkspace.baseTreeMap,
                workspaceStateByKey: nextWorkspace.workspaceStateByKey,
                drafts: nextWorkspace.drafts,
                stagedChanges: nextWorkspace.stagedChanges,
                pendingAssetChanges: nextWorkspace.pendingAssetChanges,
                pendingStructuralChanges: nextWorkspace.pendingStructuralChanges,
                currentDocumentId: nextWorkspace.currentDocumentId,
                expandedPaths: nextWorkspace.expandedPaths,
              }
            })
            if (hasAnyConflictDraft(get().drafts)) {
              await get().loadTree('')
            } else {
              await get().refreshRepositoryFromRemote()
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to connect'
            set({ error: message, connected: false })
            throw error
          } finally {
            set({ isConnecting: false })
          }
        },

        loadRepos: async () => {
          const { config } = get()
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            const repos = await client.listRepos(runtimeConfig)
            set({ repos })
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Failed to load repositories' })
          }
        },

        loadBranches: async () => {
          const { config } = get()
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            const branches = await client.getBranches(runtimeConfig)
            set({ branches })
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Failed to load branches' })
          }
        },

        loadTree: async (path = '') => {
          const { config } = get()
          set({ isLoadingTree: true, error: null })
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            const normalizedPath = normalizeGitPath(path)
            const items = await client.listTree(runtimeConfig, normalizedPath)
            set((state) => ({
              treeByPath: {
                ...state.treeByPath,
                [normalizedPath]: buildTreeItemsForPath(items),
              },
            }))
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Failed to load repository tree' })
            throw error
          } finally {
            set({ isLoadingTree: false })
          }
        },

        toggleExpandedPath: async (path) => {
          const normalizedPath = normalizeGitPath(path)
          const isExpanded = get().expandedPaths.includes(normalizedPath)
          if (isExpanded) {
            set((state) => ({
              expandedPaths: state.expandedPaths.filter((item) => item !== normalizedPath),
            }))
            return
          }

          if (!get().treeByPath[normalizedPath]) {
            await get().loadTree(normalizedPath)
          }

          set((state) => ({
            expandedPaths: [...state.expandedPaths, normalizedPath],
          }))
        },

        openFile: async (path) => {
          const { config } = get()
          const normalizedPath = normalizeGitPath(path)
          const existingDraft = Object.values(get().drafts).find((item) => item.path === normalizedPath)
          if (existingDraft && (existingDraft.isNew || existingDraft.isDirty)) {
            set({ currentDocumentId: existingDraft.documentId })
            return existingDraft
          }

          const runtimeConfig = toRuntimeConfig(config)
          const client = getGitProviderClient(runtimeConfig)
          const file = await client.getFile(runtimeConfig, normalizedPath)
          const documentId = buildGitDocumentId(config, normalizedPath)
          const draft: GitDraftFile = {
            documentId,
            path: normalizedPath,
            name: file.name || getGitFileName(normalizedPath),
            sha: file.sha,
            content: file.content,
            originalContent: file.content,
            draftContent: file.content,
            isDirty: false,
            isNew: false,
            creationSource: undefined,
            status: 'clean',
            remoteContent: file.content,
            remoteSha: file.sha,
            remoteMissing: false,
            hasRemoteUpdates: false,
            hasConflict: false,
            lastCheckedAt: Date.now(),
            provider: config.provider,
            repo: config.repo,
            ownerOrNamespace: config.ownerOrNamespace,
            branch: config.branch,
          }
          set((state) => ({
            drafts: {
              ...state.drafts,
              [documentId]: draft,
            },
            currentDocumentId: documentId,
            lastFetchedAt: Date.now(),
          }))
          return draft
        },

        setCurrentDocumentId: (documentId) => {
          if (!documentId) {
            set({ currentDocumentId: null })
            return
          }

          set((state) => {
            const nextConfig = resolveGitWorkspaceConfigForDocumentId(state, documentId)
            if (!nextConfig) {
              return { currentDocumentId: documentId }
            }

            const currentWorkspaceKey = buildGitWorkspaceKey(state.config)
            const nextWorkspaceKey = buildGitWorkspaceKey(nextConfig)
            const nextWorkspace = resolveGitWorkspaceTransition(state, nextConfig)
            const workspaceChanged = currentWorkspaceKey !== nextWorkspaceKey

            return {
              config: nextConfig,
              workspaceStateByKey: nextWorkspace.workspaceStateByKey,
              drafts: nextWorkspace.drafts,
              stagedChanges: nextWorkspace.stagedChanges,
              pendingAssetChanges: nextWorkspace.pendingAssetChanges,
              pendingStructuralChanges: nextWorkspace.pendingStructuralChanges,
              currentDocumentId: documentId,
              expandedPaths: nextWorkspace.expandedPaths,
              branches: workspaceChanged ? [] : state.branches,
              treeByPath: workspaceChanged ? {} : state.treeByPath,
              baseTreeMap: workspaceChanged ? {} : state.baseTreeMap,
            }
          })
        },

        updateDraftContent: (documentId, content) => {
          set((state) => {
            const draft = state.drafts[documentId]
            if (!draft) return state
            if (!hasMeaningfulLocalGitChange(content, draft.draftContent)) {
              return state
            }
            const currentStatus = getDraftStatus(draft)
            const nextStatus =
              currentStatus === 'conflict'
                ? 'conflict'
                : hasMeaningfulLocalGitChange(content, draft.originalContent)
                  ? 'dirty'
                  : 'clean'
            const nextDraft: GitDraftFile = {
              ...draft,
              content,
              draftContent: content,
              isDirty: hasMeaningfulLocalGitChange(content, draft.originalContent),
              status: nextStatus,
              conflictSnapshot:
                currentStatus === 'conflict'
                  ? {
                      ...getDraftConflictSnapshot(draft),
                      resolvedContent: content,
                    }
                  : draft.conflictSnapshot,
              conflictResolvedContent:
                currentStatus === 'conflict'
                  ? content
                  : draft.conflictResolvedContent,
            }
            return {
              drafts: {
                ...state.drafts,
                [documentId]: nextDraft,
              },
              pendingAssetChanges: state.pendingAssetChanges.filter((item) => {
                if (item.kind !== 'git-asset' || item.documentId !== documentId) {
                  return true
                }

                return draftReferencesRepoPath(draft.path, content, item.repoPath)
              }),
              pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => !(
                item.kind === 'git-delete-file' &&
                item.documentId === documentId
              )),
              stagedChanges: state.stagedChanges.filter((item) => {
                if (item.kind === 'git-delete-file' && item.documentId === documentId) {
                  return false
                }

                if (item.kind !== 'git-asset' || item.documentId !== documentId) {
                  return true
                }

                return draftReferencesRepoPath(draft.path, content, item.repoPath)
              }),
            }
          })

          const stagedItem = get().stagedChanges.find((item) => item.kind === 'git-draft' && item.documentId === documentId)
          if (stagedItem) {
            get().unstageChange(stagedItem.id)
          }
        },

        stageGitDraft: (documentId) => {
          set((state) => {
            const draft = state.drafts[documentId]
            if (!draft || (!draft.isDirty && !draft.isNew)) return state
            if (
              state.stagedChanges.some((item) => item.kind === 'git-delete-file' && item.documentId === documentId) ||
              state.pendingStructuralChanges.some((item) => item.kind === 'git-delete-file' && item.documentId === documentId) ||
              state.stagedChanges.some((item) => item.kind === 'git-delete-folder' && isGitPathWithinFolder(draft.path, item.repoPath)) ||
              state.pendingStructuralChanges.some((item) => item.kind === 'git-delete-folder' && isGitPathWithinFolder(draft.path, item.repoPath))
            ) {
              return state
            }

            const existing = state.stagedChanges.find((item) => item.kind === 'git-draft' && item.documentId === documentId)
            const nextChange: StagedGitChange = {
              id: existing?.id || `git-draft:${documentId}`,
              kind: 'git-draft',
              label: draft.name,
              repoPath: draft.path,
              documentId,
              updatedAt: Date.now(),
            }

            return {
              stagedChanges: existing
                ? state.stagedChanges.map((item) => item.id === existing.id ? nextChange : item)
                : [...state.stagedChanges, nextChange],
            }
          })
        },

        stageLocalFile: (fileId, repoPath) => {
          if (!get().connected) {
            throw new Error('Connect a repository first')
          }

          const file = useFileSystemStore.getState().files.find((item) => item.id === fileId)
          if (!file) return

          const normalizedRepoPath = normalizeGitPath(repoPath)
          const currentLocalTab = useTabsStore.getState().tabs.find((tab) => tab.sourceType !== 'git' && tab.fileId === fileId)
          const nextContent = currentLocalTab?.content ?? file.content
          const documentId = buildGitDocumentId(get().config, normalizedRepoPath)

          set((state) => {
            const existingDraft = state.drafts[documentId]
            const isExistingDraftDirty = existingDraft && !existingDraft.isNew
              ? hasMeaningfulLocalGitChange(nextContent, existingDraft.originalContent)
              : false
            const nextDraft: GitDraftFile = existingDraft
              ? {
                  ...existingDraft,
                  path: normalizedRepoPath,
                  name: getGitFileName(normalizedRepoPath),
                  content: nextContent,
                  draftContent: nextContent,
                  isDirty: existingDraft.isNew
                    ? nextContent.length > 0
                    : isExistingDraftDirty,
                  status: existingDraft.isNew
                    ? (nextContent.length > 0 ? 'dirty' : 'clean')
                    : (isExistingDraftDirty ? 'dirty' : 'clean'),
                  creationSource: existingDraft.creationSource ?? 'local',
                  provider: state.config.provider,
                  repo: state.config.repo,
                  ownerOrNamespace: state.config.ownerOrNamespace,
                  branch: state.config.branch,
                }
              : {
                  documentId,
                  path: normalizedRepoPath,
                  name: getGitFileName(normalizedRepoPath),
                  sha: undefined,
                  content: nextContent,
                  originalContent: '',
                  draftContent: nextContent,
                  isDirty: nextContent.length > 0,
                  isNew: true,
                  creationSource: 'local',
                  status: nextContent.length > 0 ? 'dirty' : 'clean',
                  remoteContent: undefined,
                  remoteSha: undefined,
                  hasRemoteUpdates: false,
                  hasConflict: false,
                  lastCheckedAt: Date.now(),
                  provider: state.config.provider,
                  repo: state.config.repo,
                  ownerOrNamespace: state.config.ownerOrNamespace,
                  branch: state.config.branch,
                }
            const nextStagedChanges = state.stagedChanges.filter((item) => !(
              (item.kind === 'local-file' && item.localFileId === fileId) ||
              (item.kind === 'git-draft' && item.documentId === documentId)
            ))

            return {
              drafts: {
                ...state.drafts,
                [documentId]: nextDraft,
              },
              stagedChanges: nextStagedChanges,
            }
          })

          const stagedDraft = get().drafts[documentId]
          if (!stagedDraft) {
            return
          }
          const activatedGitTab = syncLocalTabToGitDraft(fileId, stagedDraft)
          syncOpenGitTabFromDraft(documentId, stagedDraft)

          if (activatedGitTab) {
            set({ currentDocumentId: documentId })
          }
        },

        stageDeletedGitFile: async (path) => {
          const { drafts } = get()
          const normalizedPath = normalizeGitPath(path)
          const existingDraft =
            Object.values(drafts).find((item) => item.path === normalizedPath) ||
            await get().openFile(normalizedPath)

          if (existingDraft.isNew) {
            set((state) => {
              const nextDrafts = { ...state.drafts }
              delete nextDrafts[existingDraft.documentId]
              return {
                drafts: nextDrafts,
                stagedChanges: state.stagedChanges.filter((item) => !(
                  (item.kind === 'git-draft' && item.documentId === existingDraft.documentId) ||
                  (item.kind === 'git-asset' && item.documentId === existingDraft.documentId) ||
                  normalizeGitPath(item.repoPath) === normalizedPath
                )),
                pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.documentId !== existingDraft.documentId),
                pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => !(
                  item.repoPath === normalizedPath ||
                  normalizeGitPath(item.repoPath).startsWith(`${normalizedPath}/`)
                )),
                currentDocumentId: state.currentDocumentId === existingDraft.documentId ? null : state.currentDocumentId,
              }
            })
            return
          }

          set((state) => ({
            stagedChanges: [
              ...state.stagedChanges.filter((item) => !(
                (item.kind === 'git-draft' && item.documentId === existingDraft.documentId) ||
                (item.kind === 'git-delete-file' && item.repoPath === normalizedPath)
              )),
            ],
            pendingStructuralChanges: [
              ...state.pendingStructuralChanges.filter((item) => !(item.kind === 'git-delete-file' && item.repoPath === normalizedPath)),
              {
                id: `git-delete-file:${normalizedPath}`,
                kind: 'git-delete-file',
                label: existingDraft.name,
                repoPath: normalizedPath,
                documentId: existingDraft.documentId,
                originalContent: existingDraft.originalContent,
                originalSha: existingDraft.sha,
                updatedAt: Date.now(),
              },
            ],
          }))
        },

        stageDeletedGitFolder: async (path) => {
          const normalizedPath = normalizeGitPath(path)
          const localCreatedFolder =
            get().pendingStructuralChanges.find((item) => item.kind === 'git-create-folder' && normalizeGitPath(item.repoPath) === normalizedPath) ||
            get().stagedChanges.find((item) => item.kind === 'git-create-folder' && normalizeGitPath(item.repoPath) === normalizedPath)
          if (localCreatedFolder) {
            const removedDocumentIds = Object.values(get().drafts)
              .filter((draft) => draft.isNew && isGitPathWithinFolder(draft.path, normalizedPath))
              .map((draft) => draft.documentId)

            set((state) => {
              const nextDrafts = { ...state.drafts }
              removedDocumentIds.forEach((documentId) => {
                delete nextDrafts[documentId]
              })

              return {
                drafts: nextDrafts,
                stagedChanges: state.stagedChanges.filter((item) => {
                  if (item.id === localCreatedFolder.id) {
                    return false
                  }

                  if (isGitPathWithinFolder(item.repoPath, normalizedPath)) {
                    return false
                  }

                  return !removedDocumentIds.includes(item.documentId || '')
                }),
                pendingAssetChanges: state.pendingAssetChanges.filter((item) => !isGitPathWithinFolder(item.repoPath, normalizedPath)),
                pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => {
                  if (item.id === localCreatedFolder.id) {
                    return false
                  }

                  return !isGitPathWithinFolder(item.repoPath, normalizedPath)
                }),
                currentDocumentId:
                  state.currentDocumentId && removedDocumentIds.includes(state.currentDocumentId)
                    ? null
                    : state.currentDocumentId,
              }
            })

            removedDocumentIds.forEach((documentId) => {
              const tab = useTabsStore.getState().findTabByFileId(documentId)
              if (tab) {
                useTabsStore.getState().closeTab(tab.id)
              }
            })
            return
          }

          const runtimeConfig = toRuntimeConfig(get().config)
          const client = getGitProviderClient(runtimeConfig)
          const { dirPaths, fileItems } = await loadRemoteFolderSubtree(client, runtimeConfig, normalizedPath)
          const deleteTimestamp = Date.now()
          const removedPureLocalDrafts = Object.values(get().drafts).filter((draft) => (
            draft.isNew && isGitPathWithinFolder(draft.path, normalizedPath)
          ))

          set((state) => {
            const nextDrafts = { ...state.drafts }
            const removedPureLocalDocumentIds = removedPureLocalDrafts.map((draft) => draft.documentId)

            removedPureLocalDrafts.forEach((draft) => {
              if (nextDrafts[draft.documentId]) {
                delete nextDrafts[draft.documentId]
              }
            })

            const deleteFileChanges = fileItems.map<StagedGitChange>((item) => {
              const existingDraft = Object.values(state.drafts).find((draft) => normalizeGitPath(draft.path) === normalizeGitPath(item.path))
              const documentId = existingDraft?.documentId || buildGitDocumentId(state.config, item.path)

              return {
                id: `git-delete-file:${normalizeGitPath(item.path)}`,
                kind: 'git-delete-file',
                label: getGitFileName(item.path),
                repoPath: normalizeGitPath(item.path),
                documentId,
                originalContent: existingDraft?.originalContent,
                originalSha: existingDraft?.sha || item.sha,
                updatedAt: deleteTimestamp,
              }
            })
            const deleteFolderChanges = dirPaths
              .sort((a, b) => a.localeCompare(b))
              .map<StagedGitChange>((dirPath) => ({
                id: `git-delete-folder:${normalizeGitPath(dirPath)}`,
                kind: 'git-delete-folder',
                label: getGitFileName(dirPath),
                repoPath: normalizeGitPath(dirPath),
                updatedAt: deleteTimestamp,
              }))

            return {
              drafts: nextDrafts,
              stagedChanges: state.stagedChanges.filter((item) => {
                if (removedPureLocalDocumentIds.includes(item.documentId || '')) {
                  return false
                }

                if (isGitPathWithinFolder(item.repoPath, normalizedPath)) {
                  return false
                }

                return true
              }),
              pendingAssetChanges: state.pendingAssetChanges.filter((item) => !isGitPathWithinFolder(item.repoPath, normalizedPath)),
              pendingStructuralChanges: [
                ...state.pendingStructuralChanges.filter((item) => !isGitPathWithinFolder(item.repoPath, normalizedPath)),
                ...deleteFolderChanges,
                ...deleteFileChanges,
              ],
              currentDocumentId:
                state.currentDocumentId && removedPureLocalDocumentIds.includes(state.currentDocumentId)
                  ? null
                  : state.currentDocumentId,
            }
          })

          removedPureLocalDrafts.forEach((draft) => {
            const tab = useTabsStore.getState().findTabByFileId(draft.documentId)
            if (tab) {
              useTabsStore.getState().closeTab(tab.id)
            }
          })
        },

        unstageChange: (changeId) => {
          const change = get().stagedChanges.find((item) => item.id === changeId)
          if (!change) return

          set((state) => {
            const nextState: Partial<GitStore> & {
              stagedChanges: StagedGitChange[]
              pendingAssetChanges?: StagedGitChange[]
              pendingStructuralChanges?: StagedGitChange[]
            } = {
              stagedChanges: state.stagedChanges.filter((item) => item.id !== changeId),
            }

            if (change.kind === 'git-asset' && change.contentBase64) {
              const pendingAsset: StagedGitChange = {
                ...change,
                kind: 'git-asset',
                updatedAt: Date.now(),
              }
              nextState.pendingAssetChanges = [
                ...state.pendingAssetChanges.filter((item) => item.id !== pendingAsset.id),
                pendingAsset,
              ]
            }

            if (
              change.kind === 'git-delete-file' ||
              change.kind === 'git-delete-folder' ||
              change.kind === 'git-create-folder'
            ) {
              nextState.pendingStructuralChanges = [
                ...state.pendingStructuralChanges.filter((item) => item.id !== change.id),
                {
                  ...change,
                  updatedAt: Date.now(),
                },
              ]
            }

            return nextState
          })
        },

        restagePendingAsset: (changeId) => {
          set((state) => {
            const asset = state.pendingAssetChanges.find((item) => item.id === changeId)
            if (!asset || asset.kind !== 'git-asset' || !asset.contentBase64) {
              return state
            }

            const restagedAsset: StagedGitChange = {
              ...asset,
              kind: 'git-asset',
              updatedAt: Date.now(),
            }

            return {
              stagedChanges: [
                ...state.stagedChanges.filter((item) => item.id !== restagedAsset.id),
                restagedAsset,
              ],
              pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.id !== changeId),
            }
          })
        },

        stagePendingStructuralChange: (changeId) => {
          set((state) => {
            const change = state.pendingStructuralChanges.find((item) => item.id === changeId)
            if (!change) {
              return state
            }

            return {
              stagedChanges: [
                ...state.stagedChanges.filter((item) => item.id !== change.id),
                {
                  ...change,
                  updatedAt: Date.now(),
                },
              ],
              pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => item.id !== changeId),
            }
          })
        },

        discardDraftChange: (documentId) => {
          const draft = get().drafts[documentId]
          if (!draft) {
            return
          }

          if (draft.isNew) {
            set((state) => {
              const nextDrafts = { ...state.drafts }
              delete nextDrafts[documentId]

              return {
                drafts: nextDrafts,
                stagedChanges: state.stagedChanges.filter((item) => item.documentId !== documentId),
                pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.documentId !== documentId),
                pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => item.documentId !== documentId),
                currentDocumentId: state.currentDocumentId === documentId ? null : state.currentDocumentId,
              }
            })

            const tab = useTabsStore.getState().findTabByFileId(documentId)
            if (tab) {
              useTabsStore.getState().closeTab(tab.id)
            }
            return
          }

          set((state) => {
            const currentDraft = state.drafts[documentId]
            if (!currentDraft) {
              return state
            }

            return {
              drafts: {
                ...state.drafts,
                [documentId]: {
                  ...currentDraft,
                  content: currentDraft.originalContent,
                  draftContent: currentDraft.originalContent,
                  isDirty: false,
                  status: currentDraft.hasConflict ? 'conflict' : 'clean',
                  conflictResolvedContent: currentDraft.hasConflict
                    ? currentDraft.conflictResolvedContent
                    : undefined,
                },
              },
              pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.documentId !== documentId),
              pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => !(
                item.kind === 'git-delete-file' && item.documentId === documentId
              )),
              stagedChanges: state.stagedChanges.filter((item) => !(item.kind === 'git-delete-file' && item.documentId === documentId)),
            }
          })

          const nextDraft = get().drafts[documentId]
          if (!nextDraft) {
            return
          }

          syncOpenGitTabFromDraft(documentId, nextDraft)
          if (get().currentDocumentId === documentId) {
            useDocumentStore.getState().loadDocument(nextDraft.draftContent, nextDraft.name, nextDraft.documentId)
          }
          const activeTab = useTabsStore.getState().findTabByFileId(documentId)
          if (activeTab) {
            useTabsStore.getState().markTabAsSaved(activeTab.id, nextDraft.name)
          }
        },

        discardPendingAsset: (changeId) => {
          set((state) => ({
            pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.id !== changeId),
          }))
        },

        discardPendingStructuralChange: (changeId) => {
          const targetChange = get().pendingStructuralChanges.find((item) => item.id === changeId)
          if (!targetChange) {
            return
          }

          if (targetChange.kind === 'git-delete-file') {
            set((state) => ({
              pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => item.id !== changeId),
            }))
            return
          }

          if (targetChange.kind === 'git-create-folder') {
            const normalizedPath = normalizeGitPath(targetChange.repoPath)
            const removedDocumentIds = Object.values(get().drafts)
              .filter((draft) => draft.isNew && isGitPathWithinFolder(draft.path, normalizedPath))
              .map((draft) => draft.documentId)

            set((state) => {
              const nextDrafts = { ...state.drafts }
              removedDocumentIds.forEach((documentId) => {
                delete nextDrafts[documentId]
              })

              return {
                drafts: nextDrafts,
                stagedChanges: state.stagedChanges.filter((item) => !isGitPathWithinFolder(item.repoPath, normalizedPath)),
                pendingAssetChanges: state.pendingAssetChanges.filter((item) => !isGitPathWithinFolder(item.repoPath, normalizedPath)),
                pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => !isGitPathWithinFolder(item.repoPath, normalizedPath)),
                currentDocumentId:
                  state.currentDocumentId && removedDocumentIds.includes(state.currentDocumentId)
                    ? null
                    : state.currentDocumentId,
              }
            })

            removedDocumentIds.forEach((documentId) => {
              const tab = useTabsStore.getState().findTabByFileId(documentId)
              if (tab) {
                useTabsStore.getState().closeTab(tab.id)
              }
            })
            return
          }

          if (targetChange.kind === 'git-delete-folder') {
            const normalizedPath = normalizeGitPath(targetChange.repoPath)
            set((state) => ({
              pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => !isGitPathWithinFolder(item.repoPath, normalizedPath)),
            }))
          }
        },

        uploadAsset: async (documentId, file) => {
          const workspaceConfig = resolveGitWorkspaceConfigForDocumentId(get(), documentId)
          if (workspaceConfig && buildGitWorkspaceKey(workspaceConfig) !== buildGitWorkspaceKey(get().config)) {
            get().setCurrentDocumentId(documentId)
          }

          const { config, drafts } = get()
          let draft = drafts[documentId]

          if (!draft) {
            const { tabs, activeTabId } = useTabsStore.getState()
            const fallbackTab =
              tabs.find((item) => item.sourceType === 'git' && item.fileId === documentId) ||
              tabs.find((item) => item.id === activeTabId && item.sourceType === 'git' && item.fileId === documentId)

            if (!fallbackTab?.gitMeta?.path) {
              throw new Error('Git draft not found')
            }

            draft = await get().openFile(fallbackTab.gitMeta.path)

            if (fallbackTab.content !== draft.draftContent) {
              get().updateDraftContent(documentId, fallbackTab.content)
              draft = get().drafts[documentId] || {
                ...draft,
                content: fallbackTab.content,
                draftContent: fallbackTab.content,
                isDirty: fallbackTab.content !== draft.originalContent,
              }
            }
          }

          const runtimeConfig = toRuntimeConfig(config)
          const client = getGitProviderClient(runtimeConfig)
          if (!client.createOrUpdateBinaryFile) {
            throw new Error('Current Git provider does not support binary uploads')
          }

          const normalizedDraftPath = normalizeGitPath(draft.path)
          const draftDir = normalizedDraftPath.includes('/')
            ? normalizedDraftPath.split('/').slice(0, -1).join('/')
            : ''
          const assetFileName = createAssetFileName(normalizedDraftPath, file)
          const repoPath = joinGitPath(draftDir, '.visualmd-assets', assetFileName)
          const contentBase64 = arrayBufferToBase64(await file.arrayBuffer())
          const mimeType = file.type || undefined

          set((state) => ({
            stagedChanges: state.stagedChanges.filter((item) => item.id !== `git-asset:${documentId}:${repoPath}`),
            pendingAssetChanges: [
              ...state.pendingAssetChanges.filter((item) => item.id !== `git-asset:${documentId}:${repoPath}`),
              {
                id: `git-asset:${documentId}:${repoPath}`,
                kind: 'git-asset',
                label: assetFileName,
                repoPath,
                documentId,
                contentBase64,
                mimeType,
                updatedAt: Date.now(),
              },
            ],
          }))

          return { repoPath, draftPath: normalizedDraftPath }
        },

        refreshCurrentFile: async () => {
          const { currentDocumentId, drafts } = get()
          if (!currentDocumentId || !drafts[currentDocumentId]) return
          if (hasAnyConflictDraft(drafts)) {
            throw new Error('Resolve all conflicted files before refreshing repository content')
          }
          await get().fetchRemoteFile(currentDocumentId)
        },

        fetchRemoteFile: async (documentId, options) => {
          const targetDocumentId = documentId || get().currentDocumentId
          if (!targetDocumentId) return null

          const { config, drafts } = get()
          const draft = drafts[targetDocumentId]
          if (!draft) return null
          if (draft.isNew) {
            return draft
          }
          if (hasAnyConflictDraft(drafts)) {
            if (options?.reconcileLocalChanges || options?.blockOnAnyConflict !== false) {
              throw new Error('Resolve all conflicted files before refreshing repository content')
            }
          }
          if (isDraftConflictLocked(draft)) {
            return draft
          }

          set({ isFetchingRemote: true, error: null })
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            const remoteFile = await client.getFile(runtimeConfig, draft.path)
            const checkedAt = Date.now()
            const reconcileLocalChanges = options?.reconcileLocalChanges === true

            let nextDraft: GitDraftFile | null = null
            set((state) => {
              const currentDraft = state.drafts[targetDocumentId]
              if (!currentDraft) return state

              const remoteChanged = hasMeaningfulRemoteGitChange(
                remoteFile.content,
                currentDraft.originalContent,
                remoteFile.sha,
                currentDraft.sha
              )
              const preserveLocalDraft = hasMeaningfulLocalGitChange(
                currentDraft.draftContent,
                currentDraft.originalContent
              )

              if (reconcileLocalChanges && remoteChanged && preserveLocalDraft) {
                const mergeResult = mergeGitText(
                  currentDraft.originalContent,
                  currentDraft.draftContent,
                  remoteFile.content
                )

                if (mergeResult.hasConflicts) {
                  nextDraft = applyConflictState(
                    {
                      ...currentDraft,
                      name: remoteFile.name || currentDraft.name,
                      lastCheckedAt: checkedAt,
                    },
                    remoteFile.content,
                    remoteFile.sha,
                    mergeResult.mergedText
                  )
                } else {
                  nextDraft = {
                    ...resolveDraftAgainstRemoteBase(currentDraft, mergeResult.mergedText),
                    name: remoteFile.name || currentDraft.name,
                    lastCheckedAt: checkedAt,
                    status: 'auto-merged',
                  }
                }

                return {
                  drafts: {
                    ...state.drafts,
                    [targetDocumentId]: nextDraft!,
                  },
                  lastFetchedAt: checkedAt,
                }
              }

              nextDraft = {
                ...currentDraft,
                name: remoteFile.name || currentDraft.name,
                remoteSha: remoteFile.sha,
                remoteContent: remoteFile.content,
                remoteMissing: false,
                lastCheckedAt: checkedAt,
                hasRemoteUpdates: remoteChanged,
                hasConflict: false,
                status:
                  preserveLocalDraft
                    ? 'dirty'
                    : 'clean',
                ...(preserveLocalDraft
                  ? {}
                  : {
                      sha: remoteFile.sha,
                      content: remoteFile.content,
                      originalContent: remoteFile.content,
                      draftContent: remoteFile.content,
                      isDirty: false,
                      conflictSnapshot: undefined,
                      conflictResolvedContent: undefined,
                    }),
              }

              return {
                drafts: {
                  ...state.drafts,
                  [targetDocumentId]: nextDraft!,
                },
                lastFetchedAt: checkedAt,
              }
            })

            if (reconcileLocalChanges) {
              syncGitDraftStageState(get(), targetDocumentId)
            }

            return nextDraft
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Failed to fetch remote file' })
            throw error
          } finally {
            set({ isFetchingRemote: false })
          }
        },

        syncRemoteStatus: async () => {
          const { currentDocumentId, drafts } = get()
          if (!currentDocumentId || !drafts[currentDocumentId]) return
          if (hasAnyConflictDraft(drafts)) return
          await get().fetchRemoteFile(currentDocumentId)
        },

        resolveConflictUsingContent: (documentId, content) => {
          set((state) => {
            const draft = state.drafts[documentId]
            if (!draft) return state
            const snapshot = getDraftConflictSnapshot(draft)
            const resolvedDraft = resolveDraftAgainstRemoteBase({
              ...draft,
              originalContent: snapshot.baseContent,
              sha: snapshot.baseSha,
              remoteContent: snapshot.remoteContent,
              remoteSha: snapshot.remoteSha,
              remoteMissing: snapshot.remoteMissing,
            }, content)

            return {
              drafts: {
                ...state.drafts,
                [documentId]: {
                  ...resolvedDraft,
                  status: 'resolved-pending-commit',
                },
              },
            }
          })

          const nextDraft = get().drafts[documentId]
          if (!nextDraft) return

          syncGitDraftStageState(get(), documentId)
        },

        acceptRemoteVersion: (documentId) => {
          const draft = get().drafts[documentId]
          if (!draft) return
          const snapshot = getDraftConflictSnapshot(draft)
          if (snapshot.remoteMissing) {
            const tab = useTabsStore.getState().findTabByFileId(documentId)
            const parentPath = getParentGitPath(draft.path)
            set((state) => {
              const nextDrafts = { ...state.drafts }
              delete nextDrafts[documentId]

              return {
                drafts: nextDrafts,
                stagedChanges: state.stagedChanges.filter((item) => item.documentId !== documentId),
                pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.documentId !== documentId),
                pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => item.documentId !== documentId),
                treeByPath: {
                  ...state.treeByPath,
                  [parentPath]: (state.treeByPath[parentPath] || []).filter((item) => normalizeGitPath(item.path) !== normalizeGitPath(draft.path)),
                },
                currentDocumentId: state.currentDocumentId === documentId ? null : state.currentDocumentId,
              }
            })
            if (tab) {
              useTabsStore.getState().closeTab(tab.id)
            }
            return
          }
          if (!snapshot.remoteContent) return

          set((state) => {
            const currentDraft = state.drafts[documentId]
            if (!currentDraft) return state

            return {
              drafts: {
                ...state.drafts,
                [documentId]: {
                  ...currentDraft,
                  sha: snapshot.remoteSha || currentDraft.remoteSha || currentDraft.sha,
                  content: snapshot.remoteContent,
                  originalContent: snapshot.remoteContent,
                  draftContent: snapshot.remoteContent,
                  remoteContent: snapshot.remoteContent,
                  remoteSha: snapshot.remoteSha || currentDraft.remoteSha,
                  isDirty: false,
                  creationSource: undefined,
                  status: 'clean',
                  hasRemoteUpdates: false,
                  hasConflict: false,
                  conflictResolvedContent: undefined,
                  conflictSnapshot: undefined,
                },
              },
            }
          })

          const stagedItem = get().stagedChanges.find((item) => item.kind === 'git-draft' && item.documentId === documentId)
          if (stagedItem) {
            get().unstageChange(stagedItem.id)
          }
        },

        refreshRepositoryFromRemote: async () => {
          const { config, drafts, stagedChanges } = get()
          if (hasAnyConflictDraft(drafts)) {
            throw new Error('Resolve all conflicted files before refreshing repository content')
          }

          set({ isLoadingTree: true, isFetchingRemote: true, error: null })
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            const { treeByPath: remoteTreeByPath, treeMap: remoteTreeMap } = await loadCompleteRemoteTree(client, runtimeConfig)
            const currentBaseTreeMap = get().baseTreeMap
            const hasBaseline = Object.keys(currentBaseTreeMap).length > 0
            const treeDiff = hasBaseline
              ? diffTreeShaMaps(currentBaseTreeMap, remoteTreeMap)
              : {
                  addedPaths: Object.keys(remoteTreeMap),
                  deletedPaths: [] as string[],
                  updatedPaths: [] as string[],
                }
            const changedPaths = hasBaseline
              ? Array.from(new Set([
                  ...treeDiff.addedPaths,
                  ...treeDiff.deletedPaths,
                  ...treeDiff.updatedPaths,
                ]))
              : [] as string[]
            const remoteFileCache = new Map<string, Awaited<ReturnType<typeof client.getFile>>>()

            const getRemoteFileForPath = async (path: string) => {
              const normalizedPath = normalizeGitPath(path)
              if (remoteFileCache.has(normalizedPath)) {
                return remoteFileCache.get(normalizedPath)!
              }

              const remoteFile = await client.getFile(runtimeConfig, normalizedPath)
              remoteFileCache.set(normalizedPath, remoteFile)
              return remoteFile
            }

            const reconcileDocumentIds = new Set<string>()
            Object.values(get().drafts).forEach((draft) => {
              if (isPureLocalNewGitDraft(draft)) {
                return
              }
              if (!draft.isNew && changedPaths.includes(normalizeGitPath(draft.path))) {
                reconcileDocumentIds.add(draft.documentId)
              }
            })

            for (const change of [...get().stagedChanges, ...get().pendingStructuralChanges]) {
              if ((change.kind === 'git-draft' || change.kind === 'git-delete-file') && change.documentId) {
                if (isPureLocalNewGitDraft(get().drafts[change.documentId])) {
                  continue
                }
                reconcileDocumentIds.add(change.documentId)
              }
            }

            const conflictedDocumentIds: string[] = []
            const deletedDocumentIds = new Set<string>()

            for (const documentId of reconcileDocumentIds) {
              const currentDraft = get().drafts[documentId]
              if (!currentDraft) {
                continue
              }

              const draftPath = normalizeGitPath(currentDraft.path)
              const remotePathExists = Object.prototype.hasOwnProperty.call(remoteTreeMap, draftPath)
              if (currentDraft.isNew && !remotePathExists) {
                // Purely local staged files do not exist on the remote yet, so refresh should not
                // try to fetch them from the provider API.
                continue
              }
              const pathDeletedRemotely = hasBaseline && treeDiff.deletedPaths.includes(draftPath)
              const pathAddedOrUpdatedRemotely = !pathDeletedRemotely && (
                !hasBaseline ||
                treeDiff.addedPaths.includes(draftPath) ||
                treeDiff.updatedPaths.includes(draftPath)
              )
              const hasLocalChange = currentDraft.isNew || hasMeaningfulLocalGitChange(
                currentDraft.draftContent,
                currentDraft.originalContent
              )
              const deleteIntent =
                get().stagedChanges.find((item) => item.kind === 'git-delete-file' && item.documentId === documentId) ||
                get().pendingStructuralChanges.find((item) => item.kind === 'git-delete-file' && item.documentId === documentId)
              const hasDeleteIntent = Boolean(deleteIntent)
              const hasEffectiveLocalChange = hasDeleteIntent || hasLocalChange

              if (pathDeletedRemotely) {
                if (deleteIntent) {
                  set((state) => {
                    const nextDrafts = { ...state.drafts }
                    delete nextDrafts[documentId]

                    return {
                      drafts: nextDrafts,
                      stagedChanges: state.stagedChanges.filter((item) => item.id !== deleteIntent.id),
                      pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => item.id !== deleteIntent.id),
                      currentDocumentId: state.currentDocumentId === documentId ? null : state.currentDocumentId,
                    }
                  })
                  deletedDocumentIds.add(documentId)
                  const tab = useTabsStore.getState().findTabByFileId(documentId)
                  if (tab) {
                    useTabsStore.getState().closeTab(tab.id)
                  }
                  continue
                }

                if (!hasEffectiveLocalChange) {
                  set((state) => {
                    const nextDrafts = { ...state.drafts }
                    delete nextDrafts[documentId]
                    return {
                      drafts: nextDrafts,
                      currentDocumentId: state.currentDocumentId === documentId ? null : state.currentDocumentId,
                    }
                  })
                  deletedDocumentIds.add(documentId)
                  const tab = useTabsStore.getState().findTabByFileId(documentId)
                  if (tab) {
                    useTabsStore.getState().closeTab(tab.id)
                  }
                  continue
                }

                const mergeResult = mergeGitText(currentDraft.originalContent, currentDraft.draftContent, '')
                if (mergeResult.hasConflicts) {
                  set((state) => ({
                    drafts: {
                      ...state.drafts,
                      [documentId]: applyConflictState(
                        state.drafts[documentId],
                        '',
                        undefined,
                        mergeResult.mergedText,
                        true
                      ),
                    },
                  }))
                  conflictedDocumentIds.push(documentId)
                } else {
                  set((state) => ({
                    drafts: {
                      ...state.drafts,
                      [documentId]: {
                        ...resolveDraftAgainstRemoteBase(state.drafts[documentId], mergeResult.mergedText),
                        remoteMissing: true,
                        remoteContent: '',
                        remoteSha: undefined,
                        status: 'auto-merged',
                        hasRemoteUpdates: true,
                      },
                    },
                  }))
                  syncGitDraftStageState(get(), documentId)
                  syncOpenGitTabFromDraft(documentId, get().drafts[documentId])
                }
                continue
              }

              if (!pathAddedOrUpdatedRemotely) {
                continue
              }

              const remoteFile = await getRemoteFileForPath(draftPath)
              const latestDraft = get().drafts[documentId]
              if (!latestDraft) {
                continue
              }

              const remoteBaseContent = latestDraft.isNew ? '' : latestDraft.originalContent
              const remoteBaseSha = latestDraft.isNew ? undefined : latestDraft.sha
              const remoteChanged = latestDraft.isNew
                ? true
                : hasMeaningfulRemoteGitChange(remoteFile.content, remoteBaseContent, remoteFile.sha, remoteBaseSha)

              if (!hasEffectiveLocalChange) {
                set((state) => ({
                  drafts: {
                    ...state.drafts,
                    [documentId]: {
                      ...state.drafts[documentId],
                      name: remoteFile.name || state.drafts[documentId].name,
                      sha: remoteFile.sha,
                      content: remoteFile.content,
                      originalContent: remoteFile.content,
                      draftContent: remoteFile.content,
                      remoteContent: remoteFile.content,
                      remoteSha: remoteFile.sha,
                      remoteMissing: false,
                      isDirty: false,
                      isNew: false,
                      creationSource: undefined,
                      status: 'clean',
                      hasConflict: false,
                      hasRemoteUpdates: false,
                      conflictSnapshot: undefined,
                      conflictResolvedContent: undefined,
                      lastCheckedAt: Date.now(),
                    },
                  },
                }))
                syncOpenGitTabFromDraft(documentId, get().drafts[documentId])
                continue
              }

              if (!remoteChanged && !latestDraft.isNew) {
                set((state) => ({
                  drafts: {
                    ...state.drafts,
                    [documentId]: {
                      ...state.drafts[documentId],
                      remoteContent: remoteFile.content,
                      remoteSha: remoteFile.sha,
                      remoteMissing: false,
                      hasRemoteUpdates: false,
                      lastCheckedAt: Date.now(),
                    },
                  },
                }))
                continue
              }

              if (hasDeleteIntent) {
                const mergeResult = mergeGitText(latestDraft.originalContent, '', remoteFile.content)
                set((state) => ({
                  drafts: {
                    ...state.drafts,
                    [documentId]: applyConflictState(
                      {
                        ...state.drafts[documentId],
                        name: remoteFile.name || state.drafts[documentId].name,
                        lastCheckedAt: Date.now(),
                      },
                      remoteFile.content,
                      remoteFile.sha,
                      mergeResult.mergedText
                    ),
                  },
                }))
                conflictedDocumentIds.push(documentId)
                continue
              }

              const mergeResult = mergeGitText(
                latestDraft.isNew ? '' : latestDraft.originalContent,
                latestDraft.draftContent,
                remoteFile.content
              )

              if (mergeResult.hasConflicts) {
                set((state) => ({
                  drafts: {
                    ...state.drafts,
                    [documentId]: applyConflictState(
                      {
                        ...state.drafts[documentId],
                        name: remoteFile.name || state.drafts[documentId].name,
                        lastCheckedAt: Date.now(),
                      },
                      remoteFile.content,
                      remoteFile.sha,
                      mergeResult.mergedText
                    ),
                  },
                }))
                conflictedDocumentIds.push(documentId)
              } else {
                set((state) => ({
                  drafts: {
                    ...state.drafts,
                    [documentId]: {
                      ...resolveDraftAgainstRemoteBase(state.drafts[documentId], mergeResult.mergedText),
                      name: remoteFile.name || state.drafts[documentId].name,
                      remoteMissing: false,
                      lastCheckedAt: Date.now(),
                      status: 'auto-merged',
                    },
                  },
                }))
                syncGitDraftStageState(get(), documentId)
                syncOpenGitTabFromDraft(documentId, get().drafts[documentId])
              }
            }

            set((state) => ({
              treeByPath: Object.fromEntries(
                Object.entries(remoteTreeByPath).map(([path, items]) => [
                  path,
                  buildTreeItemsForPath(items),
                ])
              ),
              baseTreeMap: remoteTreeMap,
              lastFetchedAt: Date.now(),
            }))

            return {
              addedPaths: treeDiff.addedPaths,
              deletedPaths: treeDiff.deletedPaths,
              updatedPaths: treeDiff.updatedPaths,
              conflictedDocumentIds,
            }
          } catch (error) {
            set({ error: error instanceof Error ? error.message : 'Failed to refresh repository content' })
            throw error
          } finally {
            set({ isLoadingTree: false, isFetchingRemote: false })
          }
        },

        acceptLocalVersion: (documentId) => {
          const draft = get().drafts[documentId]
          if (!draft) return
          const snapshot = getDraftConflictSnapshot(draft)
          get().resolveConflictUsingContent(documentId, snapshot.localContent)
        },

        commitCurrentFile: async (message) => {
          const { currentDocumentId, drafts, config } = get()
          const trimmedMessage = message.trim()
          const initialStagedChanges = get().stagedChanges
          if (!trimmedMessage) throw new Error('Commit message is required')
          if (!initialStagedChanges.length) throw new Error('No staged changes to commit')

          set({ isCommitting: true, error: null, pendingCommitMessage: trimmedMessage })
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            if (!client.commitBatch) {
              throw new Error('Current Git provider does not support atomic batch commits')
            }

            const existingConflictDocumentId = getFirstConflictDocumentId(get().drafts)
            if (existingConflictDocumentId) {
              set((state) => ({
                error: 'Resolve all conflicted files before committing',
                currentDocumentId: existingConflictDocumentId,
              }))
              throw new Error('Resolve all conflicted files before committing')
            }

            await get().refreshRepositoryFromRemote()

            const conflictedAfterRefresh = getFirstConflictDocumentId(get().drafts)
            if (conflictedAfterRefresh) {
              set((state) => ({
                error: 'Conflict detected: remote file changed since last sync',
                currentDocumentId: conflictedAfterRefresh,
              }))
              throw new Error('Conflict detected: remote file changed since last sync')
            }

            const stagedChanges = get().stagedChanges
            const committedChangeIds = new Set(stagedChanges.map((item) => item.id))
            const buildCommitAttemptState = () => {
              const batchActions: GitBatchCommitAction[] = []
              const committedDraftSnapshots = new Map<string, { path: string; content: string }>()
              const deletedDocumentIds = new Set<string>()

              for (const change of stagedChanges) {
                if (change.kind === 'git-draft' && change.documentId) {
                  const stagedDraft = get().drafts[change.documentId]
                  if (!stagedDraft) continue

                  committedDraftSnapshots.set(change.documentId, {
                    path: stagedDraft.path,
                    content: stagedDraft.draftContent,
                  })
                  batchActions.push({
                    kind: 'upsert',
                    path: stagedDraft.path,
                    content: stagedDraft.draftContent,
                    encoding: 'text',
                    previousSha: stagedDraft.sha,
                    isCreate: stagedDraft.isNew || !stagedDraft.sha,
                  })
                  continue
                }

                if (change.kind === 'local-file' && change.localFileId) {
                  const file = useFileSystemStore.getState().files.find((item) => item.id === change.localFileId)
                  if (!file) continue

                  batchActions.push({
                    kind: 'upsert',
                    path: change.repoPath,
                    content: file.content,
                    encoding: 'text',
                    isCreate: true,
                  })
                  continue
                }

                if (change.kind === 'git-asset' && change.contentBase64) {
                  batchActions.push({
                    kind: 'upsert',
                    path: change.repoPath,
                    content: change.contentBase64,
                    encoding: 'base64',
                    isCreate: true,
                  })
                  continue
                }

                if (change.kind === 'git-delete-file') {
                  batchActions.push({
                    kind: 'delete',
                    path: change.repoPath,
                    previousSha: change.originalSha,
                  })
                  if (change.documentId) {
                    deletedDocumentIds.add(change.documentId)
                  }
                  continue
                }

                if (change.kind === 'git-delete-folder') {
                  batchActions.push({
                    kind: 'delete',
                    path: getFolderPlaceholderPath(change.repoPath),
                  })
                  continue
                }

                if (change.kind === 'git-create-folder') {
                  batchActions.push({
                    kind: 'upsert',
                    path: getFolderPlaceholderPath(change.repoPath),
                    content: '',
                    encoding: 'text',
                    isCreate: true,
                  })
                }
              }

              return {
                batchActions,
                committedDraftSnapshots,
                deletedDocumentIds,
              }
            }

            const prepareMergedDraftsForCommit = async (
              batchActions: GitBatchCommitAction[],
              committedDraftSnapshots: Map<string, { path: string; content: string }>
            ) => {
              let encounteredConflict = false

              for (const change of stagedChanges) {
                if (change.kind !== 'git-draft' || !change.documentId) {
                  continue
                }

                const stagedDraft = get().drafts[change.documentId]
                if (!stagedDraft || stagedDraft.isNew) {
                  continue
                }

                const remoteDraft = await get().fetchRemoteFile(change.documentId)
                if (!remoteDraft) {
                  continue
                }

                const hasRemoteChange = hasMeaningfulRemoteGitChange(
                  remoteDraft.remoteContent ?? remoteDraft.originalContent,
                  stagedDraft.originalContent,
                  remoteDraft.remoteSha,
                  stagedDraft.sha
                )
                const hasLocalChange = hasMeaningfulLocalGitChange(
                  stagedDraft.draftContent,
                  stagedDraft.originalContent
                )

                if (!hasRemoteChange || !hasLocalChange) {
                  continue
                }

                const mergeResult = mergeGitText(
                  stagedDraft.originalContent,
                  stagedDraft.draftContent,
                  remoteDraft.remoteContent ?? remoteDraft.originalContent
                )

                if (mergeResult.hasConflicts) {
                  set((state) => {
                    const currentDraft = state.drafts[change.documentId!]
                    if (!currentDraft) {
                      return { error: 'Conflict detected: remote file changed since last sync' }
                    }

                    return {
                      error: 'Conflict detected: remote file changed since last sync',
                      drafts: {
                        ...state.drafts,
                        [change.documentId!]: applyConflictState(
                          currentDraft,
                          remoteDraft.remoteContent ?? remoteDraft.originalContent,
                          remoteDraft.remoteSha ?? currentDraft.remoteSha,
                          mergeResult.mergedText
                        ),
                      },
                    }
                  })
                  encounteredConflict = true
                  continue
                }

                const currentPath = normalizeGitPath(stagedDraft.path)
                const nextContent = mergeResult.mergedText

                set((state) => {
                  const currentDraft = state.drafts[change.documentId!]
                  if (!currentDraft) {
                    return state
                  }

                  return {
                    drafts: {
                      ...state.drafts,
                      [change.documentId!]: {
                        ...resolveDraftAgainstRemoteBase(currentDraft, nextContent),
                        status: 'auto-merged',
                      },
                    },
                  }
                })

                const actionIndex = batchActions.findIndex((action) => (
                  action.kind === 'upsert' &&
                  normalizeGitPath(action.path) === currentPath
                ))

                if (actionIndex >= 0) {
                  batchActions[actionIndex] = {
                    ...batchActions[actionIndex],
                    content: nextContent,
                    previousSha: remoteDraft.remoteSha ?? stagedDraft.remoteSha ?? stagedDraft.sha,
                    isCreate: false,
                  }
                }

                committedDraftSnapshots.set(change.documentId, {
                  path: stagedDraft.path,
                  content: nextContent,
                })
              }

              return !encounteredConflict
            }

            let committedDraftSnapshots = new Map<string, { path: string; content: string }>()
            let deletedDocumentIds = new Set<string>()
            let committed = false

            for (let attempt = 0; attempt < 2; attempt += 1) {
              const attemptState = buildCommitAttemptState()
              if (!attemptState.batchActions.length) {
                throw new Error('No staged changes to commit')
              }

              const canContinue = await prepareMergedDraftsForCommit(
                attemptState.batchActions,
                attemptState.committedDraftSnapshots
              )

              if (!canContinue) {
                const nextConflictDocumentId = getFirstConflictDocumentId(get().drafts)
                if (nextConflictDocumentId) {
                  set({ currentDocumentId: nextConflictDocumentId })
                }
                throw new Error('Conflict detected: remote file changed since last sync')
              }

              try {
                await client.commitBatch(runtimeConfig, trimmedMessage, attemptState.batchActions)
                committedDraftSnapshots = attemptState.committedDraftSnapshots
                deletedDocumentIds = attemptState.deletedDocumentIds
                committed = true
                break
              } catch (attemptError) {
                const attemptMessage = attemptError instanceof Error ? attemptError.message : 'Failed to commit file'
                if (!isConflictLikeGitErrorMessage(attemptMessage) || attempt > 0) {
                  throw attemptError
                }
              }
            }

            if (!committed) {
              throw new Error('Conflict detected: remote file changed since last sync')
            }

            const refreshedDrafts = new Map<string, { sha?: string; content: string }>()
            for (const [documentId, snapshot] of committedDraftSnapshots) {
              const remoteFile = await client.getFile(runtimeConfig, snapshot.path)
              refreshedDrafts.set(documentId, {
                sha: remoteFile.sha,
                content: remoteFile.content,
              })
            }

            const committedAt = Date.now()
            set((state) => {
              const nextDrafts = { ...state.drafts }

              deletedDocumentIds.forEach((documentId) => {
                delete nextDrafts[documentId]
              })

              refreshedDrafts.forEach((remoteDraft, documentId) => {
                const currentDraft = nextDrafts[documentId]
                const snapshot = committedDraftSnapshots.get(documentId)
                if (!currentDraft || !snapshot) return

                const keepLocalEdits = currentDraft.draftContent !== snapshot.content
                const nextContent = keepLocalEdits ? currentDraft.draftContent : remoteDraft.content

                nextDrafts[documentId] = {
                  ...currentDraft,
                  sha: remoteDraft.sha || currentDraft.sha,
                  content: nextContent,
                  originalContent: remoteDraft.content,
                  draftContent: nextContent,
                  isNew: false,
                  creationSource: undefined,
                  status: keepLocalEdits ? 'dirty' : 'clean',
                  remoteContent: remoteDraft.content,
                  remoteSha: remoteDraft.sha || currentDraft.remoteSha,
                  isDirty: keepLocalEdits,
                  hasRemoteUpdates: false,
                  hasConflict: false,
                  conflictSnapshot: undefined,
                  conflictResolvedContent: undefined,
                  lastCheckedAt: Date.now(),
                }
              })

              return {
                drafts: nextDrafts,
                stagedChanges: state.stagedChanges.filter((item) => !committedChangeIds.has(item.id)),
                pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => !committedChangeIds.has(item.id)),
                currentDocumentId:
                  state.currentDocumentId && deletedDocumentIds.has(state.currentDocumentId)
                    ? null
                    : state.currentDocumentId,
                lastFetchedAt: committedAt,
                pendingCommitMessage: null,
              }
            })

            deletedDocumentIds.forEach((documentId) => {
              const tab = useTabsStore.getState().findTabByFileId(documentId)
              if (tab) {
                useTabsStore.getState().closeTab(tab.id)
              }
            })

            refreshedDrafts.forEach((_remoteDraft, documentId) => {
              const nextDraft = get().drafts[documentId]
              if (!nextDraft) {
                return
              }

              syncOpenGitTabFromDraft(documentId, nextDraft)
              if (get().currentDocumentId === documentId) {
                useDocumentStore.getState().loadDocument(nextDraft.draftContent, nextDraft.name, nextDraft.documentId)
              }
            })

            try {
              await get().refreshRepositoryFromRemote()
              await reloadVisibleGitTreePaths(get())
            } catch {
              set({ error: 'Commit succeeded, but repository view refresh failed' })
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to commit file'
            set({ error: message })

            const draft = currentDocumentId ? get().drafts[currentDocumentId] : null
            if (draft && isConflictLikeGitErrorMessage(message)) {
              try {
                await get().fetchRemoteFile(draft.documentId)
              } catch {
                // keep local draft even if remote refresh fails
              }
            }
            throw error
          } finally {
            set({ isCommitting: false })
          }
        },

        createFile: async (path, content, message) => {
          const { config } = get()
          const normalizedPath = normalizeGitPath(path)
          const documentId = buildGitDocumentId(config, normalizedPath)
          const normalizedContent = content ?? ''
          const nextDraft: GitDraftFile = {
            documentId,
            path: normalizedPath,
            name: getGitFileName(normalizedPath),
            sha: undefined,
            content: normalizedContent,
            originalContent: '',
            draftContent: normalizedContent,
            isDirty: normalizedContent.length > 0,
            isNew: true,
            creationSource: 'git',
            status: normalizedContent.length > 0 ? 'dirty' : 'clean',
            remoteContent: undefined,
            remoteSha: undefined,
            hasRemoteUpdates: false,
            hasConflict: false,
            lastCheckedAt: Date.now(),
            provider: config.provider,
            repo: config.repo,
            ownerOrNamespace: config.ownerOrNamespace,
            branch: config.branch,
          }

          set((state) => ({
            drafts: {
              ...state.drafts,
              [documentId]: nextDraft,
            },
            stagedChanges: state.stagedChanges.filter((item) => !(item.kind === 'git-draft' && item.documentId === documentId)),
            currentDocumentId: documentId,
          }))
        },

        renameFile: async (oldPath, newPath, message) => {
          const { config, drafts } = get()
          const runtimeConfig = toRuntimeConfig(config)
          const client = getGitProviderClient(runtimeConfig)
          const normalizedOld = normalizeGitPath(oldPath)
          const draft =
            Object.values(drafts).find((item) => item.path === normalizedOld) ||
            await get().openFile(normalizedOld)
          await client.renameFile(runtimeConfig, normalizedOld, normalizeGitPath(newPath), message, draft.draftContent, draft.sha)

          const nextPath = normalizeGitPath(newPath)
          const nextDocumentId = buildGitDocumentId(config, nextPath)

          set((state) => {
            const nextDrafts = { ...state.drafts }
            delete nextDrafts[draft.documentId]
            nextDrafts[nextDocumentId] = {
              ...draft,
              documentId: nextDocumentId,
              path: nextPath,
              name: getGitFileName(nextPath),
            }
            return {
              drafts: nextDrafts,
              stagedChanges: state.stagedChanges.map((item) =>
                item.kind === 'git-draft' && item.documentId === draft.documentId
                  ? {
                      ...item,
                      id: `git-draft:${nextDocumentId}`,
                      documentId: nextDocumentId,
                      repoPath: nextPath,
                      label: getGitFileName(nextPath),
                      updatedAt: Date.now(),
                    }
                  : item
              ),
              currentDocumentId: state.currentDocumentId === draft.documentId ? nextDocumentId : state.currentDocumentId,
            }
          })
          await get().loadTree('')
        },

        deleteFile: async (path) => {
          await get().stageDeletedGitFile(path)
        },

        createFolder: async (path, message) => {
          const normalizedPath = normalizeGitPath(path)
          set((state) => {
            const existing = state.pendingStructuralChanges.find((item) => item.kind === 'git-create-folder' && normalizeGitPath(item.repoPath) === normalizedPath)
            return {
              pendingStructuralChanges: existing
                ? state.pendingStructuralChanges
                : [
                    ...state.pendingStructuralChanges,
                    {
                      id: `git-create-folder:${normalizedPath}`,
                      kind: 'git-create-folder',
                      label: getGitFileName(normalizedPath),
                      repoPath: normalizedPath,
                      updatedAt: Date.now(),
                    },
                  ],
            }
          })
        },

        deleteFolder: async (path) => {
          await get().stageDeletedGitFolder(path)
        },
      }),
      {
        name: 'git-store-v1',
        version: 4,
        storage: createIndexedDbPersistStorage<Partial<GitStorePersistedState>>({
          dbName: 'visualmd-cache',
          storeName: 'zustand-persist',
        }),
        migrate: (persistedState, version) => migrateGitStorePersistedState(persistedState, version),
        partialize: (state) => {
          const currentWorkspaceState = captureGitWorkspaceState(state)
          return {
            config: state.config,
            lastConnectedConfigSignature: state.lastConnectedConfigSignature,
            connected: state.connected,
            drafts: currentWorkspaceState.drafts,
            stagedChanges: currentWorkspaceState.stagedChanges,
            pendingAssetChanges: currentWorkspaceState.pendingAssetChanges,
            pendingStructuralChanges: currentWorkspaceState.pendingStructuralChanges,
            currentDocumentId: currentWorkspaceState.currentDocumentId,
            expandedPaths: currentWorkspaceState.expandedPaths,
            workspaceStateByKey: upsertWorkspaceStateForConfig(
              state.workspaceStateByKey,
              state.config,
              currentWorkspaceState
            ),
          }
        },
        onRehydrateStorage: () => (state) => {
          if (!state) return

          const migratedState = migrateGitStorePersistedState(state, 4)
          const normalizedConfig: GitProviderConfig = {
            ...DEFAULT_CONFIG,
            ...(migratedState.config || {}),
            token: normalizeEncryptedSecret(migratedState.config?.token || ''),
            provider: normalizeSupportedProvider(migratedState.config?.provider),
          }
          const restoredWorkspaceStateByKey = sanitizePersistedWorkspaceStateByKey(migratedState.workspaceStateByKey)
          const fallbackWorkspaceState = sanitizePersistedWorkspaceState({
            drafts: migratedState.drafts,
            stagedChanges: migratedState.stagedChanges,
            pendingAssetChanges: migratedState.pendingAssetChanges,
            pendingStructuralChanges: migratedState.pendingStructuralChanges,
            currentDocumentId: migratedState.currentDocumentId,
            expandedPaths: migratedState.expandedPaths,
          })
          const restoredWorkspaceState = buildGitWorkspaceKey(normalizedConfig)
            ? getWorkspaceStateForConfig(restoredWorkspaceStateByKey, normalizedConfig)
            : fallbackWorkspaceState
          const lastConnectedConfigSignature = migratedState.lastConnectedConfigSignature || null
          const hasValidConfig = !getConfigError(normalizedConfig)
          const configSignatureMatchesLastConnection =
            !!lastConnectedConfigSignature &&
            buildConfigSignature(normalizedConfig) === lastConnectedConfigSignature
          const wasPreviouslyConnected = migratedState.connected === true
          const shouldRestoreConnection = hasValidConfig && (wasPreviouslyConnected || configSignatureMatchesLastConnection)

          useGitStore.setState((currentState) => ({
            config: {
              ...currentState.config,
              ...normalizedConfig,
            },
            lastConnectedConfigSignature,
            connected: false,
            workspaceStateByKey: upsertWorkspaceStateForConfig(
              restoredWorkspaceStateByKey,
              normalizedConfig,
              restoredWorkspaceState
            ),
            drafts: restoredWorkspaceState.drafts,
            stagedChanges: restoredWorkspaceState.stagedChanges,
            pendingAssetChanges: restoredWorkspaceState.pendingAssetChanges,
            pendingStructuralChanges: restoredWorkspaceState.pendingStructuralChanges,
            currentDocumentId: restoredWorkspaceState.currentDocumentId,
            expandedPaths: restoredWorkspaceState.expandedPaths,
          }))

          if (!shouldRestoreConnection) return

          queueMicrotask(() => {
            void (async () => {
              try {
                await useGitStore.getState().validateAndLoad()
              } catch {
                // Keep startup silent here; store state is updated by validateAndLoad.
              }
            })()
          })
        },
      }
    ),
    { name: 'GitStore' }
  )
)
