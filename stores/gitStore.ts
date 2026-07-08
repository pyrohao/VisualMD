import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import { getGitProviderClient } from '@/lib/git/providers'
import { mergeGitText } from '@/lib/git/merge'
import { findGitDirectoryPathConflicts, findGitPullBlockers, findGitStagedAssetConflicts } from '@/lib/git/pull-guards'
import { hasMeaningfulLocalGitChange, hasMeaningfulRemoteGitChange } from '@/lib/git/sync'
import { isPureLocalNewGitDraft } from '@/lib/git/draft-guards'
import { createBinaryStageChange, createDraftStageChange } from '@/lib/git/staging'
import { createIndexedDbPersistStorage } from '@/lib/git-store-persist-storage'
import { buildGitTabDraftState } from '@/lib/git/tab-state'
import type {
  GitBatchCommitAction,
  GitBranchRef,
  GitConflictSnapshot,
  GitDraftFile,
  GitProviderConfig,
  GitRemoteSnapshotEntry,
  GitRemoteTextCacheEntry,
  GitRepoRef,
  GitTreeItem,
  RemoteTextFileDto,
  StagedGitChange,
} from '@/lib/git/types'
import { arrayBufferToBase64, buildGitDocumentId, buildGitRepoRelativePath, getGitFileName, joinGitPath, normalizeGitPath, parseGitDocumentId } from '@/lib/git/utils'
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
  remoteSnapshotEntries: Record<string, GitRemoteSnapshotEntry>
  remoteSnapshotFetchedAt: number | null
  remoteContentCache: Record<string, GitRemoteTextCacheEntry>
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
  remoteSnapshotEntries: Record<string, GitRemoteSnapshotEntry>
  remoteSnapshotFetchedAt: number | null
  remoteContentCache: Record<string, GitRemoteTextCacheEntry>
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
  remoteSnapshotEntries: Record<string, GitRemoteSnapshotEntry>
  remoteSnapshotFetchedAt: number | null
  baseTreeMap: Record<string, string>
  remoteContentCache: Record<string, GitRemoteTextCacheEntry>
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

const GIT_ASSET_ROOT_DIRECTORY = '.visualmd-assets'

function draftReferencesRepoPath(draftPath: string, content: string, repoPath: string) {
  const relativePath = buildGitRepoRelativePath(draftPath, repoPath)
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
  const status = isDirty ? 'dirty' : 'clean'

  return clearDraftRemoteTracking({
    ...draft,
    sha: nextSha,
    content: nextContent,
    originalContent: nextBaseContent,
    draftContent: nextContent,
    conflictResolvedContent: nextContent,
    conflictSnapshot: undefined,
    isDirty,
    status,
    hasConflict: false,
  })
}

function createConflictSnapshot(
  draft: Pick<GitDraftFile, 'originalContent' | 'draftContent' | 'remoteContent' | 'sha' | 'remoteSha'>,
  remoteContent: string,
  remoteSha?: string,
  resolvedContent?: string,
  remoteMissing = false,
  kind: NonNullable<GitConflictSnapshot['kind']> = 'content',
  pathHint?: string
): GitConflictSnapshot {
  return {
    kind,
    baseContent: draft.originalContent,
    baseSha: draft.sha,
    localContent: draft.draftContent,
    remoteContent,
    remoteSha: remoteSha ?? draft.remoteSha,
    remoteMissing,
    resolvedContent,
    pathHint,
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
    kind: 'content',
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
  remoteMissing = false,
  kind: NonNullable<GitConflictSnapshot['kind']> = remoteMissing ? 'modify-delete' : 'content',
  pathHint?: string
): GitDraftFile {
  const snapshot = createConflictSnapshot(draft, remoteContent, remoteSha, resolvedContent, remoteMissing, kind, pathHint)

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
  const stagedItem = store.stagedChanges.find((item) => item.kind === 'git-draft' && item.documentId === documentId)
  if (!nextDraft && stagedItem) {
    store.unstageChange(stagedItem.id)
  }
}

function clearDraftRemoteTracking(draft: GitDraftFile): GitDraftFile {
  return {
    ...draft,
    remoteContent: undefined,
    remoteSha: undefined,
    remoteMissing: false,
    hasRemoteUpdates: false,
  }
}

function getRequiredStagedDraftContent(change: Pick<StagedGitChange, 'repoPath' | 'content'>) {
  if (typeof change.content === 'string') {
    return change.content
  }

  throw new Error(
    `Staged file '${normalizeGitPath(change.repoPath)}' is missing its frozen snapshot. Please stage it again before committing`
  )
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

function buildRemoteSnapshotEntries(items: GitTreeItem[]) {
  return Object.fromEntries(
    items.map((item) => {
      const normalizedPath = normalizeGitPath(item.path)
      return [
        normalizedPath,
        {
          path: normalizedPath,
          name: item.name,
          type: item.type,
          sha: item.sha,
          size: item.size,
        } satisfies GitRemoteSnapshotEntry,
      ]
    })
  )
}

export function mergeGitRemoteSnapshotEntriesForTreePath(
  existingEntries: Record<string, GitRemoteSnapshotEntry>,
  existingTreeByPath: Record<string, GitTreeItem[]>,
  folderPath: string,
  items: GitTreeItem[]
) {
  const normalizedFolderPath = normalizeGitPath(folderPath)
  const nextEntries = { ...existingEntries }
  const previousChildren = existingTreeByPath[normalizedFolderPath] || []
  const normalizedItems = items.map((item) => ({
    ...item,
    path: normalizeGitPath(item.path),
  }))
  const nextImmediatePathSet = new Set(normalizedItems.map((item) => item.path))

  previousChildren.forEach((child) => {
    const normalizedChildPath = normalizeGitPath(child.path)
    if (nextImmediatePathSet.has(normalizedChildPath)) {
      const nextChild = normalizedItems.find((item) => item.path === normalizedChildPath)
      if (child.type === 'dir' && nextChild?.type === 'dir') {
        return
      }
    }

    Object.keys(nextEntries).forEach((entryPath) => {
      if (
        entryPath === normalizedChildPath ||
        entryPath.startsWith(`${normalizedChildPath}/`)
      ) {
        delete nextEntries[entryPath]
      }
    })
  })

  normalizedItems.forEach((item) => {
    nextEntries[item.path] = {
      path: item.path,
      name: item.name,
      type: item.type,
      sha: item.sha,
      size: item.size,
    }
  })

  return nextEntries
}

function buildFileSnapshotEntriesFromShaMap(treeShaMap: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(treeShaMap).map(([path, sha]) => {
      const normalizedPath = normalizeGitPath(path)
      return [
        normalizedPath,
        {
          path: normalizedPath,
          name: getGitFileName(normalizedPath),
          type: 'file' as const,
          sha: sha || undefined,
        } satisfies GitRemoteSnapshotEntry,
      ]
    })
  )
}

function buildTreeShaMap(entriesByPath: Record<string, GitRemoteSnapshotEntry>) {
  return Object.fromEntries(
    Object.values(entriesByPath)
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

export function diffGitRemoteSnapshotEntries(
  baseEntries: Record<string, GitRemoteSnapshotEntry>,
  nextEntries: Record<string, GitRemoteSnapshotEntry>
) {
  return diffTreeShaMaps(
    buildTreeShaMap(baseEntries),
    buildTreeShaMap(nextEntries)
  )
}

async function loadCompleteRemoteTree(
  client: ReturnType<typeof getGitProviderClient>,
  config: GitProviderConfig
) {
  const treeByPath: Record<string, GitTreeItem[]> = {}
  const snapshotItems: GitTreeItem[] = []
  const queue = ['']
  const visited = new Set<string>()

  while (queue.length > 0) {
    const currentPath = normalizeGitPath(queue.shift() || '')
    if (visited.has(currentPath)) {
      continue
    }
    visited.add(currentPath)

    const items = await client.listTree(config, currentPath)
    const normalizedItems = items
      .filter((item) => item.name !== '.gitkeep')
      .map((item) => ({
        ...item,
        path: normalizeGitPath(item.path),
      }))
    treeByPath[currentPath] = sortGitTreeItems(normalizedItems)

    normalizedItems.forEach((item) => {
      if (item.name === '.gitkeep') {
        return
      }

      snapshotItems.push(item)

      if (item.type === 'dir') {
        queue.push(normalizeGitPath(item.path))
        return
      }
    })
  }

  const entriesByPath = buildRemoteSnapshotEntries(snapshotItems)

  return {
    treeByPath,
    entriesByPath,
  }
}

function buildLoadedRemoteTreeState(
  treeByPath: Record<string, GitTreeItem[]>,
  remoteSnapshotEntries: Record<string, GitRemoteSnapshotEntry>,
  remoteContentCache: Record<string, GitRemoteTextCacheEntry>,
  fetchedAt: number
) {
  return {
    treeByPath: Object.fromEntries(
      Object.entries(treeByPath).map(([path, items]) => [
        path,
        buildTreeItemsForPath(items),
      ])
    ),
    remoteSnapshotEntries,
    remoteSnapshotFetchedAt: fetchedAt,
    remoteContentCache: pruneGitRemoteContentCache(remoteContentCache, remoteSnapshotEntries),
    lastFetchedAt: fetchedAt,
  }
}

function hasAnyRemoteSnapshotMetadata(remoteSnapshotEntries: Record<string, GitRemoteSnapshotEntry>) {
  return Object.keys(remoteSnapshotEntries).length > 0
}

function hasCompleteRemoteSnapshotBaseline(remoteSnapshotFetchedAt: number | null | undefined) {
  return typeof remoteSnapshotFetchedAt === 'number'
}

function buildScopedRemoteTreeState(
  currentRemoteSnapshotEntries: Record<string, GitRemoteSnapshotEntry>,
  currentTreeByPath: Record<string, GitTreeItem[]>,
  path: string,
  items: GitTreeItem[],
  fetchedAt: number
) {
  const normalizedPath = normalizeGitPath(path)

  return {
    remoteSnapshotEntries: mergeGitRemoteSnapshotEntriesForTreePath(
      currentRemoteSnapshotEntries,
      currentTreeByPath,
      normalizedPath,
      items
    ),
    treeByPath: {
      ...currentTreeByPath,
      [normalizedPath]: buildTreeItemsForPath(items),
    },
    lastFetchedAt: fetchedAt,
  }
}

function createRemoteTextCacheEntry(file: RemoteTextFileDto, loadedAt = Date.now()): GitRemoteTextCacheEntry {
  return {
    path: normalizeGitPath(file.path),
    name: file.name || getGitFileName(file.path),
    sha: file.sha,
    content: file.content,
    loadedAt,
  }
}

export function getGitRemoteContentCacheHit(
  remoteContentCache: Record<string, GitRemoteTextCacheEntry>,
  path: string,
  sha?: string
) {
  const normalizedPath = normalizeGitPath(path)
  const cachedFile = remoteContentCache[normalizedPath]
  if (!cachedFile) {
    return null
  }

  return (sha || '') === (cachedFile.sha || '') ? cachedFile : null
}

function sanitizePersistedRemoteContentCache(input: unknown): Record<string, GitRemoteTextCacheEntry> {
  if (!input || typeof input !== 'object') return {}

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => !!value && typeof value === 'object')
      .map(([, value]) => value as Partial<GitRemoteTextCacheEntry>)
      .filter((entry) => typeof entry.path === 'string' && typeof entry.name === 'string' && typeof entry.content === 'string')
      .map((entry) => {
        const normalizedPath = normalizeGitPath(entry.path!)
        return [
          normalizedPath,
          {
            path: normalizedPath,
            name: entry.name!,
            sha: typeof entry.sha === 'string' ? entry.sha : undefined,
            content: entry.content!,
            loadedAt: typeof entry.loadedAt === 'number' ? entry.loadedAt : Date.now(),
          } satisfies GitRemoteTextCacheEntry,
        ]
      })
  )
}

function sanitizePersistedRemoteSnapshotEntries(input: unknown): Record<string, GitRemoteSnapshotEntry> {
  if (!input || typeof input !== 'object') return {}

  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => !!value && typeof value === 'object')
      .map(([, value]) => value as Partial<GitRemoteSnapshotEntry>)
      .filter((entry) => (
        typeof entry.path === 'string' &&
        typeof entry.name === 'string' &&
        (entry.type === 'file' || entry.type === 'dir')
      ))
      .map((entry) => {
        const normalizedPath = normalizeGitPath(entry.path!)
        return [
          normalizedPath,
          {
            path: normalizedPath,
            name: entry.name!,
            type: entry.type!,
            sha: typeof entry.sha === 'string' ? entry.sha : undefined,
            size: typeof entry.size === 'number' ? entry.size : undefined,
          } satisfies GitRemoteSnapshotEntry,
        ]
      })
  )
}

