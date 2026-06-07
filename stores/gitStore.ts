import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import { getGitProviderClient } from '@/lib/git/providers'
import { createIndexedDbPersistStorage } from '@/lib/git-store-persist-storage'
import type { GitBatchCommitAction, GitBranchRef, GitDraftFile, GitProviderConfig, GitRepoRef, GitTreeItem, StagedGitChange } from '@/lib/git/types'
import { arrayBufferToBase64, buildGitDocumentId, getGitFileName, joinGitPath, normalizeGitPath, parseGitDocumentId } from '@/lib/git/utils'
import { decryptSecret, encryptSecret, normalizeEncryptedSecret } from '@/lib/secret-storage'
import { useFileSystemStore } from './fileSystemStore'
import { useTabsStore } from './tabsStore'

interface GitStore {
  config: GitProviderConfig
  lastConnectedConfigSignature: string | null
  repos: GitRepoRef[]
  branches: GitBranchRef[]
  treeByPath: Record<string, GitTreeItem[]>
  expandedPaths: string[]
  drafts: Record<string, GitDraftFile>
  stagedChanges: StagedGitChange[]
  pendingAssetChanges: StagedGitChange[]
  currentDocumentId: string | null
  workspaceStateByKey: Record<string, GitWorkspaceState>
  isConnecting: boolean
  isLoadingTree: boolean
  isCommitting: boolean
  isFetchingRemote: boolean
  error: string | null
  connected: boolean
  lastFetchedAt: number | null
  setConfig: (updates: Partial<GitProviderConfig>) => void
  getDecryptedToken: () => string
  clearError: () => void
  validateAndLoad: () => Promise<void>
  loadRepos: () => Promise<void>
  loadBranches: () => Promise<void>
  loadTree: (path?: string) => Promise<void>
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
  uploadAsset: (documentId: string, file: File) => Promise<{ repoPath: string; draftPath: string }>
  refreshCurrentFile: () => Promise<void>
  fetchRemoteFile: (documentId?: string) => Promise<GitDraftFile | null>
  syncRemoteStatus: () => Promise<void>
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
  currentDocumentId: string | null
  expandedPaths: string[]
}

