import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { getGitProviderClient } from '@/lib/git/providers'
import type { GitBranchRef, GitDraftFile, GitProviderConfig, GitRepoRef, GitTreeItem } from '@/lib/git/types'
import { buildGitDocumentId, getGitFileName, normalizeGitPath } from '@/lib/git/utils'
import { decryptSecret, encryptSecret, normalizeEncryptedSecret } from '@/lib/secret-storage'

interface GitStore {
  config: GitProviderConfig
  repos: GitRepoRef[]
  branches: GitBranchRef[]
  treeByPath: Record<string, GitTreeItem[]>
  expandedPaths: string[]
  drafts: Record<string, GitDraftFile>
  currentDocumentId: string | null
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
  refreshCurrentFile: () => Promise<void>
  fetchRemoteFile: (documentId?: string) => Promise<GitDraftFile | null>
  syncRemoteStatus: () => Promise<void>
  commitCurrentFile: (message: string) => Promise<void>
  createFile: (path: string, content: string, message: string) => Promise<void>
  renameFile: (oldPath: string, newPath: string, message: string) => Promise<void>
  deleteFile: (path: string, message: string) => Promise<void>
  createFolder: (path: string, message: string) => Promise<void>
  deleteFolder: (path: string, message: string) => Promise<void>
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

export const useGitStore = create<GitStore>()(
  devtools(
    persist(
      (set, get) => ({
        config: DEFAULT_CONFIG,
        repos: [],
        branches: [],
        treeByPath: {},
        expandedPaths: [],
        drafts: {},
        currentDocumentId: null,
        isConnecting: false,
        isLoadingTree: false,
        isCommitting: false,
        isFetchingRemote: false,
        error: null,
        connected: false,
        lastFetchedAt: null,

        setConfig: (updates) => {
          set((state) => ({
            config: {
              ...state.config,
              ...updates,
              token: updates.token !== undefined ? encryptSecret(updates.token) : state.config.token,
            },
          }))
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
            set((state) => ({
              branches,
              config: { ...state.config, branch: nextBranch },
              connected: true,
            }))
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
                [normalizedPath]: items.sort((a, b) => {
                  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
                  return a.name.localeCompare(b.name)
                }),
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
          const runtimeConfig = toRuntimeConfig(config)
          const client = getGitProviderClient(runtimeConfig)
          const normalizedPath = normalizeGitPath(path)
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
          set({ currentDocumentId: documentId })
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
            }
          })
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
          const { currentDocumentId, drafts, config } = get()
          const draft = currentDocumentId ? drafts[currentDocumentId] : null
          if (!draft) throw new Error('No Git file is currently open')
          if (!message.trim()) throw new Error('Commit message is required')

          set({ isCommitting: true, error: null })
          try {
            const runtimeConfig = toRuntimeConfig(config)
            const client = getGitProviderClient(runtimeConfig)
            const result = await client.createOrUpdateFile(
              runtimeConfig,
              draft.path,
              draft.draftContent,
              message.trim(),
              draft.sha
            )
            set((state) => ({
              drafts: {
                ...state.drafts,
                [draft.documentId]: {
                  ...draft,
                  sha: result.sha || draft.sha,
                  content: draft.draftContent,
                  originalContent: draft.draftContent,
                  remoteContent: draft.draftContent,
                  remoteSha: result.sha || draft.sha,
                  isDirty: false,
                  hasRemoteUpdates: false,
                  hasConflict: false,
                  lastCheckedAt: Date.now(),
                },
              },
              lastFetchedAt: Date.now(),
            }))
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
              lowerMessage.includes('last_commit_id')

            if (looksLikeConflict) {
              set((state) => {
                const currentDraft = draft ? state.drafts[draft.documentId] : null
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
          const runtimeConfig = toRuntimeConfig(config)
          const client = getGitProviderClient(runtimeConfig)
          await client.createOrUpdateFile(runtimeConfig, normalizeGitPath(path), content, message)
          await get().loadTree('')
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
              currentDocumentId: state.currentDocumentId === draft.documentId ? nextDocumentId : state.currentDocumentId,
            }
          })
          await get().loadTree('')
        },

        deleteFile: async (path, message) => {
          const { config, drafts, currentDocumentId } = get()
          const runtimeConfig = toRuntimeConfig(config)
          const client = getGitProviderClient(runtimeConfig)
          const normalizedPath = normalizeGitPath(path)
          const draft = Object.values(drafts).find((item) => item.path === normalizedPath) || null
          await client.deleteFile(runtimeConfig, normalizedPath, message, draft?.sha)
          set((state) => {
            const nextDrafts = { ...state.drafts }
            if (draft) delete nextDrafts[draft.documentId]
            return {
              drafts: nextDrafts,
              currentDocumentId: currentDocumentId === draft?.documentId ? null : currentDocumentId,
            }
          })
          await get().loadTree('')
        },

        createFolder: async (path, message) => {
          const { config } = get()
          const runtimeConfig = toRuntimeConfig(config)
          const client = getGitProviderClient(runtimeConfig)
          await client.createFolder(runtimeConfig, normalizeGitPath(path), message)
          await get().loadTree('')
        },

        deleteFolder: async (path, message) => {
          const { config } = get()
          const runtimeConfig = toRuntimeConfig(config)
          const client = getGitProviderClient(runtimeConfig)
          await client.deleteFolder(runtimeConfig, normalizeGitPath(path), message)
          await get().loadTree('')
        },
      }),
      {
        name: 'git-store-v1',
        partialize: (state) => ({
          config: state.config,
        }),
        onRehydrateStorage: () => (state) => {
          if (!state) return
          const token = state.config?.token || ''
          if (!token) return
          useGitStore.setState((currentState) => ({
            config: {
              ...currentState.config,
              token: normalizeEncryptedSecret(token),
            },
          }))
        },
      }
    ),
    { name: 'GitStore' }
  )
)