function toGitPullBlockerMessage(
  kind: 'untracked-overwrite' | 'unstaged-overwrite' | 'directory-delete-add-file',
  path: string,
  folderPath?: string
) {
  if (kind === 'directory-delete-add-file') {
    return `Remote added '${path}' inside locally deleted folder '${folderPath || path}'`
  }

  if (kind === 'untracked-overwrite') {
    return `Local untracked file '${path}' would be overwritten by remote changes`
  }

  return `Local file '${path}' has unstaged changes that would be overwritten by remote changes`
}

export function pruneGitRemoteContentCache(
  remoteContentCache: Record<string, GitRemoteTextCacheEntry>,
  remoteSnapshotEntries: Record<string, GitRemoteSnapshotEntry>
) {
  const remoteTreeMap = buildTreeShaMap(remoteSnapshotEntries)

  return Object.fromEntries(
    Object.entries(remoteContentCache).filter(([path, entry]) => {
      const normalizedPath = normalizeGitPath(path)
      if (!Object.prototype.hasOwnProperty.call(remoteTreeMap, normalizedPath)) {
        return false
      }

      return (remoteTreeMap[normalizedPath] || '') === (entry.sha || '')
    })
  )
}

function createGitDraftFromRemoteSource(
  config: GitProviderConfig,
  path: string,
  file: RemoteTextFileDto,
  loadedAt = Date.now()
): GitDraftFile {
  const normalizedPath = normalizeGitPath(path)
  return clearDraftRemoteTracking({
    documentId: buildGitDocumentId(config, normalizedPath),
    path: normalizedPath,
    name: file.name || getGitFileName(normalizedPath),
    sha: file.sha,
    content: file.content,
    originalContent: file.content,
    draftContent: file.content,
    isDirty: false,
    isNew: false,
    fileOrigin: undefined,
    status: 'clean',
    hasConflict: false,
    lastCheckedAt: loadedAt,
    provider: config.provider,
    repo: config.repo,
    ownerOrNamespace: config.ownerOrNamespace,
    branch: config.branch,
  })
}

function findRenameSourceDeleteChange(
  stagedChanges: StagedGitChange[],
  pendingStructuralChanges: StagedGitChange[],
  renamedFromPath: string
) {
  const normalizedPath = normalizeGitPath(renamedFromPath)
  return [...stagedChanges, ...pendingStructuralChanges].find((item) => (
    item.kind === 'git-delete-file' &&
    normalizeGitPath(item.repoPath) === normalizedPath
  ))
}

function replaceGitPathPrefix(path: string, oldPrefix: string, newPrefix: string) {
  const normalizedPath = normalizeGitPath(path)
  const normalizedOldPrefix = normalizeGitPath(oldPrefix)
  const normalizedNewPrefix = normalizeGitPath(newPrefix)

  if (normalizedPath === normalizedOldPrefix) {
    return normalizedNewPrefix
  }

  if (!normalizedPath.startsWith(`${normalizedOldPrefix}/`)) {
    return normalizedPath
  }

  return joinGitPath(normalizedNewPrefix, normalizedPath.slice(normalizedOldPrefix.length + 1))
}

function isFolderRenamePathTaken(
  candidatePath: string,
  sourceFolderPath: string,
  drafts: Record<string, GitDraftFile>,
  remoteSnapshotEntries: Record<string, GitRemoteSnapshotEntry>,
  stagedChanges: StagedGitChange[],
  pendingAssetChanges: StagedGitChange[],
  pendingStructuralChanges: StagedGitChange[]
) {
  const normalizedCandidatePath = normalizeGitPath(candidatePath)
  const normalizedSourceFolderPath = normalizeGitPath(sourceFolderPath)
  const isOutsideSourceSubtree = (path: string) => !isGitPathWithinFolder(path, normalizedSourceFolderPath)

  return (
    Object.values(drafts).some((item) => (
      isOutsideSourceSubtree(normalizeGitPath(item.path)) &&
      normalizeGitPath(item.path) === normalizedCandidatePath
    )) ||
    Object.keys(remoteSnapshotEntries).some((path) => (
      isOutsideSourceSubtree(normalizeGitPath(path)) &&
      normalizeGitPath(path) === normalizedCandidatePath
    )) ||
    stagedChanges.some((item) => (
      isOutsideSourceSubtree(normalizeGitPath(item.repoPath)) &&
      normalizeGitPath(item.repoPath) === normalizedCandidatePath
    )) ||
    pendingAssetChanges.some((item) => (
      isOutsideSourceSubtree(normalizeGitPath(item.repoPath)) &&
      normalizeGitPath(item.repoPath) === normalizedCandidatePath
    )) ||
    pendingStructuralChanges.some((item) => (
      isOutsideSourceSubtree(normalizeGitPath(item.repoPath)) &&
      normalizeGitPath(item.repoPath) === normalizedCandidatePath
    ))
  )
}

function buildRenamedGitDraft(
  config: GitProviderConfig,
  sourceDraft: GitDraftFile,
  nextPath: string
): GitDraftFile {
  const normalizedNextPath = normalizeGitPath(nextPath)
  const nextDocumentId = buildGitDocumentId(config, normalizedNextPath)
  const nextName = getGitFileName(normalizedNextPath)

  if (sourceDraft.isNew) {
    return {
      ...sourceDraft,
      documentId: nextDocumentId,
      path: normalizedNextPath,
      name: nextName,
      provider: config.provider,
      repo: config.repo,
      ownerOrNamespace: config.ownerOrNamespace,
      branch: config.branch,
    }
  }

  const nextContent = sourceDraft.draftContent
  const nextDirty = hasMeaningfulLocalGitChange(nextContent, '')

  return {
    ...sourceDraft,
    documentId: nextDocumentId,
    path: normalizedNextPath,
    name: nextName,
    sha: undefined,
    content: nextContent,
    originalContent: '',
    draftContent: nextContent,
    isDirty: nextDirty,
    isNew: true,
    renamedFromPath: sourceDraft.renamedFromPath ?? sourceDraft.path,
    renamedFromSha: sourceDraft.renamedFromSha ?? sourceDraft.sha,
    fileOrigin: 'remote',
    status: nextDirty ? 'dirty' : 'clean',
    remoteContent: undefined,
    remoteSha: undefined,
    remoteMissing: false,
    hasRemoteUpdates: false,
    hasConflict: false,
    conflictResolvedContent: undefined,
    conflictSnapshot: undefined,
    lastCheckedAt: Date.now(),
    provider: config.provider,
    repo: config.repo,
    ownerOrNamespace: config.ownerOrNamespace,
    branch: config.branch,
  }
}

function findContainingDeleteFolderChange(
  stagedChanges: StagedGitChange[],
  pendingStructuralChanges: StagedGitChange[],
  path: string
) {
  const normalizedPath = normalizeGitPath(path)
  const allFolderDeletes = [...stagedChanges, ...pendingStructuralChanges]
    .filter((item) => item.kind === 'git-delete-folder' && isGitPathWithinFolder(normalizedPath, item.repoPath))
    .sort((left, right) => normalizeGitPath(right.repoPath).length - normalizeGitPath(left.repoPath).length)

  return allFolderDeletes[0]
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
  tabsStore.markTabAsSaved(tab.id, draft.name)
}

function buildGitTabStateFromDraft(draft: GitDraftFile) {
  return buildGitTabDraftState(draft)
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

function restoreGitDraftBackToLocalFile(draft: GitDraftFile | undefined) {
  if (!draft?.localFileId) {
    return false
  }

  const fileSystemStore = useFileSystemStore.getState()
  const localFile = fileSystemStore.files.find((item) => item.id === draft.localFileId)
  if (!localFile) {
    return false
  }

  const tabsStore = useTabsStore.getState()
  const gitTab = tabsStore.tabs.find((tab) => tab.sourceType === 'git' && tab.fileId === draft.documentId) || null

  if (gitTab) {
    tabsStore.openFileInCurrentTab(gitTab.id, localFile.name, localFile.content, localFile.id)
  }

  fileSystemStore.openFile(localFile.id)

  const activeTab = useTabsStore.getState().getActiveTab()
  if (activeTab?.sourceType === 'local' && activeTab.fileId === localFile.id) {
    useDocumentStore.getState().loadDocument(localFile.content, localFile.name, localFile.id)
  }

  return true
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

function getDocumentAssetDirectory(draftPath: string) {
  void draftPath
  return GIT_ASSET_ROOT_DIRECTORY
}

function normalizePersistedDraftFileOrigin(draft: Record<string, unknown>) {
  if (draft.fileOrigin === 'local' || draft.fileOrigin === 'remote') {
    return draft.fileOrigin
  }

  if (draft.creationSource === 'local') {
    return 'local'
  }

  if (draft.creationSource === 'git') {
    return 'remote'
  }

  return undefined
}

function sanitizePersistedDrafts(input: unknown): Record<string, GitDraftFile> {
  if (!input || typeof input !== 'object') return {}

  return Object.fromEntries(
    Object.entries(input as Record<string, GitDraftFile>).map(([documentId, draft]) => {
      const normalizedDraft = draft as GitDraftFile & { creationSource?: 'git' | 'local' }
      const status =
        normalizedDraft.hasConflict
          ? 'conflict'
          : (normalizedDraft.isDirty || normalizedDraft.isNew)
            ? 'dirty'
            : 'clean'

      return [documentId, {
        ...normalizedDraft,
        fileOrigin: normalizePersistedDraftFileOrigin(normalizedDraft),
        status,
      }]
    })
  )
}

function sanitizePersistedStagedChanges(
  input: unknown,
  drafts: Record<string, GitDraftFile>
): StagedGitChange[] {
  if (!Array.isArray(input)) return []

  return input.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== 'object') {
      return []
    }

    const item = rawItem as Record<string, unknown> & {
      id?: string
      kind?: string
      label?: string
      repoPath?: string
      documentId?: string
      updatedAt?: number
      localFileId?: string
    }
    if (
      typeof item.id !== 'string' ||
      typeof item.kind !== 'string' ||
      typeof item.label !== 'string' ||
      typeof item.repoPath !== 'string'
    ) {
      return []
    }

    const normalizedRepoPath = normalizeGitPath(item.repoPath)
    const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : Date.now()

    if (item.kind === 'local-file') {
      const matchingDraft =
        (typeof item.localFileId === 'string' &&
          Object.values(drafts).find((draft) => normalizeGitPath(draft.path) === normalizedRepoPath)) ||
        (typeof item.documentId === 'string' ? drafts[item.documentId] : undefined)

      if (!matchingDraft) {
        return []
      }

      return [createDraftStageChange(matchingDraft, `git-draft:${matchingDraft.documentId}`)]
    }

    if (
      item.kind !== 'git-draft' &&
      item.kind !== 'git-asset' &&
      item.kind !== 'git-delete-file' &&
      item.kind !== 'git-delete-folder' &&
      item.kind !== 'git-create-folder'
    ) {
      return []
    }

    return [{
      ...(item as Partial<StagedGitChange>),
      repoPath: normalizedRepoPath,
      updatedAt,
    } as StagedGitChange]
  })
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
    remoteSnapshotEntries: {},
    remoteSnapshotFetchedAt: null,
    remoteContentCache: {},
  }
}

