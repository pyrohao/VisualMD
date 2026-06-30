'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  File,
  FilePlus2,
  FileText,
  FolderGit2,
  FolderPlus,
  GitBranch,
  ImageIcon,
  Loader2,
  Music,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Video,
} from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useGitStore } from '@/stores/gitStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useTabsStore } from '@/stores/tabsStore'
import { requestNavigationWithUnsavedGuard } from '@/stores/unsavedChangesStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { inferGitFileKind, inferGitFileMimeType, isGitBinaryFileKind } from '@/lib/git/file-kind'
import { buildGitDocumentId, getGitFileName, joinGitPath, normalizeGitPath } from '@/lib/git/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PromptDialog } from '@/components/ui/prompt-dialog'
import { ThemedDeleteDialog } from '@/components/ui/themed-delete-dialog'
import { toast } from '@/hooks/use-toast'
import type { GitTreeItem, StagedGitChange } from '@/lib/git/types'

type DialogState =
  | { type: 'create-file'; path: string }
  | { type: 'create-folder'; path: string }
  | { type: 'rename'; path: string }
  | null

type DeleteDialogState =
  | { type: 'delete-file'; path: string }
  | { type: 'delete-folder'; path: string }
  | null

function GitTreeNode({
  path = '',
  depth = 0,
  treeByPath,
  expandedPaths,
  currentPath,
  onToggle,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDeleteFile,
  onDeleteFolder,
  themeConfig,
  t,
}: {
  path?: string
  depth?: number
  treeByPath: Record<string, GitTreeItem[]>
  expandedPaths: string[]
  currentPath: string | null
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onRename: (path: string) => void
  onDeleteFile: (path: string) => void
  onDeleteFolder: (path: string) => void
  themeConfig: typeof themeConfigs.light
  t: (key: string) => string
}) {
  const items = treeByPath[path] || []

  const renderFileIcon = (itemPath: string) => {
    const fileKind = inferGitFileKind(itemPath)

    if (fileKind === 'image') {
      return <ImageIcon className="h-4 w-4 shrink-0" style={{ color: themeConfig.primary }} />
    }

    if (fileKind === 'audio') {
      return <Music className="h-4 w-4 shrink-0" style={{ color: themeConfig.primary }} />
    }

    if (fileKind === 'video') {
      return <Video className="h-4 w-4 shrink-0" style={{ color: themeConfig.primary }} />
    }

    if (fileKind === 'pdf' || fileKind === 'binary') {
      return <File className="h-4 w-4 shrink-0" style={{ color: themeConfig.muted }} />
    }

    return <FileText className="h-4 w-4 shrink-0" style={{ color: themeConfig.muted }} />
  }

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const normalizedPath = normalizeGitPath(item.path)
        const isDir = item.type === 'dir'
        const isExpanded = expandedPaths.includes(normalizedPath)
        const isActive = currentPath === normalizedPath

        return (
          <div key={normalizedPath} className="space-y-1">
            <div
              className="group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors"
              style={{
                marginLeft: depth * 12,
                backgroundColor: isActive ? `${themeConfig.primary}12` : 'transparent',
                color: isActive ? themeConfig.primary : themeConfig.text,
              }}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => {
                  if (isDir) {
                    onToggle(normalizedPath)
                  } else {
                    onOpenFile(normalizedPath)
                  }
                }}
              >
                {isDir ? (
                  isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                {isDir ? (
                  <FolderGit2 className="h-4 w-4 shrink-0" style={{ color: themeConfig.primary }} />
                ) : (
                  renderFileIcon(normalizedPath)
                )}
                <span className="min-w-0 truncate text-sm">{item.name}</span>
              </button>

              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {isDir ? (
                  <>
                    <button
                      type="button"
                      className="rounded p-1 transition-colors"
                      style={{ color: themeConfig.text }}
                      onClick={() => onCreateFile(normalizedPath)}
                      title={t('git.createFile')}
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 transition-colors"
                      style={{ color: themeConfig.text }}
                      onClick={() => onCreateFolder(normalizedPath)}
                      title={t('git.createFolder')}
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 transition-colors"
                      style={{ color: themeConfig.text }}
                      onClick={() => onRename(normalizedPath)}
                      title={t('file.rename')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 transition-colors"
                      style={{ color: themeConfig.danger }}
                      onClick={() => onDeleteFolder(normalizedPath)}
                      title={t('file.deleteFolder')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rounded p-1 transition-colors"
                      style={{ color: themeConfig.text }}
                      onClick={() => onRename(normalizedPath)}
                      title={t('file.rename')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 transition-colors"
                      style={{ color: themeConfig.danger }}
                      onClick={() => onDeleteFile(normalizedPath)}
                      title={t('file.deleteFile')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {isDir && isExpanded ? (
              <GitTreeNode
                path={normalizedPath}
                depth={depth + 1}
                treeByPath={treeByPath}
                expandedPaths={expandedPaths}
                currentPath={currentPath}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
                onCreateFile={onCreateFile}
                onCreateFolder={onCreateFolder}
                onRename={onRename}
                onDeleteFile={onDeleteFile}
                onDeleteFolder={onDeleteFolder}
                themeConfig={themeConfig}
                t={t}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function getStagedChangeLabel(change: StagedGitChange, t: (key: string) => string) {
  if (change.kind === 'git-delete-file') return t('git.stagedDeleteFile').replace('{name}', change.label)
  if (change.kind === 'git-delete-folder') return t('git.stagedDeleteFolder').replace('{name}', change.label)
  if (change.kind === 'git-create-folder') return `${t('git.createFolder')}: ${change.label}`
  return change.label
}

export function GitPanel() {
  const { getThemeConfig } = useThemeStore()
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [deleteDialogState, setDeleteDialogState] = useState<DeleteDialogState>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  const { setActivePanel } = useSidebarStore()
  const { loadDocument } = useDocumentStore()
  const { openGitFileInTab, openFileInTab, getActiveTab, activeTabId, closeTab } = useTabsStore()
  const {
    config,
    treeByPath,
    expandedPaths,
    drafts,
    stagedChanges,
    pendingAssetChanges,
    currentDocumentId,
    isConnecting,
    isLoadingTree,
    isCommitting,
    error,
    connected,
    lastFetchedAt,
    clearError,
    validateAndLoad,
    loadTree,
    toggleExpandedPath,
    openFile,
    setCurrentDocumentId,
    stageGitDraft,
    unstageChange,
    restagePendingAsset,
    syncRemoteStatus,
    fetchRemoteFile,
    commitCurrentFile,
    createFile,
    renameFile,
    deleteFile,
    createFolder,
    deleteFolder,
  } = useGitStore()

  const activeTab = getActiveTab()
  const currentDraft = currentDocumentId ? drafts[currentDocumentId] : null
  const currentPath = currentDraft?.path || activeTab?.gitMeta?.path || null
  const stagedCurrentDraftChange = currentDraft
    ? stagedChanges.find((item) => item.kind === 'git-draft' && item.documentId === currentDraft.documentId)
    : null
  const stagedChangeIdSet = useMemo(() => new Set(stagedChanges.map((item) => item.id)), [stagedChanges])
  const canStageCurrentDraft = Boolean(currentDraft && (currentDraft.isDirty || currentDraft.isNew) && !stagedCurrentDraftChange)
  const pendingDraft = canStageCurrentDraft ? currentDraft : null
  const currentDraftPendingAssets = currentDraft
    ? pendingAssetChanges.filter((item) => (
      item.kind === 'git-asset' &&
      item.documentId === currentDraft.documentId &&
      !stagedChangeIdSet.has(item.id)
    ))
    : []
  const hasPendingStageItems = Boolean(pendingDraft) || currentDraftPendingAssets.length > 0
  const hasCommitCandidates = Boolean(currentDraft?.isDirty) || stagedChanges.length > 0
  const pendingSummary = useMemo(() => {
    if (pendingDraft) {
      return `${pendingDraft.path} - ${t('git.uncommitted')}`
    }
    if (currentDraftPendingAssets.length) {
      return t('git.stagedCount').replace('{count}', String(currentDraftPendingAssets.length))
    }
    return t('git.noStagedChanges')
  }, [currentDraftPendingAssets.length, pendingDraft, t])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!connected || !currentDocumentId) return

    const timer = window.setInterval(() => {
      void syncRemoteStatus()
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [connected, currentDocumentId, syncRemoteStatus])

  useEffect(() => {
    if (!connected || isConnecting || isLoadingTree) return
    if (Object.prototype.hasOwnProperty.call(treeByPath, '')) return

    void loadTree('').catch(() => {
      // handled by store
    })
  }, [connected, isConnecting, isLoadingTree, loadTree, treeByPath])

  useEffect(() => {
    if (!error) return

    toast({
      title: t('common.error'),
      description: error,
      variant: 'destructive',
    })
    clearError()
  }, [clearError, error, t])

  const openDraftInTab = (documentId: string, content?: string) => {
    const draft = drafts[documentId]
    if (!draft) return

    const draftContent = content ?? draft.draftContent
    openGitFileInTab({
      fileName: draft.name,
      content: draftContent,
      savedContent: draftContent,
      isModified: false,
      isNew: false,
      fileId: draft.documentId,
      sourceType: 'git',
      gitMeta: {
        provider: draft.provider,
        ownerOrNamespace: draft.ownerOrNamespace,
        repo: draft.repo,
        branch: draft.branch,
        path: draft.path,
        sha: draft.sha,
        fileKind: 'text',
      },
    })
    setCurrentDocumentId(draft.documentId)
    loadDocument(draftContent, draft.name, draft.documentId)
  }

  const handleOpenFile = async (path: string) => {
    await requestNavigationWithUnsavedGuard(async () => {
      const normalizedPath = normalizeGitPath(path)
      const fileKind = inferGitFileKind(normalizedPath)

      if (isGitBinaryFileKind(fileKind)) {
        openGitFileInTab({
          fileName: getGitFileName(normalizedPath),
          content: '',
          savedContent: '',
          isModified: false,
          isNew: false,
          fileId: buildGitDocumentId(config, normalizedPath),
          sourceType: 'git',
          gitMeta: {
            provider: config.provider,
            ownerOrNamespace: config.ownerOrNamespace,
            repo: config.repo,
            branch: config.branch,
            path: normalizedPath,
            fileKind,
            mimeType: inferGitFileMimeType(normalizedPath),
          },
        })
        setCurrentDocumentId(null)
        return
      }

      const draft = await openFile(path)
      openDraftInTab(buildGitDocumentId(config, draft.path))
    }, getGitFileName(path))
  }

  const handleConnect = async () => {
    try {
      await validateAndLoad()
      toast({ title: t('git.connected') })
    } catch {
      // handled by store
    }
  }

  const handleCommit = async () => {
    if (!commitMessage.trim() || !hasCommitCandidates) return

    try {
      const activeTab = getActiveTab()
      const activeDocumentId = currentDraft?.documentId || (activeTab?.sourceType === 'git' ? activeTab.fileId : null)

      await commitCurrentFile(commitMessage.trim())

      if (activeDocumentId) {
        const latestDraft = useGitStore.getState().drafts[activeDocumentId]
        const latestActiveTab = useTabsStore.getState().getActiveTab()

        if (latestDraft && latestActiveTab?.fileId === activeDocumentId) {
          useTabsStore.getState().updateTabContent(latestActiveTab.id, latestDraft.draftContent)
          useTabsStore.getState().markTabAsSaved(latestActiveTab.id, latestDraft.name)
          loadDocument(latestDraft.draftContent, latestDraft.name, latestDraft.documentId)
        }
      }

      setCommitMessage('')
      toast({ title: t('git.commitSuccess') })
    } catch {
      // handled by store
    }
  }

  const handleRefreshTree = async () => {
    try {
      await loadTree('')

      if (currentDocumentId) {
        const refreshedDraft = await fetchRemoteFile(currentDocumentId)
        const latestActiveTab = useTabsStore.getState().getActiveTab()

        if (refreshedDraft && latestActiveTab?.fileId === currentDocumentId) {
          useTabsStore.getState().updateTabContent(latestActiveTab.id, refreshedDraft.draftContent)
          if (refreshedDraft.isDirty || refreshedDraft.isNew) {
            useTabsStore.getState().markTabAsModified(latestActiveTab.id, true)
          } else {
            useTabsStore.getState().markTabAsSaved(latestActiveTab.id, refreshedDraft.name)
          }
          loadDocument(refreshedDraft.draftContent, refreshedDraft.name, refreshedDraft.documentId)
        }
      }

      toast({
        title: t('git.refreshTree'),
        description: t('git.reposLoaded'),
      })
    } catch {
      // handled by store
    }
  }

  const handleOpenStagedChange = async (changeId: string) => {
    const change = stagedChanges.find((item) => item.id === changeId)
    if (!change) return

    if (change.kind === 'git-draft' && change.documentId) {
      await requestNavigationWithUnsavedGuard(() => {
        openDraftInTab(change.documentId!)
      }, change.label)
      return
    }

    if (change.kind === 'git-delete-file' && change.documentId) {
      await requestNavigationWithUnsavedGuard(() => {
        openDraftInTab(change.documentId!, change.originalContent)
      }, change.label)
      return
    }

    if (change.kind === 'local-file' && change.localFileId) {
      const file = useFileSystemStore.getState().files.find((item) => item.id === change.localFileId)
      if (!file) return
      await requestNavigationWithUnsavedGuard(() => {
        useFileSystemStore.getState().openFile(change.localFileId!)
        openFileInTab(file.name, file.content, change.localFileId)
        loadDocument(file.content, file.name, change.localFileId)
      }, file.name)
      return
    }

    if (change.kind === 'git-create-folder') {
      await toggleExpandedPath(change.repoPath)
    }
  }

  const handleUnstageChange = (changeId: string) => {
    const change = stagedChanges.find((item) => item.id === changeId)
    if (!change) return

    unstageChange(changeId)

    if (change.kind !== 'git-delete-file' || !change.documentId) {
      return
    }

    const activeTab = useTabsStore.getState().getActiveTab()
    if (activeTab?.fileId !== change.documentId) {
      return
    }

    const restoredDraft = useGitStore.getState().drafts[change.documentId]
    if (!restoredDraft) {
      return
    }

    openDraftInTab(change.documentId)
    useTabsStore.getState().markTabAsSaved(useTabsStore.getState().activeTabId || activeTab.id, restoredDraft.name)
  }

  const handleStageCurrentDraft = () => {
    if (!currentDraft?.documentId) return
    stageGitDraft(currentDraft.documentId)
    toast({ title: t('git.stagedToGit') })
  }

  const handleRestagePendingAsset = (changeId: string) => {
    restagePendingAsset(changeId)
    toast({ title: t('git.stagedToGit') })
  }

  const handlePromptConfirm = async (value: string) => {
    if (!dialogState) return

    const input = value.trim()

    try {
      if (dialogState.type === 'create-file') {
        const nextPath = normalizeGitPath(joinGitPath(dialogState.path, input || 'new-file.md'))
        await createFile(nextPath, '', `Create ${nextPath}`)
        await handleOpenFile(nextPath)
      }

      if (dialogState.type === 'create-folder') {
        const nextPath = normalizeGitPath(joinGitPath(dialogState.path, input || 'new-folder'))
        await createFolder(nextPath, `Create folder ${nextPath}`)
        await loadTree(dialogState.path)
      }

      if (dialogState.type === 'rename') {
        const targetName = input || getGitFileName(dialogState.path)
        const parentPath = normalizeGitPath(dialogState.path.split('/').slice(0, -1).join('/'))
        const nextPath = normalizeGitPath(joinGitPath(parentPath, targetName))
        const previousPath = normalizeGitPath(dialogState.path)
        const previousDocumentId = buildGitDocumentId(config, previousPath)
        const nextDocumentId = buildGitDocumentId(config, nextPath)

        await renameFile(previousPath, nextPath, `Rename ${previousPath} to ${nextPath}`)

        const activeTab = getActiveTab()
        if (activeTab?.fileId === previousDocumentId) {
          const renamedDraft = useGitStore.getState().drafts[nextDocumentId]
          if (renamedDraft) {
            openDraftInTab(nextDocumentId)
          }
        }
      }

      setDialogState(null)
    } catch {
      // handled by store
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteDialogState) return

    try {
      if (deleteDialogState.type === 'delete-file') {
        const targetPath = normalizeGitPath(deleteDialogState.path)
        const documentId = buildGitDocumentId(config, targetPath)
        const activeTab = getActiveTab()

        await deleteFile(targetPath)

        if (activeTab?.fileId === documentId && activeTabId) {
          closeTab(activeTabId)
          setCurrentDocumentId(null)
        }
      }

      if (deleteDialogState.type === 'delete-folder') {
        const targetPath = normalizeGitPath(deleteDialogState.path)
        await deleteFolder(targetPath)
      }
    } catch {
      // handled by store
    } finally {
      setDeleteDialogState(null)
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: themeConfig.border }}>
        <GitBranch className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
        <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
          {t('sidebar.git')}
        </h2>
      </div>

      <div className="space-y-4 overflow-y-auto p-4">
        <div
          className="space-y-3 rounded-lg border p-3"
          style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="break-all text-sm font-medium" style={{ color: themeConfig.text }}>
                {connected ? `${config.ownerOrNamespace}/${config.repo}` : t('git.notConnected')}
              </div>
              <div className="text-xs" style={{ color: themeConfig.muted }}>
                {config.provider.toUpperCase()}
                {config.branch ? ` - ${config.branch}` : ''}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setActivePanel('settings')}
              className="w-full justify-center"
              style={{
                borderColor: themeConfig.border,
                color: themeConfig.text,
                backgroundColor: themeConfig.background,
              }}
            >
              {t('settings.openGitSettings')}
            </Button>
          </div>

          <Button
            onClick={handleConnect}
            className="w-full"
            disabled={isConnecting}
            style={{
              backgroundColor: themeConfig.primary,
              color: themeConfig.buttonText || '#fff',
            }}
          >
            {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
            {connected ? t('git.reconnect') : t('git.connect')}
          </Button>
        </div>

        <div
          className="space-y-3 rounded-lg border p-3"
          style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium" style={{ color: themeConfig.text }}>
                {t('git.repositoryTree')}
              </div>
              <div className="truncate text-xs" style={{ color: themeConfig.muted }}>
                {connected ? `${config.ownerOrNamespace}/${config.repo}@${config.branch}` : t('git.notConnected')}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                style={{ borderColor: themeConfig.border, color: themeConfig.text, backgroundColor: themeConfig.background }}
                onClick={() => setDialogState({ type: 'create-file', path: '' })}
                title={t('git.createFile')}
              >
                <FilePlus2 className="h-4 w-4" />
              </button>

              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                style={{ borderColor: themeConfig.border, color: themeConfig.text, backgroundColor: themeConfig.background }}
                onClick={() => setDialogState({ type: 'create-folder', path: '' })}
                title={t('git.createFolder')}
              >
                <FolderPlus className="h-4 w-4" />
              </button>

              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                style={{ borderColor: themeConfig.border, color: themeConfig.text, backgroundColor: themeConfig.background }}
                onClick={() => void handleRefreshTree()}
                title={t('git.refreshTree')}
              >
                {isLoadingTree ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>

            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto rounded-md border p-2" style={{ borderColor: themeConfig.border }}>
            {treeByPath['']?.length ? (
              <GitTreeNode
                treeByPath={treeByPath}
                expandedPaths={expandedPaths}
                currentPath={currentPath}
                onToggle={(path) => void toggleExpandedPath(path)}
                onOpenFile={(path) => void handleOpenFile(path)}
                onCreateFile={(path) => setDialogState({ type: 'create-file', path })}
                onCreateFolder={(path) => setDialogState({ type: 'create-folder', path })}
                onRename={(path) => setDialogState({ type: 'rename', path })}
                onDeleteFile={(path) => setDeleteDialogState({ type: 'delete-file', path })}
                onDeleteFolder={(path) => setDeleteDialogState({ type: 'delete-folder', path })}
                themeConfig={themeConfig}
                t={t}
              />
            ) : (
              <div className="py-8 text-center text-sm" style={{ color: themeConfig.muted }}>
                {connected ? t('git.emptyRepoTree') : t('git.connectFirst')}
              </div>
            )}
          </div>
        </div>

        <div
          className="space-y-3 rounded-lg border p-3"
          style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
        >
          <div>
            <div className="text-sm font-medium" style={{ color: themeConfig.text }}>
              {t('git.stageChanges')}
            </div>
            <div className="text-xs" style={{ color: themeConfig.muted }}>
              {stagedChanges.length
                ? t('git.stagedCount').replace('{count}', String(stagedChanges.length))
                : t('git.noStagedChanges')}
            </div>
          </div>

          <div className="max-h-[180px] space-y-2 overflow-y-auto rounded-md border p-2" style={{ borderColor: themeConfig.border }}>
            {stagedChanges.length ? stagedChanges.map((change) => (
              <div
                key={change.id}
                className="flex items-center gap-2 rounded-md border px-2 py-2"
                style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.background }}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => void handleOpenStagedChange(change.id)}
                >
                  <div className="truncate text-sm" style={{ color: themeConfig.text }}>
                    {getStagedChangeLabel(change, t)}
                  </div>
                  <div className="truncate text-[11px]" style={{ color: themeConfig.muted }}>
                    {change.repoPath}
                  </div>
                </button>
                <button
                  type="button"
                  className="rounded p-1 transition-colors"
                  style={{ color: themeConfig.primary }}
                  onClick={() => handleUnstageChange(change.id)}
                  title={t('git.unstage')}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            )) : (
              <div className="py-6 text-center text-sm" style={{ color: themeConfig.muted }}>
                {t('git.noStagedChanges')}
              </div>
            )}
          </div>

          <div>
            <div className="text-sm font-medium" style={{ color: themeConfig.text }}>
              {t('git.pendingChanges')}
            </div>
            <div className="text-xs" style={{ color: themeConfig.muted }}>
              {pendingSummary}
            </div>
          </div>

          <div className="max-h-[180px] space-y-2 overflow-y-auto rounded-md border p-2" style={{ borderColor: themeConfig.border }}>
            {pendingDraft ? (
              <div
                className="flex items-center gap-2 rounded-md border px-2 py-2"
                style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.background }}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => void handleOpenFile(pendingDraft.path)}
                >
                  <div className="truncate text-sm" style={{ color: themeConfig.text }}>
                    {pendingDraft.name}
                  </div>
                  <div className="truncate text-[11px]" style={{ color: themeConfig.muted }}>
                    {pendingDraft.path}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handleStageCurrentDraft}
                  className="rounded p-1 transition-colors"
                  style={{ color: themeConfig.primary }}
                  title={t('git.stageConfirm')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {currentDraftPendingAssets.map((change) => (
              <div
                key={change.id}
                className="flex items-center gap-2 rounded-md border px-2 py-2"
                style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.background }}
              >
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm" style={{ color: themeConfig.text }}>
                    {change.label}
                  </div>
                  <div className="truncate text-[11px]" style={{ color: themeConfig.muted }}>
                    {change.repoPath}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestagePendingAsset(change.id)}
                  className="rounded p-1 transition-colors"
                  style={{ color: themeConfig.primary }}
                  title={t('git.stageConfirm')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {!hasPendingStageItems ? (
              <div className="py-6 text-center text-sm" style={{ color: themeConfig.muted }}>
                {t('git.noStagedChanges')}
              </div>
            ) : null}
          </div>

          {currentDraft?.hasConflict ? (
            <div
              className="flex items-start gap-2 rounded-md border px-3 py-2 text-xs"
              style={{
                borderColor: `${themeConfig.danger}40`,
                backgroundColor: `${themeConfig.danger}10`,
                color: themeConfig.danger,
              }}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t('git.conflictDetected')} - {t('git.localChangesPreserved')}</span>
            </div>
          ) : null}

          {currentDraft?.lastCheckedAt ? (
            <div className="text-[11px]" style={{ color: themeConfig.muted }}>
              {t('git.lastFetched')}: {new Date(lastFetchedAt || currentDraft.lastCheckedAt).toLocaleString()}
            </div>
          ) : null}

          <Input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder={t('git.commitMessagePlaceholder')}
            style={{
              backgroundColor: themeConfig.background,
              borderColor: themeConfig.border,
              color: themeConfig.text,
            }}
          />

          <Button
            onClick={handleCommit}
            disabled={!hasCommitCandidates || !commitMessage.trim() || isCommitting}
            className="w-full"
            style={{
              backgroundColor:
                hasCommitCandidates && commitMessage.trim() && !isCommitting
                  ? themeConfig.primary
                  : themeConfig.border,
              color:
                hasCommitCandidates && commitMessage.trim() && !isCommitting
                  ? themeConfig.buttonText || '#fff'
                  : themeConfig.muted,
            }}
          >
            {isCommitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t('git.commitToRepo')}
          </Button>
        </div>
      </div>

      <PromptDialog
        isOpen={!!dialogState}
        onClose={() => setDialogState(null)}
        onConfirm={(value) => void handlePromptConfirm(value)}
        title={
          dialogState?.type === 'create-file'
            ? t('git.createFile')
            : dialogState?.type === 'create-folder'
              ? t('git.createFolder')
              : dialogState?.type === 'rename'
                ? t('file.rename')
                : t('common.confirm')
        }
        description={
          dialogState?.type === 'rename'
            ? `${t('git.enterNewPath')} ${dialogState.path}`
            : dialogState?.path
              ? `${t('git.targetDirectory')}: ${dialogState.path}`
              : t('git.targetDirectoryRoot')
        }
        defaultValue={
          dialogState?.type === 'rename'
            ? getGitFileName(dialogState.path)
            : dialogState?.type === 'create-file'
              ? 'new-file.md'
              : 'new-folder'
        }
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
      />

      <ThemedDeleteDialog
        isOpen={!!deleteDialogState}
        onClose={() => setDeleteDialogState(null)}
        onConfirm={() => void handleDeleteConfirm()}
        title={deleteDialogState?.type === 'delete-file' ? t('file.deleteFile') : t('file.deleteFolder')}
        description={deleteDialogState ? `${t('common.confirm')} ${deleteDialogState.path}` : ''}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />
    </div>
  )
}

export default GitPanel