type GitStorePersistedState = {
  config: GitProviderConfig
  lastConnectedConfigSignature: string | null
  connected: boolean
  drafts: Record<string, GitDraftFile>
  stagedChanges: StagedGitChange[]
  pendingAssetChanges: StagedGitChange[]
  currentDocumentId: string | null
  expandedPaths: string[]
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

function appendOptimisticChildForPath(
  itemMap: Map<string, GitTreeItem>,
  currentPath: string,
  targetPath: string,
  leafType: GitTreeItem['type']
) {
  const normalizedCurrentPath = normalizeGitPath(currentPath)
  const normalizedTargetPath = normalizeGitPath(targetPath)

  if (!normalizedTargetPath || normalizedTargetPath === normalizedCurrentPath) {
    return
  }

  if (normalizedCurrentPath && !normalizedTargetPath.startsWith(`${normalizedCurrentPath}/`)) {
    return
  }

  const relativePath = normalizedCurrentPath
    ? normalizedTargetPath.slice(normalizedCurrentPath.length + 1)
    : normalizedTargetPath
  if (!relativePath) {
    return
  }

  const [childName, ...restSegments] = relativePath.split('/')
  if (!childName) {
    return
  }

  const childPath = normalizedCurrentPath ? joinGitPath(normalizedCurrentPath, childName) : childName
  itemMap.set(childPath, {
    path: childPath,
    name: childName,
    type: restSegments.length > 0 ? 'dir' : leafType,
  })
}

function buildTreeItemsForPath(
  state: Pick<GitStore, 'drafts' | 'stagedChanges'>,
  path: string,
  remoteItems: GitTreeItem[] = []
) {
  const normalizedPath = normalizeGitPath(path)
  const itemMap = new Map<string, GitTreeItem>()

  remoteItems
    .filter((item) => item.name !== '.gitkeep')
    .forEach((item) => {
      itemMap.set(normalizeGitPath(item.path), item)
    })

  Object.values(state.drafts).forEach((draft) => {
    if (!draft.isNew) {
      return
    }

    appendOptimisticChildForPath(itemMap, normalizedPath, draft.path, 'file')
  })

  state.stagedChanges.forEach((change) => {
    if (change.kind === 'git-create-folder') {
      appendOptimisticChildForPath(itemMap, normalizedPath, change.repoPath, 'dir')
    }
  })

  const deletedPaths = new Set(
    state.stagedChanges
      .filter((change) => change.kind === 'git-delete-file' || change.kind === 'git-delete-folder')
      .map((change) => normalizeGitPath(change.repoPath))
  )

  deletedPaths.forEach((deletedPath) => {
    itemMap.delete(deletedPath)
  })

  return sortGitTreeItems(Array.from(itemMap.values()))
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
  return input as Record<string, GitDraftFile>
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

function sanitizePersistedExpandedPaths(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.filter((item): item is string => typeof item === 'string')
}

function createEmptyGitWorkspaceState(): GitWorkspaceState {
  return {
    drafts: {},
    stagedChanges: [],
    pendingAssetChanges: [],
    currentDocumentId: null,
    expandedPaths: [],
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
    currentDocumentId,
    expandedPaths: sanitizePersistedExpandedPaths(state.expandedPaths),
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

function captureGitWorkspaceState(state: Pick<GitStore, 'drafts' | 'stagedChanges' | 'pendingAssetChanges' | 'currentDocumentId' | 'expandedPaths'>): GitWorkspaceState {
  return {
    drafts: state.drafts,
    stagedChanges: state.stagedChanges,
    pendingAssetChanges: state.pendingAssetChanges,
    currentDocumentId:
      state.currentDocumentId && state.drafts[state.currentDocumentId]
        ? state.currentDocumentId
        : null,
    expandedPaths: state.expandedPaths,
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
  state: Pick<GitStore, 'config' | 'drafts' | 'stagedChanges' | 'pendingAssetChanges' | 'currentDocumentId' | 'expandedPaths' | 'workspaceStateByKey'>,
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
    currentDocumentId: state.currentDocumentId,
    expandedPaths: state.expandedPaths,
  })
  const migratedWorkspaceStateByKey = fromVersion < 3
    ? upsertWorkspaceStateForConfig(normalizedWorkspaceStateByKey, normalizedConfig, legacyWorkspaceState)
    : normalizedWorkspaceStateByKey
  const currentWorkspaceState = buildGitWorkspaceKey(normalizedConfig)
    ? getWorkspaceStateForConfig(migratedWorkspaceStateByKey, normalizedConfig)
    : legacyWorkspaceState

  // v1 only persisted connection config. v2 adds a single global Git workspace.
  // v3 buckets Git workspace state by provider + owner/namespace + repo + branch.
  if (fromVersion < 2) {
    return {
      config: normalizedConfig,
      lastConnectedConfigSignature: state.lastConnectedConfigSignature || null,
      connected: state.connected === true,
      drafts: currentWorkspaceState.drafts,
      stagedChanges: currentWorkspaceState.stagedChanges,
      pendingAssetChanges: currentWorkspaceState.pendingAssetChanges,
      currentDocumentId: currentWorkspaceState.currentDocumentId,
      expandedPaths: currentWorkspaceState.expandedPaths,
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
    currentDocumentId: currentWorkspaceState.currentDocumentId,
    expandedPaths: currentWorkspaceState.expandedPaths,
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
        expandedPaths: [],
        drafts: {},
        stagedChanges: [],
        pendingAssetChanges: [],
        currentDocumentId: null,
        workspaceStateByKey: {},
        isConnecting: false,
        isLoadingTree: false,
        isCommitting: false,
        isFetchingRemote: false,
        error: null,
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
              currentDocumentId: nextWorkspace.currentDocumentId,
              connected: configChanged ? false : state.connected,
              repos: configChanged ? [] : state.repos,
              branches: configChanged ? [] : state.branches,
              treeByPath: configChanged ? {} : state.treeByPath,
              expandedPaths: nextWorkspace.expandedPaths,
            }
          })
        },

        getDecryptedToken: () => decryptSecret(get().config.token),

        clearError: () => set({ error: null }),

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
                workspaceStateByKey: nextWorkspace.workspaceStateByKey,
                drafts: nextWorkspace.drafts,
                stagedChanges: nextWorkspace.stagedChanges,
                pendingAssetChanges: nextWorkspace.pendingAssetChanges,
                currentDocumentId: nextWorkspace.currentDocumentId,
                expandedPaths: nextWorkspace.expandedPaths,
              }
            })
            await get().loadTree('')
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
                [normalizedPath]: buildTreeItemsForPath(state, normalizedPath, items),
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
            remoteContent: file.content,
            remoteSha: file.sha,
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
              currentDocumentId: documentId,
              expandedPaths: nextWorkspace.expandedPaths,
              branches: workspaceChanged ? [] : state.branches,
              treeByPath: workspaceChanged ? {} : state.treeByPath,
            }
          })
        },

        updateDraftContent: (documentId, content) => {
          set((state) => {
            const draft = state.drafts[documentId]
            if (!draft) return state
            const nextDraft: GitDraftFile = {
              ...draft,
              content,
              draftContent: content,
              isDirty: content !== draft.originalContent,
            }
            return {
              drafts: {
                ...state.drafts,
                [documentId]: nextDraft,
              },
              stagedChanges: state.stagedChanges.filter((item) => {
                if (item.kind !== 'git-asset' || item.documentId !== documentId) {
                  return true
                }

                return draftReferencesRepoPath(draft.path, content, item.repoPath)
              }),
              pendingAssetChanges: state.pendingAssetChanges.filter((item) => {
                if (item.kind !== 'git-asset' || item.documentId !== documentId) {
                  return true
                }

                return draftReferencesRepoPath(draft.path, content, item.repoPath)
              }),
            }
          })

          const nextDraft = get().drafts[documentId]
          if (nextDraft && (nextDraft.isDirty || nextDraft.isNew)) {
            get().stageGitDraft(documentId)
          } else {
            const stagedItem = get().stagedChanges.find((item) => item.kind === 'git-draft' && item.documentId === documentId)
            if (stagedItem) {
              get().unstageChange(stagedItem.id)
            }
          }
        },

        stageGitDraft: (documentId) => {
          set((state) => {
            const draft = state.drafts[documentId]
            if (!draft || (!draft.isDirty && !draft.isNew)) return state

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
          const file = useFileSystemStore.getState().files.find((item) => item.id === fileId)
          if (!file) return

          const normalizedRepoPath = normalizeGitPath(repoPath)
          set((state) => {
            const existing = state.stagedChanges.find((item) => item.kind === 'local-file' && item.localFileId === fileId)
            const nextChange: StagedGitChange = {
              id: existing?.id || `local-file:${fileId}`,
              kind: 'local-file',
              label: file.name,
              repoPath: normalizedRepoPath,
              localFileId: fileId,
              localFileName: file.name,
              updatedAt: Date.now(),
            }

            return {
              stagedChanges: existing
                ? state.stagedChanges.map((item) => item.id === existing.id ? nextChange : item)
                : [...state.stagedChanges, nextChange],
            }
          })
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
                treeByPath: {
                  ...state.treeByPath,
                  [getParentGitPath(normalizedPath)]: (state.treeByPath[getParentGitPath(normalizedPath)] || [])
                    .filter((item) => normalizeGitPath(item.path) !== normalizedPath),
                },
                currentDocumentId: state.currentDocumentId === existingDraft.documentId ? null : state.currentDocumentId,
              }
            })
            return
          }

          set((state) => ({
            drafts: {
              ...state.drafts,
              [existingDraft.documentId]: {
                ...existingDraft,
                isDirty: true,
              },
            },
            stagedChanges: [
              ...state.stagedChanges.filter((item) => !(
                (item.kind === 'git-draft' && item.documentId === existingDraft.documentId) ||
                (item.kind === 'git-delete-file' && item.repoPath === normalizedPath)
              )),
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

          const parentPath = normalizedPath.split('/').slice(0, -1).join('/')
          set((state) => ({
            treeByPath: {
              ...state.treeByPath,
              [normalizeGitPath(parentPath)]: (state.treeByPath[normalizeGitPath(parentPath)] || [])
                .filter((item) => normalizeGitPath(item.path) !== normalizedPath),
            },
            currentDocumentId: state.currentDocumentId === existingDraft.documentId ? null : state.currentDocumentId,
          }))
        },

        stageDeletedGitFolder: async (path) => {
          const normalizedPath = normalizeGitPath(path)
          const localCreatedFolder = get().stagedChanges.find((item) => item.kind === 'git-create-folder' && normalizeGitPath(item.repoPath) === normalizedPath)
          if (localCreatedFolder) {
            const folderItems = buildTreeItemsForPath(get(), normalizedPath, get().treeByPath[normalizedPath] || [])
            const nonPlaceholder = folderItems.filter((item) => item.name !== '.gitkeep')
            if (nonPlaceholder.length > 0) {
              throw new Error('Folder is not empty')
            }

            get().unstageChange(localCreatedFolder.id)
            return
          }

          const existing = get().treeByPath[normalizedPath]
          if (!existing) {
            await get().loadTree(normalizedPath)
          }

          const folderItems = get().treeByPath[normalizedPath] || []
          const nonPlaceholder = folderItems.filter((item) => item.name !== '.gitkeep')
          if (nonPlaceholder.length > 0) {
            throw new Error('Folder is not empty')
          }

          set((state) => {
            const parentPath = normalizeGitPath(normalizedPath.split('/').slice(0, -1).join('/'))
            const parentItems = state.treeByPath[parentPath] || []

            return {
              treeByPath: {
                ...state.treeByPath,
                [parentPath]: parentItems.filter((item) => normalizeGitPath(item.path) !== normalizedPath),
              },
              stagedChanges: [
                ...state.stagedChanges.filter((item) => !(item.kind === 'git-delete-folder' && item.repoPath === normalizedPath)),
                {
                  id: `git-delete-folder:${normalizedPath}`,
                  kind: 'git-delete-folder',
                  label: getGitFileName(normalizedPath),
                  repoPath: normalizedPath,
                  updatedAt: Date.now(),
                },
              ],
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
              drafts?: Record<string, GitDraftFile>
              treeByPath?: Record<string, GitTreeItem[]>
              currentDocumentId?: string | null
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

            if (change.kind === 'git-delete-file' && change.documentId && change.originalContent !== undefined) {
              const restoredDraft = state.drafts[change.documentId]
              if (restoredDraft) {
                nextState.drafts = {
                  ...state.drafts,
                  [change.documentId]: {
                    ...restoredDraft,
                    originalContent: change.originalContent,
                    draftContent: change.originalContent,
                    content: change.originalContent,
                    sha: change.originalSha,
                    isDirty: false,
                  },
                }
              }
            }

            if (change.kind === 'git-create-folder') {
              const folderPath = normalizeGitPath(change.repoPath)
              const hasLocalChildren =
                Object.values(state.drafts).some((draft) => draft.isNew && draft.path.startsWith(`${folderPath}/`)) ||
                state.stagedChanges.some((item) => item.id !== change.id && normalizeGitPath(item.repoPath).startsWith(`${folderPath}/`))

              if (!hasLocalChildren) {
                nextState.treeByPath = {
                  ...state.treeByPath,
                  [getParentGitPath(folderPath)]: (state.treeByPath[getParentGitPath(folderPath)] || [])
                    .filter((item) => normalizeGitPath(item.path) !== folderPath),
                }
              }
            }

            return nextState
          })

          if (change.kind === 'git-delete-file') {
            void get().loadTree(change.repoPath.split('/').slice(0, -1).join('/'))
          }

          if (change.kind === 'git-delete-folder') {
            void get().loadTree(change.repoPath.split('/').slice(0, -1).join('/'))
          }
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
            stagedChanges: [
              ...state.stagedChanges.filter((item) => item.id !== `git-asset:${documentId}:${repoPath}`),
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
            pendingAssetChanges: state.pendingAssetChanges.filter((item) => item.id !== `git-asset:${documentId}:${repoPath}`),
          }))

          return { repoPath, draftPath: normalizedDraftPath }
        },

        refreshCurrentFile: async () => {
          const { currentDocumentId, drafts } = get()
          if (!currentDocumentId || !drafts[currentDocumentId]) return
          await get().openFile(drafts[currentDocumentId].path)
        },

        fetchRemoteFile: async (documentId) => {
          const targetDocumentId = documentId || get().currentDocumentId
          if (!targetDocumentId) return null

          const { config, drafts } = get()
          const draft = drafts[targetDocumentId]
          if (!draft) return null
          if (draft.isNew) {
            return draft
          }

          set({ isFetchingRemote: true, error: null })
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            const remoteFile = await client.getFile(runtimeConfig, draft.path)
            const checkedAt = Date.now()

            let nextDraft: GitDraftFile | null = null
            set((state) => {
              const currentDraft = state.drafts[targetDocumentId]
              if (!currentDraft) return state

              const remoteChanged = remoteFile.sha !== currentDraft.sha || remoteFile.content !== currentDraft.originalContent
              const preserveLocalDraft = currentDraft.isDirty

              nextDraft = {
                ...currentDraft,
                name: remoteFile.name || currentDraft.name,
                remoteSha: remoteFile.sha,
                remoteContent: remoteFile.content,
                lastCheckedAt: checkedAt,
                hasRemoteUpdates: remoteChanged,
                hasConflict: remoteChanged && preserveLocalDraft,
                ...(preserveLocalDraft
                  ? {}
                  : {
                      sha: remoteFile.sha,
                      content: remoteFile.content,
                      originalContent: remoteFile.content,
                      draftContent: remoteFile.content,
                      isDirty: false,
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
          await get().fetchRemoteFile(currentDocumentId)
        },

        commitCurrentFile: async (message) => {
          const { currentDocumentId, drafts, config, stagedChanges } = get()
          const draft = currentDocumentId ? drafts[currentDocumentId] : null
          if (!message.trim()) throw new Error('Commit message is required')
          if (!stagedChanges.length && !draft) throw new Error('No Git file is currently open')

          set({ isCommitting: true, error: null })
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            if (!client.commitBatch) {
              throw new Error('Current Git provider does not support atomic batch commits')
            }

            const batchActions: GitBatchCommitAction[] = []
            const committedChangeIds = new Set(stagedChanges.map((item) => item.id))
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

            if (!batchActions.length) {
              throw new Error('No staged changes to commit')
            }

            await client.commitBatch(runtimeConfig, message.trim(), batchActions)

            const refreshedDrafts = new Map<string, { sha?: string; content: string }>()
            for (const [documentId, snapshot] of committedDraftSnapshots) {
              const remoteFile = await client.getFile(runtimeConfig, snapshot.path)
              refreshedDrafts.set(documentId, {
                sha: remoteFile.sha,
                content: remoteFile.content,
              })
            }

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
                  remoteContent: remoteDraft.content,
                  remoteSha: remoteDraft.sha || currentDraft.remoteSha,
                  isDirty: keepLocalEdits,
                  hasRemoteUpdates: false,
                  hasConflict: false,
                  lastCheckedAt: Date.now(),
                }
              })

              return {
                drafts: nextDrafts,
                stagedChanges: state.stagedChanges.filter((item) => {
                  if (!committedChangeIds.has(item.id)) {
                    return true
                  }

                  if (item.kind === 'git-draft' && item.documentId) {
                    return !!nextDrafts[item.documentId]?.isDirty
                  }

                  return false
                }),
                currentDocumentId:
                  state.currentDocumentId && deletedDocumentIds.has(state.currentDocumentId)
                    ? null
                    : state.currentDocumentId,
                lastFetchedAt: Date.now(),
              }
            })
            await get().loadTree('')
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to commit file'
            const lowerMessage = message.toLowerCase()
            const looksLikeConflict =
              lowerMessage.includes('conflict') ||
              lowerMessage.includes('sha') ||
                lowerMessage.includes('outdated') ||
                lowerMessage.includes('does not match') ||
                lowerMessage.includes('failed to update') ||
                lowerMessage.includes('already exists') ||
                lowerMessage.includes('last_commit_id') ||
                lowerMessage.includes('fast forward')

            if (looksLikeConflict) {
              if (!draft) {
                set({ error: message })
                throw error
              }

              set((state) => {
                const currentDraft = state.drafts[draft.documentId]
                if (!currentDraft) {
                  return { error: message }
                }
                return {
                  error: message,
                  drafts: {
                    ...state.drafts,
                    [draft.documentId]: {
                      ...currentDraft,
                      hasConflict: true,
                      hasRemoteUpdates: true,
                    },
                  },
                }
              })

              try {
                await get().fetchRemoteFile(draft.documentId)
              } catch {
                // keep local draft even if remote refresh fails
              }
            } else {
              set({ error: message })
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
            stagedChanges: [
              ...state.stagedChanges.filter((item) => !(item.kind === 'git-draft' && item.documentId === documentId)),
              {
                id: `git-draft:${documentId}`,
                kind: 'git-draft',
                label: nextDraft.name,
                repoPath: normalizedPath,
                documentId,
                updatedAt: Date.now(),
              },
            ],
            currentDocumentId: documentId,
            treeByPath: ensureTreePath(state.treeByPath, normalizedPath, 'file'),
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
            const existing = state.stagedChanges.find((item) => item.kind === 'git-create-folder' && normalizeGitPath(item.repoPath) === normalizedPath)
            return {
              stagedChanges: existing
                ? state.stagedChanges
                : [
                    ...state.stagedChanges,
                    {
                      id: `git-create-folder:${normalizedPath}`,
                      kind: 'git-create-folder',
                      label: getGitFileName(normalizedPath),
                      repoPath: normalizedPath,
                      updatedAt: Date.now(),
                    },
                  ],
              treeByPath: ensureTreePath(state.treeByPath, normalizedPath, 'dir'),
            }
          })
        },

        deleteFolder: async (path) => {
          await get().stageDeletedGitFolder(path)
        },
      }),
      {
        name: 'git-store-v1',
        version: 3,
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

          const migratedState = migrateGitStorePersistedState(state, 3)
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
            currentDocumentId: migratedState.currentDocumentId,
            expandedPaths: migratedState.expandedPaths,
          })
          const restoredWorkspaceState = buildGitWorkspaceKey(normalizedConfig)
            ? getWorkspaceStateForConfig(restoredWorkspaceStateByKey, normalizedConfig)
            : fallbackWorkspaceState
          const lastConnectedConfigSignature = state.lastConnectedConfigSignature || null
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
            connected: shouldRestoreConnection,
            workspaceStateByKey: upsertWorkspaceStateForConfig(
              restoredWorkspaceStateByKey,
              normalizedConfig,
              restoredWorkspaceState
            ),
            drafts: restoredWorkspaceState.drafts,
            stagedChanges: restoredWorkspaceState.stagedChanges,
            pendingAssetChanges: restoredWorkspaceState.pendingAssetChanges,
            currentDocumentId: restoredWorkspaceState.currentDocumentId,
            expandedPaths: restoredWorkspaceState.expandedPaths,
          }))

          if (!shouldRestoreConnection) return

          queueMicrotask(() => {
            void useGitStore.getState().validateAndLoad().catch(() => {
              // Keep startup silent here; store state is updated by validateAndLoad.
            })

            const { currentDocumentId } = useGitStore.getState()
            if (currentDocumentId) {
              void useGitStore.getState().fetchRemoteFile(currentDocumentId).catch(() => {
                // Keep startup silent here; local draft remains authoritative until user refreshes manually.
              })
            }
          })
        },
      }
    ),
    { name: 'GitStore' }
  )
)