function sanitizePersistedWorkspaceState(input: unknown): GitWorkspaceState {
  if (!input || typeof input !== 'object') {
    return createEmptyGitWorkspaceState()
  }

  const state = input as Partial<GitWorkspaceState> & { baseTreeMap?: Record<string, string> }
  const drafts = sanitizePersistedDrafts(state.drafts)
  const legacyBaseTreeMap =
    state.baseTreeMap && typeof state.baseTreeMap === 'object'
      ? state.baseTreeMap as Record<string, string>
      : {}
  const remoteSnapshotEntries = sanitizePersistedRemoteSnapshotEntries(state.remoteSnapshotEntries)
  const currentDocumentId =
    typeof state.currentDocumentId === 'string' && drafts[state.currentDocumentId]
      ? state.currentDocumentId
      : null

  return {
    drafts,
    stagedChanges: sanitizePersistedStagedChanges(state.stagedChanges, drafts),
    pendingAssetChanges: sanitizePersistedPendingAssetChanges(state.pendingAssetChanges),
    pendingStructuralChanges: sanitizePersistedPendingStructuralChanges(state.pendingStructuralChanges),
    currentDocumentId,
    expandedPaths: sanitizePersistedExpandedPaths(state.expandedPaths),
    pendingCommitMessage: typeof state.pendingCommitMessage === 'string' ? state.pendingCommitMessage : null,
    remoteSnapshotEntries:
      hasAnyRemoteSnapshotMetadata(remoteSnapshotEntries)
        ? remoteSnapshotEntries
        : buildFileSnapshotEntriesFromShaMap(legacyBaseTreeMap),
    remoteSnapshotFetchedAt: typeof state.remoteSnapshotFetchedAt === 'number' ? state.remoteSnapshotFetchedAt : null,
    remoteContentCache: sanitizePersistedRemoteContentCache(state.remoteContentCache),
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
  state: Pick<GitStore, 'drafts' | 'stagedChanges' | 'pendingAssetChanges' | 'pendingStructuralChanges' | 'currentDocumentId' | 'expandedPaths' | 'pendingCommitMessage' | 'remoteSnapshotEntries' | 'remoteSnapshotFetchedAt' | 'remoteContentCache'>
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
    remoteSnapshotEntries: state.remoteSnapshotEntries,
    remoteSnapshotFetchedAt: state.remoteSnapshotFetchedAt,
    remoteContentCache: state.remoteContentCache,
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
  state: Pick<GitStore, 'config' | 'drafts' | 'stagedChanges' | 'pendingAssetChanges' | 'pendingStructuralChanges' | 'currentDocumentId' | 'expandedPaths' | 'pendingCommitMessage' | 'remoteSnapshotEntries' | 'remoteSnapshotFetchedAt' | 'remoteContentCache' | 'workspaceStateByKey'>,
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

function hasMeaningfulGitWorkspaceState(state: GitWorkspaceState) {
  return (
    Object.keys(state.drafts).length > 0 ||
    state.stagedChanges.length > 0 ||
    state.pendingAssetChanges.length > 0 ||
    state.pendingStructuralChanges.length > 0 ||
    state.expandedPaths.length > 0 ||
    !!state.pendingCommitMessage ||
    hasAnyRemoteSnapshotMetadata(state.remoteSnapshotEntries) ||
    Object.keys(state.remoteContentCache).length > 0
  )
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
    remoteSnapshotEntries: state.remoteSnapshotEntries,
    remoteSnapshotFetchedAt: state.remoteSnapshotFetchedAt,
    baseTreeMap: state.baseTreeMap,
    remoteContentCache: state.remoteContentCache,
  })
  const currentWorkspaceKey = buildGitWorkspaceKey(normalizedConfig)
  const currentWorkspaceMissingFromBuckets = !!currentWorkspaceKey && !normalizedWorkspaceStateByKey[currentWorkspaceKey]
  const migratedWorkspaceStateByKey = (
    fromVersion < 3 ||
    (currentWorkspaceMissingFromBuckets && hasMeaningfulGitWorkspaceState(legacyWorkspaceState))
  )
    ? upsertWorkspaceStateForConfig(normalizedWorkspaceStateByKey, normalizedConfig, legacyWorkspaceState)
    : normalizedWorkspaceStateByKey
  const currentWorkspaceState = buildGitWorkspaceKey(normalizedConfig)
    ? getWorkspaceStateForConfig(migratedWorkspaceStateByKey, normalizedConfig)
    : legacyWorkspaceState

  // v1 only persisted connection config. v2 adds a single global Git workspace.
  // v3 buckets Git workspace state by provider + owner/namespace + repo + branch.
  // v4 adds pending structural Git changes separate from staged changes.
  // v5 adds a remote text content cache split from drafts.
  // v6 adds explicit remote snapshot entries/fetchedAt alongside the projected tree.
  // v7 retires persisted baseTreeMap as an active runtime field; legacy values only seed snapshot migration.
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
      remoteSnapshotEntries: currentWorkspaceState.remoteSnapshotEntries,
      remoteSnapshotFetchedAt: currentWorkspaceState.remoteSnapshotFetchedAt,
      remoteContentCache: currentWorkspaceState.remoteContentCache,
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
    remoteSnapshotEntries: currentWorkspaceState.remoteSnapshotEntries,
    remoteSnapshotFetchedAt: currentWorkspaceState.remoteSnapshotFetchedAt,
    remoteContentCache: currentWorkspaceState.remoteContentCache,
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
              remoteSnapshotEntries: configChanged ? {} : state.remoteSnapshotEntries,
              remoteSnapshotFetchedAt: configChanged ? null : state.remoteSnapshotFetchedAt,
              remoteContentCache: nextWorkspace.remoteContentCache,
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
                remoteSnapshotEntries: nextWorkspace.remoteSnapshotEntries,
                remoteSnapshotFetchedAt: nextWorkspace.remoteSnapshotFetchedAt,
                remoteContentCache: nextWorkspace.remoteContentCache,
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
            const normalizedItems = items.map((item) => ({
              ...item,
              path: normalizeGitPath(item.path),
            }))
            const fetchedAt = Date.now()
            set((state) => {
              return buildScopedRemoteTreeState(
                state.remoteSnapshotEntries,
                state.treeByPath,
                normalizedPath,
                normalizedItems,
                fetchedAt
              )
            })
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
          const snapshotSha = get().remoteSnapshotEntries[normalizedPath]?.sha
          if (existingDraft && (existingDraft.isNew || existingDraft.isDirty)) {
            set({ currentDocumentId: existingDraft.documentId })
            return existingDraft
          }
          if (existingDraft && !existingDraft.hasConflict && (snapshotSha || '') === (existingDraft.sha || '')) {
            set({ currentDocumentId: existingDraft.documentId })
            return existingDraft
          }

          const runtimeConfig = toRuntimeConfig(config)
          const client = getGitProviderClient(runtimeConfig)
          const cachedFile = getGitRemoteContentCacheHit(get().remoteContentCache, normalizedPath, snapshotSha)
          const file = cachedFile
            ? cachedFile
            : await client.getFile(runtimeConfig, normalizedPath)
          const loadedAt = Date.now()
          const documentId = buildGitDocumentId(config, normalizedPath)
          const draft = createGitDraftFromRemoteSource(config, normalizedPath, file, loadedAt)
          set((state) => ({
            drafts: {
              ...state.drafts,
              [documentId]: draft,
            },
            remoteContentCache: {
              ...state.remoteContentCache,
              [normalizedPath]: createRemoteTextCacheEntry(file, loadedAt),
            },
            currentDocumentId: documentId,
            lastFetchedAt: loadedAt,
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
              remoteSnapshotEntries: workspaceChanged ? {} : state.remoteSnapshotEntries,
              remoteSnapshotFetchedAt: workspaceChanged ? null : state.remoteSnapshotFetchedAt,
              remoteContentCache: nextWorkspace.remoteContentCache,
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
            const nextChange = createDraftStageChange(draft, existing?.id)

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
                  localFileId: existingDraft.localFileId ?? fileId,
                  status: existingDraft.isNew
                    ? (nextContent.length > 0 ? 'dirty' : 'clean')
                    : (isExistingDraftDirty ? 'dirty' : 'clean'),
                  fileOrigin: existingDraft.fileOrigin ?? 'local',
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
                  localFileId: fileId,
                  fileOrigin: 'local',
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
            const existingStagedDraft = state.stagedChanges.find((item) => item.kind === 'git-draft' && item.documentId === documentId)
            const nextStagedChange = createDraftStageChange(nextDraft, existingStagedDraft?.id)
            const nextStagedChanges = state.stagedChanges.filter((item) => !(
              item.kind === 'git-draft' && item.documentId === documentId
            ))

            return {
              drafts: {
                ...state.drafts,
                [documentId]: nextDraft,
              },
              stagedChanges: [...nextStagedChanges, nextStagedChange],
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

          set((state) => {
            const shelvedStagedChanges = state.stagedChanges.filter((item) => (
              (item.kind === 'git-draft' || item.kind === 'git-asset') &&
              item.documentId === existingDraft.documentId
            ))
            const shelvedPendingAssetChanges = state.pendingAssetChanges.filter((item) => item.documentId === existingDraft.documentId)

            return {
              stagedChanges: [
                ...state.stagedChanges.filter((item) => !(
                  (item.kind === 'git-draft' && item.documentId === existingDraft.documentId) ||
                  (item.kind === 'git-asset' && item.documentId === existingDraft.documentId) ||
                  (item.kind === 'git-delete-file' && item.repoPath === normalizedPath)
                )),
              ],
              pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.documentId !== existingDraft.documentId),
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
                  shelvedStagedChanges,
                  shelvedPendingAssetChanges,
                  updatedAt: Date.now(),
                },
              ],
            }
          })
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
            const shelvedDrafts = removedPureLocalDrafts.map((draft) => ({ ...draft }))
            const shelvedStagedChanges = state.stagedChanges.filter((item) => (
              isGitPathWithinFolder(item.repoPath, normalizedPath) ||
              removedPureLocalDocumentIds.includes(item.documentId || '')
            ))
            const shelvedPendingAssetChanges = state.pendingAssetChanges.filter((item) => isGitPathWithinFolder(item.repoPath, normalizedPath))
            const shelvedPendingStructuralChanges = state.pendingStructuralChanges.filter((item) => isGitPathWithinFolder(item.repoPath, normalizedPath))

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
                shelvedDrafts: normalizeGitPath(dirPath) === normalizedPath ? shelvedDrafts : undefined,
                shelvedStagedChanges: normalizeGitPath(dirPath) === normalizedPath ? shelvedStagedChanges : undefined,
                shelvedPendingAssetChanges: normalizeGitPath(dirPath) === normalizedPath ? shelvedPendingAssetChanges : undefined,
                shelvedPendingStructuralChanges: normalizeGitPath(dirPath) === normalizedPath ? shelvedPendingStructuralChanges : undefined,
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

          if (change.kind === 'git-draft' && change.documentId) {
            const currentDraft = get().drafts[change.documentId]

            if (currentDraft?.isNew) {
              const restoredToLocal = restoreGitDraftBackToLocalFile(currentDraft)

              set((state) => {
                const nextDrafts = { ...state.drafts }
                delete nextDrafts[change.documentId!]

                return {
                  drafts: nextDrafts,
                  stagedChanges: state.stagedChanges.filter((item) => item.id !== changeId),
                  pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.documentId !== change.documentId),
                  pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => item.documentId !== change.documentId),
                  currentDocumentId: state.currentDocumentId === change.documentId ? null : state.currentDocumentId,
                }
              })

              if (!restoredToLocal) {
                const tab = useTabsStore.getState().findTabByFileId(change.documentId)
                if (tab) {
                  useTabsStore.getState().closeTab(tab.id)
                }
              }

              return
            }
          }

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

            const restagedAsset = createBinaryStageChange({
              ...asset,
              kind: 'git-asset',
            })

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
            const originalContent = currentDraft.originalContent
            const shouldKeepStagedAsset = (item: StagedGitChange) => (
              item.kind === 'git-asset' &&
              item.documentId === documentId &&
              draftReferencesRepoPath(currentDraft.path, originalContent, item.repoPath)
            )
            const shouldKeepPendingAsset = (item: StagedGitChange) => (
              item.documentId === documentId &&
              draftReferencesRepoPath(currentDraft.path, originalContent, item.repoPath)
            )

            return {
              drafts: {
                ...state.drafts,
                [documentId]: {
                  ...currentDraft,
                  content: originalContent,
                  draftContent: originalContent,
                  isDirty: false,
                  status: currentDraft.hasConflict ? 'conflict' : 'clean',
                  conflictResolvedContent: currentDraft.hasConflict
                    ? currentDraft.conflictResolvedContent
                  : undefined,
                },
              },
              pendingAssetChanges: state.pendingAssetChanges.filter((item) => {
                if (item.documentId !== documentId) {
                  return true
                }

                return shouldKeepPendingAsset(item)
              }),
              pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => !(
                item.kind === 'git-delete-file' && item.documentId === documentId
              )),
              stagedChanges: state.stagedChanges.filter((item) => {
                if (item.kind === 'git-delete-file' && item.documentId === documentId) {
                  return false
                }

                if (item.kind === 'git-asset' && item.documentId === documentId) {
                  return shouldKeepStagedAsset(item)
                }

                return true
              }),
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
              stagedChanges: [
                ...state.stagedChanges.filter((item) => !(
                  targetChange.shelvedStagedChanges?.some((shelved) => shelved.id === item.id)
                )),
                ...(targetChange.shelvedStagedChanges || []),
              ],
              pendingAssetChanges: [
                ...state.pendingAssetChanges.filter((item) => !(
                  targetChange.shelvedPendingAssetChanges?.some((shelved) => shelved.id === item.id)
                )),
                ...(targetChange.shelvedPendingAssetChanges || []),
              ],
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
            set((state) => {
              const nextDrafts = { ...state.drafts }
              ;(targetChange.shelvedDrafts || []).forEach((draft) => {
                nextDrafts[draft.documentId] = draft
              })

              return {
                drafts: nextDrafts,
                stagedChanges: [
                  ...state.stagedChanges.filter((item) => !(
                    isGitPathWithinFolder(item.repoPath, normalizedPath) ||
                    targetChange.shelvedStagedChanges?.some((shelved) => shelved.id === item.id)
                  )),
                  ...(targetChange.shelvedStagedChanges || []),
                ],
                pendingAssetChanges: [
                  ...state.pendingAssetChanges.filter((item) => !(
                    isGitPathWithinFolder(item.repoPath, normalizedPath) ||
                    targetChange.shelvedPendingAssetChanges?.some((shelved) => shelved.id === item.id)
                  )),
                  ...(targetChange.shelvedPendingAssetChanges || []),
                ],
                pendingStructuralChanges: [
                  ...state.pendingStructuralChanges.filter((item) => !(
                    isGitPathWithinFolder(item.repoPath, normalizedPath) ||
                    targetChange.shelvedPendingStructuralChanges?.some((shelved) => shelved.id === item.id)
                  )),
                  ...(targetChange.shelvedPendingStructuralChanges || []),
                ],
              }
            })
          }
        },

        uploadAsset: async (documentId, file) => {
          const workspaceConfig = resolveGitWorkspaceConfigForDocumentId(get(), documentId)
          if (workspaceConfig && buildGitWorkspaceKey(workspaceConfig) !== buildGitWorkspaceKey(get().config)) {
            get().setCurrentDocumentId(documentId)
          }

          const { config, drafts, remoteSnapshotEntries } = get()
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
          const assetFileName = createAssetFileName(normalizedDraftPath, file)
          const repoPath = joinGitPath(GIT_ASSET_ROOT_DIRECTORY, assetFileName)
          const contentBase64 = arrayBufferToBase64(await file.arrayBuffer())
          const mimeType = file.type || undefined
          const remoteAssetSha = remoteSnapshotEntries[repoPath]?.type === 'file'
            ? remoteSnapshotEntries[repoPath]?.sha
            : undefined

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
                baseSha: remoteAssetSha,
                originalSha: remoteAssetSha,
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
            const checkedAt = Date.now()
            const normalizedDraftPath = normalizeGitPath(draft.path)
            const parentPath = getParentGitPath(normalizedDraftPath)
            const parentItems = await client.listTree(runtimeConfig, parentPath)
            const normalizedParentItems = parentItems
              .filter((item) => item.name !== '.gitkeep')
              .map((item) => ({
                ...item,
                path: normalizeGitPath(item.path),
              }))

            set((state) => ({
              ...buildScopedRemoteTreeState(
                state.remoteSnapshotEntries,
                state.treeByPath,
                parentPath,
                normalizedParentItems,
                checkedAt
              ),
            }))

            const latestDraft = get().drafts[targetDocumentId] || draft
            const remoteEntry = normalizedParentItems.find((item) => (
              item.type === 'file' &&
              normalizeGitPath(item.path) === normalizedDraftPath
            ))
            const cacheHit = remoteEntry
              ? getGitRemoteContentCacheHit(get().remoteContentCache, normalizedDraftPath, remoteEntry.sha)
              : null
            const remoteFile = remoteEntry
              ? (
                  (remoteEntry.sha || '') === (latestDraft.sha || '')
                    ? {
                        path: normalizedDraftPath,
                        name: remoteEntry.name || latestDraft.name,
                        sha: remoteEntry.sha,
                        content: latestDraft.originalContent,
                      } satisfies RemoteTextFileDto
                    : latestDraft.remoteContent && (remoteEntry.sha || '') === (latestDraft.remoteSha || '')
                      ? {
                          path: normalizedDraftPath,
                          name: remoteEntry.name || latestDraft.name,
                          sha: remoteEntry.sha,
                          content: latestDraft.remoteContent,
                        } satisfies RemoteTextFileDto
                      : cacheHit
                        ? {
                            path: cacheHit.path,
                            name: remoteEntry.name || cacheHit.name,
                            sha: cacheHit.sha,
                            content: cacheHit.content,
                          } satisfies RemoteTextFileDto
                        : await client.getFile(runtimeConfig, normalizedDraftPath)
                )
              : await client.getFile(runtimeConfig, normalizedDraftPath)
            const remoteCacheEntry = createRemoteTextCacheEntry(remoteFile, checkedAt)
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
                    status: hasMeaningfulLocalGitChange(
                      mergeResult.mergedText,
                      remoteFile.content
                    ) ? 'dirty' : 'clean',
                  }
                }

                return {
                  drafts: {
                    ...state.drafts,
                    [targetDocumentId]: nextDraft!,
                  },
                  remoteContentCache: {
                    ...state.remoteContentCache,
                    [remoteCacheEntry.path]: remoteCacheEntry,
                  },
                  lastFetchedAt: checkedAt,
                }
              }

              nextDraft = {
                ...currentDraft,
                name: remoteFile.name || currentDraft.name,
                lastCheckedAt: checkedAt,
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

              if (remoteChanged) {
                nextDraft = {
                  ...nextDraft,
                  remoteSha: remoteFile.sha,
                  remoteContent: remoteFile.content,
                  remoteMissing: false,
                  hasRemoteUpdates: true,
                }
              } else {
                nextDraft = clearDraftRemoteTracking(nextDraft)
              }

              return {
                drafts: {
                  ...state.drafts,
                  [targetDocumentId]: nextDraft!,
                },
                remoteContentCache: {
                  ...state.remoteContentCache,
                  [remoteCacheEntry.path]: remoteCacheEntry,
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
            const isLegacyRenameConflict = snapshot.kind === 'rename' && !!snapshot.pathHint
            const shouldClearRenameTracking = Boolean(isLegacyRenameConflict || (snapshot.remoteMissing && draft.renamedFromPath))
            const renamedFromPath = shouldClearRenameTracking && draft.renamedFromPath
              ? normalizeGitPath(draft.renamedFromPath)
              : ''
            const existingStagedDraft = state.stagedChanges.find((item) => (
              item.kind === 'git-draft' &&
              item.documentId === documentId
            ))
            const nextResolvedStagedDraft = existingStagedDraft
              ? createDraftStageChange(
                  shouldClearRenameTracking
                    ? {
                        ...resolvedDraft,
                        renamedFromPath: undefined,
                        renamedFromSha: undefined,
                      }
                    : resolvedDraft,
                  existingStagedDraft.id
                )
              : null

            return {
              drafts: {
                ...state.drafts,
                [documentId]: {
                  ...resolvedDraft,
                  renamedFromPath: shouldClearRenameTracking ? undefined : resolvedDraft.renamedFromPath,
                  renamedFromSha: shouldClearRenameTracking ? undefined : resolvedDraft.renamedFromSha,
                  status: resolvedDraft.isDirty ? 'dirty' : 'clean',
                },
              },
              stagedChanges: shouldClearRenameTracking
                  ? [
                      ...state.stagedChanges.filter((item) => !(
                        item.id === existingStagedDraft?.id ||
                        normalizeGitPath(item.repoPath) === renamedFromPath
                      )),
                      ...(nextResolvedStagedDraft ? [nextResolvedStagedDraft] : []),
                    ]
                  : nextResolvedStagedDraft
                  ? state.stagedChanges.map((item) => item.id === nextResolvedStagedDraft.id ? nextResolvedStagedDraft : item)
                  : state.stagedChanges,
              pendingStructuralChanges: shouldClearRenameTracking
                  ? state.pendingStructuralChanges.filter((item) => normalizeGitPath(item.repoPath) !== renamedFromPath)
                  : state.pendingStructuralChanges,
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
          if (snapshot.kind === 'path' && snapshot.pathHint) {
            const remoteAddedPath = normalizeGitPath(snapshot.pathHint)
            const folderDeleteChange = findContainingDeleteFolderChange(
              get().stagedChanges,
              get().pendingStructuralChanges,
              remoteAddedPath
            )
            const folderPath = folderDeleteChange ? normalizeGitPath(folderDeleteChange.repoPath) : getParentGitPath(remoteAddedPath)
            const tab = useTabsStore.getState().findTabByFileId(documentId)

            set((state) => {
              const nextDrafts = { ...state.drafts }
              delete nextDrafts[documentId]
              ;(folderDeleteChange?.shelvedDrafts || []).forEach((draft) => {
                nextDrafts[draft.documentId] = draft
              })

              return {
                drafts: nextDrafts,
                stagedChanges: [
                  ...state.stagedChanges.filter((item) => !(
                    (item.kind === 'git-draft' && item.documentId === documentId) ||
                    (item.kind === 'git-asset' && item.documentId === documentId) ||
                    (folderPath && isGitPathWithinFolder(item.repoPath, folderPath) && (
                      item.kind === 'git-delete-file' || item.kind === 'git-delete-folder'
                    )) ||
                    folderDeleteChange?.shelvedStagedChanges?.some((shelved) => shelved.id === item.id)
                  )),
                  ...(folderDeleteChange?.shelvedStagedChanges || []),
                ],
                pendingAssetChanges: [
                  ...state.pendingAssetChanges.filter((item) => !(
                    item.documentId === documentId ||
                    (folderPath && isGitPathWithinFolder(item.repoPath, folderPath)) ||
                    folderDeleteChange?.shelvedPendingAssetChanges?.some((shelved) => shelved.id === item.id)
                  )),
                  ...(folderDeleteChange?.shelvedPendingAssetChanges || []),
                ],
                pendingStructuralChanges: [
                  ...state.pendingStructuralChanges.filter((item) => !(
                    (folderPath && isGitPathWithinFolder(item.repoPath, folderPath) && (
                      item.kind === 'git-delete-file' || item.kind === 'git-delete-folder'
                    )) ||
                    folderDeleteChange?.shelvedPendingStructuralChanges?.some((shelved) => shelved.id === item.id)
                  )),
                  ...(folderDeleteChange?.shelvedPendingStructuralChanges || []),
                ],
                currentDocumentId: state.currentDocumentId === documentId ? null : state.currentDocumentId,
              }
            })

            if (tab) {
              useTabsStore.getState().closeTab(tab.id)
            }
            return
          }
          if (snapshot.remoteMissing || snapshot.kind === 'rename') {
            const tab = useTabsStore.getState().findTabByFileId(documentId)
            const parentPath = getParentGitPath(draft.path)
            const renamedFromPath = draft.renamedFromPath
              ? normalizeGitPath(draft.renamedFromPath)
              : ''
            set((state) => {
              const nextDrafts = { ...state.drafts }
              delete nextDrafts[documentId]

              return {
                drafts: nextDrafts,
                stagedChanges: state.stagedChanges.filter((item) => (
                  item.documentId !== documentId &&
                  (!renamedFromPath || normalizeGitPath(item.repoPath) !== renamedFromPath)
                )),
                pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.documentId !== documentId),
                pendingStructuralChanges: state.pendingStructuralChanges.filter((item) => (
                  item.documentId !== documentId &&
                  (!renamedFromPath || normalizeGitPath(item.repoPath) !== renamedFromPath)
                )),
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
          if (typeof snapshot.remoteContent !== 'string') return

          set((state) => {
            const currentDraft = state.drafts[documentId]
            if (!currentDraft) return state

            return {
              drafts: {
                ...state.drafts,
                [documentId]: clearDraftRemoteTracking({
                  ...currentDraft,
                  sha: snapshot.remoteSha || currentDraft.remoteSha || currentDraft.sha,
                  content: snapshot.remoteContent,
                  originalContent: snapshot.remoteContent,
                  draftContent: snapshot.remoteContent,
                  isDirty: false,
                  isNew: false,
                  fileOrigin: undefined,
                  status: 'clean',
                  hasConflict: false,
                  conflictResolvedContent: undefined,
                  conflictSnapshot: undefined,
                }),
              },
            }
          })

          const stagedItem = get().stagedChanges.find((item) => item.kind === 'git-draft' && item.documentId === documentId)
          if (stagedItem) {
            get().unstageChange(stagedItem.id)
          }
        },

        refreshRepositoryFromRemote: async () => {
          const { config, drafts, stagedChanges, remoteSnapshotFetchedAt } = get()
          if (hasAnyConflictDraft(drafts)) {
            throw new Error('Resolve all conflicted files before refreshing repository content')
          }

          set({ isLoadingTree: true, isFetchingRemote: true, error: null })
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            const { treeByPath: remoteTreeByPath, entriesByPath: remoteSnapshotEntries } = await loadCompleteRemoteTree(client, runtimeConfig)
            const currentRemoteSnapshotEntries = get().remoteSnapshotEntries
            const remoteTreeMap = buildTreeShaMap(remoteSnapshotEntries)
            const hasBaseline = hasCompleteRemoteSnapshotBaseline(remoteSnapshotFetchedAt)
            const treeDiff = hasBaseline
              ? diffGitRemoteSnapshotEntries(currentRemoteSnapshotEntries, remoteSnapshotEntries)
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
              : Object.keys(remoteTreeMap)
            const pullBlockers = findGitPullBlockers({
              drafts: get().drafts,
              stagedChanges: get().stagedChanges,
              pendingAssetChanges: get().pendingAssetChanges,
              pendingStructuralChanges: get().pendingStructuralChanges,
              changedPaths,
              remoteTreeMap,
            })
            if (pullBlockers.length > 0) {
              throw new Error(toGitPullBlockerMessage(pullBlockers[0].kind, pullBlockers[0].path))
            }
            const stagedAssetConflicts = findGitStagedAssetConflicts(
              get().stagedChanges,
              changedPaths,
              remoteTreeMap
            )
            if (stagedAssetConflicts.length > 0) {
              throw new Error(`Remote file '${stagedAssetConflicts[0]}' changed since the asset was staged`)
            }
            const directoryPathConflicts = findGitDirectoryPathConflicts(
              get().stagedChanges,
              get().pendingStructuralChanges,
              treeDiff.addedPaths
            )
            if (directoryPathConflicts.length > 0) {
              const conflict = directoryPathConflicts[0]
              if (conflict.kind === 'directory-delete-add-file') {
                const representativeDelete =
                  get().stagedChanges.find((item) => item.kind === 'git-delete-file' && isGitPathWithinFolder(item.repoPath, conflict.folderPath)) ||
                  get().pendingStructuralChanges.find((item) => item.kind === 'git-delete-file' && isGitPathWithinFolder(item.repoPath, conflict.folderPath))
                let representativeDraft = representativeDelete?.documentId
                  ? get().drafts[representativeDelete.documentId]
                  : undefined

                if (!representativeDraft && representativeDelete?.repoPath) {
                  try {
                    representativeDraft = await get().openFile(representativeDelete.repoPath)
                  } catch {
                    representativeDraft = undefined
                  }
                }

                if (representativeDraft) {
                  set((state) => ({
                    drafts: {
                      ...state.drafts,
                      [representativeDraft.documentId]: applyConflictState(
                        state.drafts[representativeDraft.documentId],
                        '',
                        undefined,
                        representativeDraft.draftContent,
                        true,
                        'path',
                        conflict.path
                      ),
                    },
                  }))
                }

                throw new Error(toGitPullBlockerMessage(conflict.kind, conflict.path, conflict.folderPath))
              }
            }
            const snapshotFetchedAt = Date.now()
            const nextRemoteContentCache = pruneGitRemoteContentCache(get().remoteContentCache, remoteSnapshotEntries)
            const conflictedDocumentIds: string[] = []
            const handledRenameConflictDocumentIds = new Set<string>()
            const deletedSourcePaths = new Set(treeDiff.deletedPaths.map((path) => normalizeGitPath(path)))
            const remoteAddedPathsBySha = new Map<string, string[]>()
            const remoteAddedFilePaths = treeDiff.addedPaths
              .map((path) => normalizeGitPath(path))
              .filter((path) => remoteSnapshotEntries[path]?.type === 'file')
            const remoteFileCache = new Map<string, Awaited<ReturnType<typeof client.getFile>>>()

            const getRemoteFileForPath = async (path: string) => {
              const normalizedPath = normalizeGitPath(path)
              if (remoteFileCache.has(normalizedPath)) {
                return remoteFileCache.get(normalizedPath)!
              }

              const remoteFile = await client.getFile(runtimeConfig, normalizedPath)
              remoteFileCache.set(normalizedPath, remoteFile)
              nextRemoteContentCache[normalizedPath] = createRemoteTextCacheEntry(remoteFile, snapshotFetchedAt)
              return remoteFile
            }

            treeDiff.addedPaths.forEach((path) => {
              const normalizedPath = normalizeGitPath(path)
              const sha = remoteSnapshotEntries[normalizedPath]?.sha
              if (!sha) {
                return
              }

              const currentCandidates = remoteAddedPathsBySha.get(sha) || []
              remoteAddedPathsBySha.set(sha, [...currentCandidates, normalizedPath])
            })

            for (const draft of Object.values(get().drafts)) {
              const normalizedDraftPath = normalizeGitPath(draft.path)
              const renamedFromPath = draft.renamedFromPath
                ? normalizeGitPath(draft.renamedFromPath)
                : ''
              const renamedFromSha = draft.renamedFromSha || ''

              if (!draft.isNew || !renamedFromPath || !renamedFromSha) {
                continue
              }

              if (!deletedSourcePaths.has(renamedFromPath)) {
                continue
              }

              const exactRenameTargets = (remoteAddedPathsBySha.get(renamedFromSha) || [])
                .filter((path) => normalizeGitPath(path) !== normalizeGitPath(draft.path))
              const inferredRenameTargets = remoteAddedFilePaths
                .filter((path) => normalizeGitPath(path) !== normalizeGitPath(draft.path))
              const remoteRenameTargets = exactRenameTargets.length > 0
                ? exactRenameTargets
                : inferredRenameTargets

              if (exactRenameTargets.length === 0 && remoteRenameTargets.length !== 1) {
                continue
              }

              if (!remoteRenameTargets.length) {
                continue
              }

              const sourceDeleteChange = findRenameSourceDeleteChange(
                get().stagedChanges,
                get().pendingStructuralChanges,
                renamedFromPath
              )
              const sourceBaseContent = sourceDeleteChange?.originalContent ?? ''
              const sourceBaseSha = sourceDeleteChange?.originalSha ?? draft.renamedFromSha

              handledRenameConflictDocumentIds.add(draft.documentId)
              conflictedDocumentIds.push(draft.documentId)
              set((state) => ({
                drafts: {
                  ...state.drafts,
                  [draft.documentId]: applyConflictState(
                    {
                      ...state.drafts[draft.documentId],
                      originalContent: sourceBaseContent,
                      sha: sourceBaseSha,
                      lastCheckedAt: snapshotFetchedAt,
                    },
                    '',
                    undefined,
                    draft.draftContent,
                    true,
                    'modify-delete'
                  ),
                },
              }))
            }

            const reconcileDocumentIds = new Set<string>()
            Object.values(get().drafts).forEach((draft) => {
              const normalizedDraftPath = normalizeGitPath(draft.path)
              if (
                isPureLocalNewGitDraft(draft) &&
                Object.prototype.hasOwnProperty.call(remoteTreeMap, normalizedDraftPath)
              ) {
                reconcileDocumentIds.add(draft.documentId)
                return
              }

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

            const deletedDocumentIds = new Set<string>()

            for (const documentId of reconcileDocumentIds) {
              if (handledRenameConflictDocumentIds.has(documentId)) {
                continue
              }

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
              const stagedDraftChange =
                get().stagedChanges.find((item) => item.kind === 'git-draft' && item.documentId === documentId) ||
                null
              const hasAssetChange =
                get().stagedChanges.some((item) => item.kind === 'git-asset' && item.documentId === documentId) ||
                get().pendingAssetChanges.some((item) => item.kind === 'git-asset' && item.documentId === documentId)
              const hasEffectiveLocalChange = hasDeleteIntent || hasLocalChange || hasAssetChange

              if (
                isPureLocalNewGitDraft(currentDraft) &&
                remotePathExists &&
                stagedDraftChange
              ) {
                const remoteFile = await getRemoteFileForPath(draftPath)
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
                      currentDraft.draftContent,
                      false,
                      'content'
                    ),
                  },
                }))
                conflictedDocumentIds.push(documentId)
                continue
              }

              if (pathDeletedRemotely) {
                if (deleteIntent) {
                  set((state) => {
                    const nextDrafts = { ...state.drafts }
                    delete nextDrafts[documentId]

                    return {
                      drafts: nextDrafts,
                      stagedChanges: state.stagedChanges.filter((item) => !(
                        item.id === deleteIntent.id ||
                        (item.kind === 'git-asset' && item.documentId === documentId)
                      )),
                      pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.documentId !== documentId),
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

                if (stagedDraftChange) {
                  set((state) => ({
                    drafts: {
                      ...state.drafts,
                      [documentId]: applyConflictState(
                        state.drafts[documentId],
                        '',
                        undefined,
                        currentDraft.draftContent,
                        true,
                        'modify-delete'
                      ),
                    },
                  }))
                  conflictedDocumentIds.push(documentId)
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
                  const nextMergedText = !hasLocalChange && hasAssetChange
                    ? currentDraft.draftContent
                    : mergeResult.mergedText
                  set((state) => ({
                    drafts: {
                      ...state.drafts,
                      [documentId]: {
                        ...resolveDraftAgainstRemoteBase(state.drafts[documentId], nextMergedText),
                        remoteMissing: true,
                        remoteContent: '',
                        remoteSha: undefined,
                        status: hasMeaningfulLocalGitChange(nextMergedText, '') ? 'dirty' : 'clean',
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
                    [documentId]: clearDraftRemoteTracking({
                      ...state.drafts[documentId],
                      name: remoteFile.name || state.drafts[documentId].name,
                      sha: remoteFile.sha,
                      content: remoteFile.content,
                      originalContent: remoteFile.content,
                      draftContent: remoteFile.content,
                      isDirty: false,
                      isNew: false,
                      fileOrigin: undefined,
                      status: 'clean',
                      hasConflict: false,
                      conflictSnapshot: undefined,
                      conflictResolvedContent: undefined,
                      lastCheckedAt: Date.now(),
                    }),
                  },
                }))
                syncOpenGitTabFromDraft(documentId, get().drafts[documentId])
                continue
              }

              if (!remoteChanged && !latestDraft.isNew) {
                set((state) => ({
                  drafts: {
                    ...state.drafts,
                    [documentId]: clearDraftRemoteTracking({
                      ...state.drafts[documentId],
                      lastCheckedAt: Date.now(),
                    }),
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
                      mergeResult.mergedText,
                      false,
                      'modify-delete'
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
                        status: hasMeaningfulLocalGitChange(
                          mergeResult.mergedText,
                          remoteFile.content
                        ) ? 'dirty' : 'clean',
                      },
                    },
                  }))
                syncGitDraftStageState(get(), documentId)
                syncOpenGitTabFromDraft(documentId, get().drafts[documentId])
              }
            }

            set(() => buildLoadedRemoteTreeState(
              remoteTreeByPath,
              remoteSnapshotEntries,
              nextRemoteContentCache,
              snapshotFetchedAt
            ))

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
          if (snapshot.kind === 'path' && snapshot.pathHint) {
            const remoteAddedPath = normalizeGitPath(snapshot.pathHint)
            const folderDeleteChange = findContainingDeleteFolderChange(
              get().stagedChanges,
              get().pendingStructuralChanges,
              remoteAddedPath
            )
            const addDeleteToStaged = folderDeleteChange
              ? get().stagedChanges.some((item) => item.id === folderDeleteChange.id)
              : false
            const folderPath = folderDeleteChange
              ? normalizeGitPath(folderDeleteChange.repoPath)
              : getParentGitPath(remoteAddedPath)
            const nextDeleteChange: StagedGitChange = {
              id: `git-delete-file:${remoteAddedPath}`,
              kind: 'git-delete-file',
              label: getGitFileName(remoteAddedPath),
              repoPath: remoteAddedPath,
              originalContent: snapshot.remoteContent,
              originalSha: snapshot.remoteSha,
              updatedAt: Date.now(),
            }
            const tab = useTabsStore.getState().findTabByFileId(documentId)

            set((state) => {
              const nextDrafts = { ...state.drafts }
              delete nextDrafts[documentId]

              return {
                drafts: nextDrafts,
                stagedChanges: addDeleteToStaged
                  ? [
                      ...state.stagedChanges.filter((item) => !(
                        (item.kind === 'git-draft' && item.documentId === documentId) ||
                        (item.kind === 'git-asset' && folderPath && isGitPathWithinFolder(item.repoPath, folderPath)) ||
                        normalizeGitPath(item.repoPath) === remoteAddedPath
                      )),
                      nextDeleteChange,
                    ]
                  : state.stagedChanges.filter((item) => !(
                    (item.kind === 'git-draft' && item.documentId === documentId) ||
                    (item.kind === 'git-asset' && folderPath && isGitPathWithinFolder(item.repoPath, folderPath))
                  )),
                pendingAssetChanges: state.pendingAssetChanges.filter((item) => !(
                  item.kind === 'git-asset' &&
                  folderPath &&
                  isGitPathWithinFolder(item.repoPath, folderPath)
                )),
                pendingStructuralChanges: addDeleteToStaged
                  ? state.pendingStructuralChanges.filter((item) => normalizeGitPath(item.repoPath) !== remoteAddedPath)
                  : [
                      ...state.pendingStructuralChanges.filter((item) => normalizeGitPath(item.repoPath) !== remoteAddedPath),
                      nextDeleteChange,
                    ],
                currentDocumentId: state.currentDocumentId === documentId ? null : state.currentDocumentId,
              }
            })

            if (tab) {
              useTabsStore.getState().closeTab(tab.id)
            }
            return
          }
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

            // Treat commit as "pull gate -> remote batch commit -> refresh".
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
                  const stagedContent = getRequiredStagedDraftContent(change)
                  const repoPath = normalizeGitPath(change.repoPath || stagedDraft?.path || '')
                  const baseSha = change.baseSha ?? change.originalSha ?? stagedDraft?.sha

                  committedDraftSnapshots.set(change.documentId, {
                    path: repoPath,
                    content: stagedContent,
                  })
                  batchActions.push({
                    kind: 'upsert',
                    path: repoPath,
                    content: stagedContent,
                    encoding: 'text',
                    previousSha: baseSha,
                    isCreate: !baseSha,
                  })
                  continue
                }

                if (change.kind === 'git-asset' && change.contentBase64) {
                  const previousSha = change.baseSha ?? change.originalSha
                  batchActions.push({
                    kind: 'upsert',
                    path: change.repoPath,
                    content: change.contentBase64,
                    encoding: 'base64',
                    previousSha,
                    isCreate: !previousSha,
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
                const stagedContent = getRequiredStagedDraftContent(change)
                const currentPath = normalizeGitPath(change.repoPath || stagedDraft?.path || '')
                const baseContent = change.originalContent ?? stagedDraft?.originalContent ?? ''
                const baseSha = change.baseSha ?? change.originalSha ?? stagedDraft?.sha

                if (!baseSha) {
                  continue
                }

                const remoteFile = await client.getFile(runtimeConfig, currentPath)

                const hasRemoteChange = hasMeaningfulRemoteGitChange(
                  remoteFile.content,
                  baseContent,
                  remoteFile.sha,
                  baseSha
                )
                const hasLocalChange = hasMeaningfulLocalGitChange(
                  stagedContent,
                  baseContent
                )

                if (!hasRemoteChange || !hasLocalChange) {
                  continue
                }

                const mergeResult = mergeGitText(
                  baseContent,
                  stagedContent,
                  remoteFile.content
                )

                if (mergeResult.hasConflicts) {
                  if (!stagedDraft) {
                    set({ error: `Conflict detected: remote file '${currentPath}' changed since last sync` })
                    encounteredConflict = true
                    continue
                  }

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
                          remoteFile.content,
                          remoteFile.sha ?? currentDraft.remoteSha,
                          mergeResult.mergedText
                        ),
                      },
                    }
                  })
                  encounteredConflict = true
                  continue
                }

                const nextContent = mergeResult.mergedText

                if (stagedDraft) {
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
                          status: hasMeaningfulLocalGitChange(nextContent, currentDraft.remoteContent ?? currentDraft.originalContent)
                            ? 'dirty'
                            : 'clean',
                        },
                      },
                    }
                  })
                }

                const actionIndex = batchActions.findIndex((action) => (
                  action.kind === 'upsert' &&
                  normalizeGitPath(action.path) === currentPath
                ))

                if (actionIndex >= 0) {
                  batchActions[actionIndex] = {
                    ...batchActions[actionIndex],
                    content: nextContent,
                    previousSha: remoteFile.sha ?? stagedDraft?.remoteSha ?? baseSha,
                    isCreate: false,
                  }
                }

                committedDraftSnapshots.set(change.documentId, {
                  path: currentPath,
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

                const keepLocalEdits = hasMeaningfulLocalGitChange(currentDraft.draftContent, snapshot.content)
                const nextContent = keepLocalEdits ? currentDraft.draftContent : remoteDraft.content

                nextDrafts[documentId] = {
                  ...clearDraftRemoteTracking(currentDraft),
                  sha: remoteDraft.sha || currentDraft.sha,
                  content: nextContent,
                  originalContent: remoteDraft.content,
                  draftContent: nextContent,
                  isNew: false,
                  renamedFromPath: undefined,
                  renamedFromSha: undefined,
                  fileOrigin: undefined,
                  status: keepLocalEdits ? 'dirty' : 'clean',
                  isDirty: keepLocalEdits,
                  hasConflict: false,
                  conflictSnapshot: undefined,
                  conflictResolvedContent: undefined,
                  lastCheckedAt: Date.now(),
                }
              })

              return {
                drafts: nextDrafts,
                stagedChanges: state.stagedChanges.filter((item) => !committedChangeIds.has(item.id)),
                pendingAssetChanges: state.pendingAssetChanges.filter((item) => !committedChangeIds.has(item.id)),
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

            // Commit success should immediately trigger a metadata-only remote snapshot reload
            // so the worktree baseline reflects the pushed repository state without waiting for
            // the user to manually refresh.
            queueMicrotask(() => {
              void (async () => {
                set({ isLoadingTree: true, isFetchingRemote: true })
                try {
                  const { treeByPath: committedTreeByPath, entriesByPath: committedRemoteSnapshotEntries } =
                    await loadCompleteRemoteTree(client, runtimeConfig)
                  const fetchedAt = Date.now()
                  set((state) => buildLoadedRemoteTreeState(
                    committedTreeByPath,
                    committedRemoteSnapshotEntries,
                    state.remoteContentCache,
                    fetchedAt
                  ))
                } catch (syncError) {
                  const syncMessage = syncError instanceof Error
                    ? syncError.message
                    : 'Failed to refresh repository metadata after commit'
                  set({ error: syncMessage })
                } finally {
                  set({ isLoadingTree: false, isFetchingRemote: false })
                }
              })()
            })

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
            originalContent: normalizedContent,
            draftContent: normalizedContent,
            isDirty: false,
            isNew: true,
            fileOrigin: 'local',
            status: 'clean',
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
          const { config, drafts, treeByPath, remoteSnapshotEntries, pendingStructuralChanges, stagedChanges, pendingAssetChanges } = get()
          const normalizedOld = normalizeGitPath(oldPath)
          const nextPath = normalizeGitPath(newPath)
          const oldDocumentId = buildGitDocumentId(config, normalizedOld)
          const nextDocumentId = buildGitDocumentId(config, nextPath)
          if (!normalizedOld || !nextPath) {
            set({ error: 'Source and target path are required for rename' })
            throw new Error('Source and target path are required for rename')
          }
          if (normalizedOld === nextPath) {
            return
          }

          const isFolderRename =
            Object.prototype.hasOwnProperty.call(treeByPath, normalizedOld) ||
            remoteSnapshotEntries[normalizedOld]?.type === 'dir' ||
            pendingStructuralChanges.some((item) => (
              item.kind === 'git-create-folder' &&
              normalizeGitPath(item.repoPath) === normalizedOld
            )) ||
            stagedChanges.some((item) => (
              item.kind === 'git-create-folder' &&
              normalizeGitPath(item.repoPath) === normalizedOld
            ))

          if (isFolderRename) {
            if (nextPath.startsWith(`${normalizedOld}/`)) {
              set({ error: 'Cannot rename a folder into one of its own descendants' })
              throw new Error('Cannot rename a folder into one of its own descendants')
            }

            const subtreeDrafts = Object.values(drafts).filter((draft) => isGitPathWithinFolder(draft.path, normalizedOld))
            if (subtreeDrafts.some((draft) => draft.hasConflict)) {
              set({ error: 'Resolve all conflicted files inside the folder before renaming it' })
              throw new Error('Resolve all conflicted files inside the folder before renaming it')
            }

            const nestedDeleteIntents = [...stagedChanges, ...pendingStructuralChanges].filter((item) => (
              (item.kind === 'git-delete-file' || item.kind === 'git-delete-folder') &&
              isGitPathWithinFolder(item.repoPath, normalizedOld)
            ))

            const hasRootDeleteIntent = nestedDeleteIntents.some((item) => (
              normalizeGitPath(item.repoPath) === normalizedOld
            ))
            if (hasRootDeleteIntent) {
              set({ error: 'Folder rename is not supported while the folder itself is pending deletion' })
              throw new Error('Folder rename is not supported while the folder itself is pending deletion')
            }

            const nestedDeleteFilePaths = new Set(
              nestedDeleteIntents
                .filter((item) => item.kind === 'git-delete-file')
                .map((item) => normalizeGitPath(item.repoPath))
            )
            const nestedDeleteFolderPaths = nestedDeleteIntents
              .filter((item) => item.kind === 'git-delete-folder')
              .map((item) => normalizeGitPath(item.repoPath))
            const shouldSkipFolderMovePath = (candidatePath: string) => {
              const normalizedCandidatePath = normalizeGitPath(candidatePath)
              if (nestedDeleteFilePaths.has(normalizedCandidatePath)) {
                return true
              }

              return nestedDeleteFolderPaths.some((folderPath) => (
                isGitPathWithinFolder(normalizedCandidatePath, folderPath)
              ))
            }

            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            const remoteFolderExists =
              Object.prototype.hasOwnProperty.call(treeByPath, normalizedOld) ||
              remoteSnapshotEntries[normalizedOld]?.type === 'dir'
            const remoteSubtree = remoteFolderExists
              ? await loadRemoteFolderSubtree(client, runtimeConfig, normalizedOld)
              : { dirPaths: [normalizedOld], fileItems: [] as GitTreeItem[] }
            const movedSubtreeDrafts = subtreeDrafts.filter((draft) => !shouldSkipFolderMovePath(draft.path))
            const localOnlyDrafts = movedSubtreeDrafts.filter((draft) => (
              draft.isNew && !remoteSubtree.fileItems.some((item) => normalizeGitPath(item.path) === normalizeGitPath(draft.path))
            ))
            const movedRemoteDirPaths = remoteSubtree.dirPaths.filter((path) => !shouldSkipFolderMovePath(path))
            const movedRemoteFileItems = remoteSubtree.fileItems.filter((item) => !shouldSkipFolderMovePath(item.path))

            const targetPathsToValidate = new Set<string>([
              nextPath,
              ...movedRemoteDirPaths.map((path) => replaceGitPathPrefix(path, normalizedOld, nextPath)),
              ...movedRemoteFileItems.map((item) => replaceGitPathPrefix(item.path, normalizedOld, nextPath)),
              ...localOnlyDrafts.map((draft) => replaceGitPathPrefix(draft.path, normalizedOld, nextPath)),
              ...pendingAssetChanges
                .filter((item) => (
                  isGitPathWithinFolder(item.repoPath, normalizedOld) &&
                  !shouldSkipFolderMovePath(item.repoPath)
                ))
                .map((item) => replaceGitPathPrefix(item.repoPath, normalizedOld, nextPath)),
            ])

            for (const candidatePath of targetPathsToValidate) {
              if (isFolderRenamePathTaken(
                candidatePath,
                normalizedOld,
                drafts,
                remoteSnapshotEntries,
                stagedChanges,
                pendingAssetChanges,
                pendingStructuralChanges
              )) {
                set({ error: `Target path '${candidatePath}' already exists` })
                throw new Error(`Target path '${candidatePath}' already exists`)
              }
            }

            const fileDraftEntries = await Promise.all(movedRemoteFileItems.map(async (item) => {
              const existingDraft = movedSubtreeDrafts.find((draft) => normalizeGitPath(draft.path) === normalizeGitPath(item.path))
              if (existingDraft) {
                return { sourceDraft: existingDraft, sourcePath: normalizeGitPath(item.path) }
              }

              const remoteFile = await client.getFile(runtimeConfig, normalizeGitPath(item.path))
              return {
                sourceDraft: createGitDraftFromRemoteSource(config, normalizeGitPath(item.path), remoteFile),
                sourcePath: normalizeGitPath(item.path),
              }
            }))

            const renameTimestamp = Date.now()
            const nextDraftEntries = new Map<string, GitDraftFile>()
            const nextDocumentIdByOldDocumentId = new Map<string, string>()
            const oldRemotePaths = new Set<string>()

            for (const { sourceDraft, sourcePath } of fileDraftEntries) {
              const movedDraft = buildRenamedGitDraft(
                config,
                sourceDraft,
                replaceGitPathPrefix(sourcePath, normalizedOld, nextPath)
              )
              nextDraftEntries.set(movedDraft.documentId, movedDraft)
              nextDocumentIdByOldDocumentId.set(sourceDraft.documentId, movedDraft.documentId)
              oldRemotePaths.add(sourcePath)
            }

            for (const draft of localOnlyDrafts) {
              const movedDraft = buildRenamedGitDraft(
                config,
                draft,
                replaceGitPathPrefix(draft.path, normalizedOld, nextPath)
              )
              nextDraftEntries.set(movedDraft.documentId, movedDraft)
              nextDocumentIdByOldDocumentId.set(draft.documentId, movedDraft.documentId)
            }

            const oldLocalDocumentIds = new Set(movedSubtreeDrafts.map((draft) => draft.documentId))
            const oldPathsToDelete = fileDraftEntries
              .filter(({ sourceDraft }) => !sourceDraft.isNew)
              .map(({ sourceDraft, sourcePath }) => ({
                documentId: sourceDraft.documentId,
                path: sourcePath,
                name: sourceDraft.name,
                originalContent: sourceDraft.originalContent,
                originalSha: sourceDraft.sha,
              }))

            set((state) => {
              const nextDrafts = { ...state.drafts }
              oldLocalDocumentIds.forEach((documentId) => {
                delete nextDrafts[documentId]
              })
              nextDraftEntries.forEach((draft, documentId) => {
                nextDrafts[documentId] = draft
              })

              const filteredPendingStructuralChanges = state.pendingStructuralChanges.filter((item) => !(
                item.kind === 'git-create-folder' &&
                isGitPathWithinFolder(item.repoPath, normalizedOld)
              ))

              const renamedCreateFolders = [
                ...state.pendingStructuralChanges,
                ...state.stagedChanges,
              ]
                .filter((item) => (
                  item.kind === 'git-create-folder' &&
                  isGitPathWithinFolder(item.repoPath, normalizedOld) &&
                  !shouldSkipFolderMovePath(item.repoPath)
                ))
                .map((item) => ({
                  ...item,
                  id: `git-create-folder:${replaceGitPathPrefix(item.repoPath, normalizedOld, nextPath)}`,
                  label: getGitFileName(replaceGitPathPrefix(item.repoPath, normalizedOld, nextPath)),
                  repoPath: replaceGitPathPrefix(item.repoPath, normalizedOld, nextPath),
                  updatedAt: renameTimestamp,
                }))

              const deleteFileEntries = oldPathsToDelete.map((entry) => ({
                id: `git-delete-file:${entry.path}`,
                kind: 'git-delete-file' as const,
                label: entry.name,
                repoPath: entry.path,
                documentId: entry.documentId,
                originalContent: entry.originalContent,
                originalSha: entry.originalSha,
                updatedAt: renameTimestamp,
              }))
              const renamedStagedDrafts: StagedGitChange[] = state.stagedChanges
                .filter((item) => item.kind === 'git-draft' && oldLocalDocumentIds.has(item.documentId || ''))
                .flatMap((item) => {
                  const nextDocumentId = nextDocumentIdByOldDocumentId.get(item.documentId || '')
                  const nextDraft = nextDocumentId ? nextDraftEntries.get(nextDocumentId) : undefined
                  if (!nextDocumentId || !nextDraft) {
                    return []
                  }

                  return [{
                    ...item,
                    id: `git-draft:${nextDocumentId}`,
                    documentId: nextDocumentId,
                    repoPath: nextDraft.path,
                    label: nextDraft.name,
                    renamedFromPath: nextDraft.renamedFromPath,
                    renamedFromSha: nextDraft.renamedFromSha,
                    updatedAt: renameTimestamp,
                  }]
                })
              const renamedStagedAssets: StagedGitChange[] = state.stagedChanges
                .filter((item) => (
                  item.kind === 'git-asset' &&
                  isGitPathWithinFolder(item.repoPath, normalizedOld) &&
                  !shouldSkipFolderMovePath(item.repoPath)
                ))
                .map((item) => {
                  const nextRepoPath = replaceGitPathPrefix(item.repoPath, normalizedOld, nextPath)
                  const nextDocumentId = nextDocumentIdByOldDocumentId.get(item.documentId || '') || item.documentId

                  return {
                    ...item,
                    id: `git-asset:${nextDocumentId}:${nextRepoPath}`,
                    repoPath: nextRepoPath,
                    documentId: nextDocumentId,
                    updatedAt: renameTimestamp,
                  }
                })
              const renamedStagedFolders: StagedGitChange[] = state.stagedChanges
                .filter((item) => item.kind === 'git-create-folder' && isGitPathWithinFolder(item.repoPath, normalizedOld))
                .map((item) => ({
                  ...item,
                  id: `git-create-folder:${replaceGitPathPrefix(item.repoPath, normalizedOld, nextPath)}`,
                  label: getGitFileName(replaceGitPathPrefix(item.repoPath, normalizedOld, nextPath)),
                  repoPath: replaceGitPathPrefix(item.repoPath, normalizedOld, nextPath),
                  updatedAt: renameTimestamp,
                }))

              return {
                drafts: nextDrafts,
                stagedChanges: state.stagedChanges
                  .filter((item) => !(
                    oldLocalDocumentIds.has(item.documentId || '') ||
                    (
                      isGitPathWithinFolder(item.repoPath, normalizedOld) &&
                      (item.kind === 'git-draft' || item.kind === 'git-asset' || item.kind === 'git-create-folder') &&
                      !shouldSkipFolderMovePath(item.repoPath)
                    )
                  ))
                  .concat(renamedStagedDrafts)
                  .concat(renamedStagedAssets)
                  .concat(renamedStagedFolders),
                pendingAssetChanges: state.pendingAssetChanges.map((item) => {
                  if (!isGitPathWithinFolder(item.repoPath, normalizedOld)) {
                    return oldLocalDocumentIds.has(item.documentId || '')
                      ? {
                          ...item,
                          documentId: nextDocumentIdByOldDocumentId.get(item.documentId || '') || item.documentId,
                          updatedAt: renameTimestamp,
                        }
                      : item
                  }

                  if (shouldSkipFolderMovePath(item.repoPath)) {
                    return item
                  }

                  return {
                    ...item,
                    id: `git-asset:${nextDocumentIdByOldDocumentId.get(item.documentId || '') || item.documentId}:${replaceGitPathPrefix(item.repoPath, normalizedOld, nextPath)}`,
                    repoPath: replaceGitPathPrefix(item.repoPath, normalizedOld, nextPath),
                    documentId: nextDocumentIdByOldDocumentId.get(item.documentId || '') || item.documentId,
                    updatedAt: renameTimestamp,
                  }
                }),
                pendingStructuralChanges: [
                  ...filteredPendingStructuralChanges,
                  ...renamedCreateFolders,
                  ...deleteFileEntries,
                ],
                expandedPaths: state.expandedPaths
                  .filter((path) => !isGitPathWithinFolder(path, normalizedOld))
                  .concat(
                    state.expandedPaths
                      .filter((path) => isGitPathWithinFolder(path, normalizedOld))
                      .map((path) => replaceGitPathPrefix(path, normalizedOld, nextPath))
                  ),
                currentDocumentId: state.currentDocumentId
                  ? nextDocumentIdByOldDocumentId.get(state.currentDocumentId) || state.currentDocumentId
                  : state.currentDocumentId,
              }
            })

            for (const draft of movedSubtreeDrafts) {
              const existingTab = useTabsStore.getState().findTabByFileId(draft.documentId)
              const nextDocumentId = nextDocumentIdByOldDocumentId.get(draft.documentId)
              const nextDraft = nextDocumentId ? nextDraftEntries.get(nextDocumentId) : undefined
              if (!existingTab || !nextDocumentId || !nextDraft) {
                continue
              }

              const updatedTabId = useTabsStore.getState().openGitFileInTab({
                ...buildGitTabDraftState(nextDraft),
                fileId: draft.documentId,
                content: nextDraft.draftContent,
                savedContent: existingTab.savedContent ?? nextDraft.draftContent,
                isModified: nextDraft.isDirty || existingTab.isModified,
                isNew: nextDraft.isNew,
              })
              useTabsStore.getState().updateTabFileId(updatedTabId, nextDocumentId)
            }

            const nextCurrentDocumentId = get().currentDocumentId
            if (nextCurrentDocumentId) {
              const nextCurrentDraft = get().drafts[nextCurrentDocumentId]
              if (nextCurrentDraft) {
                useDocumentStore.getState().loadDocument(
                  nextCurrentDraft.draftContent,
                  nextCurrentDraft.name,
                  nextCurrentDraft.documentId
                )
              }
            }
            return
          }

          const renameTargetTaken =
            Object.values(drafts).some((item) => normalizeGitPath(item.path) === nextPath) ||
            Object.prototype.hasOwnProperty.call(remoteSnapshotEntries, nextPath) ||
            stagedChanges.some((item) => normalizeGitPath(item.repoPath) === nextPath) ||
            pendingAssetChanges.some((item) => normalizeGitPath(item.repoPath) === nextPath) ||
            pendingStructuralChanges.some((item) => normalizeGitPath(item.repoPath) === nextPath)

          if (renameTargetTaken) {
            set({ error: `Target path '${nextPath}' already exists` })
            throw new Error(`Target path '${nextPath}' already exists`)
          }

          const draft =
            Object.values(drafts).find((item) => item.path === normalizedOld) ||
            await get().openFile(normalizedOld)

          if (draft.hasConflict) {
            set({ error: 'Resolve the file conflict before renaming it' })
            throw new Error('Resolve the file conflict before renaming it')
          }

          const nextDraft = buildRenamedGitDraft(config, draft, nextPath)
          const renameTimestamp = Date.now()
          set((state) => {
            const nextDrafts = { ...state.drafts }
            delete nextDrafts[draft.documentId]
            nextDrafts[nextDocumentId] = nextDraft
            const renamedStagedChanges = state.stagedChanges
              .filter((item) => item.documentId === draft.documentId)
              .map((item) => (
                item.kind === 'git-draft'
                  ? {
                      ...item,
                      id: `git-draft:${nextDocumentId}`,
                      documentId: nextDocumentId,
                      repoPath: nextDraft.path,
                      label: nextDraft.name,
                      renamedFromPath: nextDraft.renamedFromPath,
                      renamedFromSha: nextDraft.renamedFromSha,
                      updatedAt: renameTimestamp,
                    }
                  : item.kind === 'git-asset'
                    ? {
                        ...item,
                        id: `git-asset:${nextDocumentId}:${normalizeGitPath(item.repoPath)}`,
                        documentId: nextDocumentId,
                        repoPath: normalizeGitPath(item.repoPath),
                        updatedAt: renameTimestamp,
                      }
                  : {
                      ...item,
                      documentId: nextDocumentId,
                      updatedAt: renameTimestamp,
                    }
              ))

            const nextPendingStructuralChanges = state.pendingStructuralChanges.filter((item) => !(
              (item.kind === 'git-delete-file' && normalizeGitPath(item.repoPath) === normalizedOld) ||
              normalizeGitPath(item.repoPath) === nextPath
            ))

            if (!draft.isNew) {
              nextPendingStructuralChanges.push({
                id: `git-delete-file:${normalizedOld}`,
                kind: 'git-delete-file',
                label: draft.name,
                repoPath: normalizedOld,
                documentId: oldDocumentId,
                originalContent: draft.originalContent,
                originalSha: draft.sha,
                updatedAt: renameTimestamp,
              })
            }

            return {
              drafts: nextDrafts,
              stagedChanges: state.stagedChanges
                .filter((item) => !(
                  item.documentId === draft.documentId ||
                  normalizeGitPath(item.repoPath) === nextPath
                ))
                .concat(renamedStagedChanges),
              pendingAssetChanges: state.pendingAssetChanges.map((item) => (
                item.kind === 'git-asset' && item.documentId === draft.documentId
                  ? {
                      ...item,
                      id: `git-asset:${nextDocumentId}:${normalizeGitPath(item.repoPath)}`,
                      documentId: nextDocumentId,
                      repoPath: normalizeGitPath(item.repoPath),
                      updatedAt: renameTimestamp,
                    }
                  : item
              )),
              pendingStructuralChanges: nextPendingStructuralChanges,
              currentDocumentId: state.currentDocumentId === draft.documentId ? nextDocumentId : state.currentDocumentId,
            }
          })

          const existingTab = useTabsStore.getState().findTabByFileId(draft.documentId)
          if (existingTab) {
            const updatedTabId = useTabsStore.getState().openGitFileInTab({
              ...buildGitTabDraftState(nextDraft),
              fileId: draft.documentId,
              content: nextDraft.draftContent,
              savedContent: existingTab.savedContent ?? nextDraft.draftContent,
              isModified: nextDraft.isDirty || existingTab.isModified,
              isNew: nextDraft.isNew,
            })
            useTabsStore.getState().updateTabFileId(updatedTabId, nextDocumentId)
          }

          if (get().currentDocumentId === nextDocumentId) {
            useDocumentStore.getState().loadDocument(nextDraft.draftContent, nextDraft.name, nextDraft.documentId)
          }
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
        version: 7,
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
            remoteSnapshotEntries: currentWorkspaceState.remoteSnapshotEntries,
            remoteSnapshotFetchedAt: currentWorkspaceState.remoteSnapshotFetchedAt,
            remoteContentCache: currentWorkspaceState.remoteContentCache,
            workspaceStateByKey: upsertWorkspaceStateForConfig(
              state.workspaceStateByKey,
              state.config,
              currentWorkspaceState
            ),
          }
        },
        onRehydrateStorage: () => (state) => {
          if (!state) return

          const migratedState = migrateGitStorePersistedState(state, 7)
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
            remoteSnapshotEntries: migratedState.remoteSnapshotEntries,
            remoteSnapshotFetchedAt: migratedState.remoteSnapshotFetchedAt,
            baseTreeMap: migratedState.baseTreeMap,
            remoteContentCache: migratedState.remoteContentCache,
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
            remoteSnapshotEntries: restoredWorkspaceState.remoteSnapshotEntries,
            remoteSnapshotFetchedAt: restoredWorkspaceState.remoteSnapshotFetchedAt,
            remoteContentCache: restoredWorkspaceState.remoteContentCache,
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
