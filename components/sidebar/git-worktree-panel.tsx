'use client'

import { useEffect, useMemo, useState } from 'react'
import {
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
  Settings2,
  Trash2,
  Video,
} from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useGitStore } from '@/stores/gitStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { requestNavigationWithUnsavedGuard } from '@/stores/unsavedChangesStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTabsStore } from '@/stores/tabsStore'
import { inferGitFileKind, inferGitFileMimeType, isGitBinaryFileKind } from '@/lib/git/file-kind'
import { findGitRemoteDraftsWithUnstagedContent } from '@/lib/git/pull-guards'
import { buildGitTabDraftState } from '@/lib/git/tab-state'
import { getGitWorktreeStatusBadge, getGitWorktreeStatusTitle } from '@/lib/git/worktree-status-display'
import { buildGitWorktreeView, hasGitRemoteSnapshotPath, type GitWorktreeStatus } from '@/lib/git/worktree'
import { buildGitDocumentId, getGitFileName, joinGitPath, normalizeGitPath } from '@/lib/git/utils'
import { createDefaultMarkdownDocumentContent, ensureMarkdownExtension, generateUniqueItemName } from '@/lib/workspace-item-utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PromptDialog } from '@/components/ui/prompt-dialog'
import { ThemedDeleteDialog } from '@/components/ui/themed-delete-dialog'
import { toast } from '@/hooks/use-toast'
import type { GitTreeItem } from '@/lib/git/types'

type DialogState =
  | { type: 'create-file'; path: string }
  | { type: 'create-folder'; path: string }
  | { type: 'rename'; path: string }
  | null

type DeleteDialogState =
  | { type: 'delete-file'; path: string }
  | { type: 'delete-folder'; path: string }
  | null

type RefreshGuardDialogState =
  | { kind: 'conflict'; paths: string[] }
  | { kind: 'unstaged-remote'; paths: string[] }
  | null

function renderGitFileIcon(itemPath: string, themeConfig: typeof themeConfigs.light) {
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

function getStatusColor(status: GitWorktreeStatus | undefined, themeConfig: typeof themeConfigs.light) {
  if (status?.worktree === 'deleted' || status?.index === 'deleted') return themeConfig.danger
  if (status?.worktree === 'untracked' || status?.index === 'added') return themeConfig.primary
  if (status?.worktree === 'modified' || status?.index === 'modified') return themeConfig.text
  return themeConfig.text
}

function getStatusBadge(status: GitWorktreeStatus | undefined) {
  return getGitWorktreeStatusBadge(status)
}

function hasLocalOverlayStatus(status: GitWorktreeStatus | undefined) {
  return Boolean(status?.index || status?.worktree)
}

function hasEditableDraftStatus(status: GitWorktreeStatus | undefined) {
  return Boolean(
    status?.worktree === 'untracked' ||
    status?.worktree === 'modified' ||
    status?.index === 'added' ||
    status?.index === 'modified'
  )
}

function isDeletedStatus(status: GitWorktreeStatus | undefined) {
  return status?.index === 'deleted' || status?.worktree === 'deleted'
}

function isModifiedStatus(status: GitWorktreeStatus | undefined) {
  return status?.worktree === 'modified' || status?.index === 'modified'
}

function isUntrackedStatus(status: GitWorktreeStatus | undefined) {
  return status?.worktree === 'untracked'
}

function isAddedStatus(status: GitWorktreeStatus | undefined) {
  return status?.index === 'added'
}

function getStatusTitle(status: GitWorktreeStatus | undefined) {
  return getGitWorktreeStatusTitle(status)
}

function getStatusTextDecoration(status: GitWorktreeStatus | undefined) {
  return isDeletedStatus(status) ? 'line-through' : 'none'
}

function getStatusFontStyle(status: GitWorktreeStatus | undefined) {
  return isDeletedStatus(status) ? 'italic' : 'normal'
}

function isStagedDirectoryOnly(status: GitWorktreeStatus | undefined) {
  return status?.index === 'added' && !status?.worktree
}

function isRemoteMissingLocalPath(status: GitWorktreeStatus | undefined) {
  return status?.index === 'added' || status?.worktree === 'untracked'
}

function shouldAutoExpandLocalDirectory(status: GitWorktreeStatus | undefined) {
  return isStagedDirectoryOnly(status) || isUntrackedStatus(status)
}

function isLocalDraftPreferred(status: GitWorktreeStatus | undefined) {
  return hasEditableDraftStatus(status)
}

function shouldUseLocalWhenRemoteMissing(status: GitWorktreeStatus | undefined) {
  return isRemoteMissingLocalPath(status)
}

function shouldColorAsModified(status: GitWorktreeStatus | undefined) {
  return isModifiedStatus(status)
}

function shouldColorAsAdded(status: GitWorktreeStatus | undefined) {
  return isAddedStatus(status) || isUntrackedStatus(status)
}

function hasAnyDisplayedStatus(status: GitWorktreeStatus | undefined) {
  return hasLocalOverlayStatus(status)
}

function getStatusLabel(status: GitWorktreeStatus | undefined) {
  const badge = getStatusBadge(status)
  return badge
}

function getDirectoryStatusLabel(status: GitWorktreeStatus | undefined) {
  if (!hasAnyDisplayedStatus(status)) {
    return null
  }

  return '•'
}

function getDirectoryStatusTitle(t: (key: string) => string, status: GitWorktreeStatus | undefined) {
  if (!hasAnyDisplayedStatus(status)) {
    return null
  }

  return t('git.folderHasUncommittedChanges')
}

function getNodeColor(status: GitWorktreeStatus | undefined, themeConfig: typeof themeConfigs.light) {
  if (shouldColorAsAdded(status)) return themeConfig.primary
  if (shouldColorAsModified(status)) return themeConfig.text
  if (isDeletedStatus(status)) return themeConfig.danger
  return null
}

function formatRefreshSuccessDescription(
  t: (key: string) => string,
  result: { addedPaths: string[]; deletedPaths: string[]; updatedPaths: string[] }
) {
  const added = result.addedPaths.length
  const updated = result.updatedPaths.length
  const deleted = result.deletedPaths.length

  if (!added && !updated && !deleted) {
    return t('git.refreshSuccessNoChanges')
  }

  return t('git.refreshSuccessChanged')
    .replace('{added}', String(added))
    .replace('{updated}', String(updated))
    .replace('{deleted}', String(deleted))
}

function GitWorktreeNode({
  path = '',
  depth = 0,
  treeByPath,
  statusByPath,
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
  statusByPath: Record<string, GitWorktreeStatus>
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

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const normalizedPath = normalizeGitPath(item.path)
        const isDir = item.type === 'dir'
        const isExpanded = expandedPaths.includes(normalizedPath)
        const isActive = currentPath === normalizedPath
        const status = statusByPath[normalizedPath]
        const statusBadge = isDir ? getDirectoryStatusLabel(status) : getStatusLabel(status)
        const statusTitle = isDir ? getDirectoryStatusTitle(t, status) : getStatusTitle(status)
        const itemColor = getNodeColor(status, themeConfig) || getStatusColor(status, themeConfig)

        return (
          <div key={normalizedPath} className="space-y-1">
            <div
              className="group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors"
              style={{
                marginLeft: depth * 12,
                backgroundColor: isActive ? `${themeConfig.primary}12` : 'transparent',
                color: isActive ? themeConfig.primary : itemColor,
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
                  <FolderGit2 className="h-4 w-4 shrink-0" style={{ color: itemColor }} />
                ) : (
                  renderGitFileIcon(normalizedPath, themeConfig)
                )}
                <span
                  className="min-w-0 truncate text-sm"
                  style={{
                    color: itemColor,
                    textDecoration: getStatusTextDecoration(status),
                    fontStyle: getStatusFontStyle(status),
                  }}
                >
                  {item.name}
                </span>
              </button>

              <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                {hasAnyDisplayedStatus(status) && statusBadge ? (
                  <span
                    className="w-6 shrink-0 whitespace-pre text-right font-mono text-[11px] font-medium leading-none"
                    style={{ color: itemColor }}
                    title={statusTitle || undefined}
                    aria-label={statusTitle || undefined}
                    aria-live="polite"
                  >
                    {statusBadge}
                  </span>
                ) : null}
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
            </div>

            {isDir && isExpanded ? (
              <GitWorktreeNode
                path={normalizedPath}
                depth={depth + 1}
                treeByPath={treeByPath}
                statusByPath={statusByPath}
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

export function GitWorktreePanel() {
  const { getThemeConfig } = useThemeStore()
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [deleteDialogState, setDeleteDialogState] = useState<DeleteDialogState>(null)
  const [refreshGuardDialogState, setRefreshGuardDialogState] = useState<RefreshGuardDialogState>(null)
  const [isRefreshingRepository, setIsRefreshingRepository] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  const { setActivePanel } = useSidebarStore()
  const { loadDocument } = useDocumentStore()
  const { openGitFileInTab, getActiveTab, activeTabId, closeTab } = useTabsStore()
  const {
    config,
    treeByPath,
    remoteSnapshotEntries,
    expandedPaths,
    drafts,
    stagedChanges,
    pendingAssetChanges,
    pendingStructuralChanges,
    currentDocumentId,
    connected,
    isConnecting,
    isLoadingTree,
    isFetchingRemote,
    error,
    clearError,
    openFile,
    refreshRepositoryFromRemote,
    toggleExpandedPath,
    setCurrentDocumentId,
    createFile,
    renameFile,
    deleteFile,
    createFolder,
    deleteFolder,
  } = useGitStore()

  const activeTab = getActiveTab()
  const currentDraft = currentDocumentId ? drafts[currentDocumentId] : null
  const currentPath = currentDraft?.path || activeTab?.gitMeta?.path || null
  const worktreeView = useMemo(() => buildGitWorktreeView({
    treeByPath,
    remoteSnapshotEntries,
    drafts,
    pendingAssetChanges,
    pendingStructuralChanges,
    stagedChanges,
  }), [drafts, pendingAssetChanges, pendingStructuralChanges, remoteSnapshotEntries, stagedChanges, treeByPath])

  useEffect(() => {
    setMounted(true)
  }, [])

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
    const draft = useGitStore.getState().drafts[documentId]
    if (!draft) return

    const draftContent = content ?? draft.draftContent
    openGitFileInTab({
      ...buildGitTabDraftState(draft),
      content: draftContent,
      savedContent: draftContent,
    })
    setCurrentDocumentId(draft.documentId)
    loadDocument(draftContent, draft.name, draft.documentId)
  }

  const handleOpenFile = async (path: string) => {
    await requestNavigationWithUnsavedGuard(async () => {
      const normalizedPath = normalizeGitPath(path)
      const fileKind = inferGitFileKind(normalizedPath)
      const draftDocumentId = buildGitDocumentId(config, normalizedPath)
      const localDraft = Object.values(useGitStore.getState().drafts).find((draft) => (
        normalizeGitPath(draft.path) === normalizedPath
      ))
      const worktreeStatus = worktreeView.statusByPath[normalizedPath]
      const existsRemotely = hasGitRemoteSnapshotPath(remoteSnapshotEntries, normalizedPath, 'file')

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

      if (localDraft && (
        localDraft.isNew ||
        localDraft.isDirty ||
        isLocalDraftPreferred(worktreeStatus)
      )) {
        openDraftInTab(localDraft.documentId)
        return
      }

      if (!existsRemotely && shouldUseLocalWhenRemoteMissing(worktreeStatus)) {
        if (localDraft) {
          openDraftInTab(localDraft.documentId)
          return
        }

        toast({
          title: t('common.error'),
          description: t('git.localWorktreeFileUnavailable'),
          variant: 'destructive',
        })
        return
      }

      const draft = await openFile(path)
      openDraftInTab(buildGitDocumentId(config, draft.path))
    }, getGitFileName(path))
  }

  const handleRefreshTree = async () => {
    if (isRefreshingRepository || isLoadingTree || isFetchingRemote) {
      return
    }

    const conflictedDraftPaths = Object.values(drafts)
      .filter((draft) => draft.hasConflict)
      .map((draft) => normalizeGitPath(draft.path))

    if (conflictedDraftPaths.length > 0) {
      setRefreshGuardDialogState({ kind: 'conflict', paths: conflictedDraftPaths })
      return
    }

    const remoteDraftPathsWithUnstagedContent = findGitRemoteDraftsWithUnstagedContent({
      drafts,
      stagedChanges,
    })
    if (remoteDraftPathsWithUnstagedContent.length > 0) {
      setRefreshGuardDialogState({
        kind: 'unstaged-remote',
        paths: remoteDraftPathsWithUnstagedContent,
      })
      return
    }

    try {
      setIsRefreshingRepository(true)
      const result = await refreshRepositoryFromRemote()
      const hasChanges = result.addedPaths.length > 0 || result.updatedPaths.length > 0 || result.deletedPaths.length > 0
      toast({
        title: hasChanges ? t('git.remoteUpdated') : t('git.remoteUpToDate'),
        description: formatRefreshSuccessDescription(t, result),
      })
    } catch {
      // handled by store error state + toast effect
    } finally {
      setIsRefreshingRepository(false)
    }
  }

  const handleTogglePath = async (path: string) => {
    const normalizedPath = normalizeGitPath(path)
    const isExpanded = expandedPaths.includes(normalizedPath)

    if (isExpanded) {
      useGitStore.setState((state) => ({
        expandedPaths: state.expandedPaths.filter((item) => item !== normalizedPath),
      }))
      return
    }

    const hasRemoteTreeNode = hasGitRemoteSnapshotPath(remoteSnapshotEntries, normalizedPath, 'dir')
    const hasWorktreeNode = Object.prototype.hasOwnProperty.call(worktreeView.treeByPath, normalizedPath)
    const worktreeStatus = worktreeView.statusByPath[normalizedPath]

    if (!hasRemoteTreeNode && hasWorktreeNode) {
      useGitStore.setState((state) => ({
        expandedPaths: [...state.expandedPaths, normalizedPath],
      }))
      return
    }

    await toggleExpandedPath(normalizedPath)
  }

  const handlePromptConfirm = async (value: string) => {
    if (!dialogState) return
    const input = value.trim()

    try {
      if (dialogState.type === 'create-file') {
        const targetDirectory = normalizeGitPath(dialogState.path)
        const siblingNames = (worktreeView.treeByPath[targetDirectory] || [])
          .filter((item) => item.type === 'file')
          .map((item) => item.name)
        const nextFileName = generateUniqueItemName(
          siblingNames,
          ensureMarkdownExtension(input || 'new-file.md'),
          { extensionMode: 'markdown' }
        )
        const nextPath = normalizeGitPath(joinGitPath(targetDirectory, nextFileName))
        await createFile(
          nextPath,
          createDefaultMarkdownDocumentContent(nextFileName),
          `Create ${nextPath}`
        )
        await handleOpenFile(nextPath)
      }

      if (dialogState.type === 'create-folder') {
        const targetDirectory = normalizeGitPath(dialogState.path)
        const siblingNames = (worktreeView.treeByPath[targetDirectory] || [])
          .filter((item) => item.type === 'dir')
          .map((item) => item.name)
        const nextFolderName = generateUniqueItemName(
          siblingNames,
          input || 'new-folder'
        )
        const nextPath = normalizeGitPath(joinGitPath(targetDirectory, nextFolderName))
        await createFolder(nextPath, `Create folder ${nextPath}`)
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
        const remainingDraft = useGitStore.getState().drafts[documentId]
        if (!remainingDraft && activeTab?.fileId === documentId && activeTabId) {
          closeTab(activeTabId)
          setCurrentDocumentId(null)
        }
      }

      if (deleteDialogState.type === 'delete-folder') {
        await deleteFolder(normalizeGitPath(deleteDialogState.path))
      }
    } catch {
      // handled by store
    } finally {
      setDeleteDialogState(null)
    }
  }

  const visibleBlockedPaths = refreshGuardDialogState?.kind === 'unstaged-remote'
    ? refreshGuardDialogState.paths.slice(0, 3)
    : refreshGuardDialogState?.kind === 'conflict'
      ? refreshGuardDialogState.paths.slice(0, 3)
    : []
  const blockedPathCount = refreshGuardDialogState?.paths.length || 0
  const hiddenBlockedPathCount = refreshGuardDialogState?.paths
    ? Math.max(0, refreshGuardDialogState.paths.length - visibleBlockedPaths.length)
    : 0

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      <div className="flex h-14 items-center justify-between border-b px-4" style={{ borderColor: themeConfig.border }}>
        <div className="flex items-center">
          <FolderGit2 className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
          <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
            {t('git.repositoryTree')}
          </h2>
        </div>
        <button
          type="button"
          className="rounded p-1"
          style={{ color: themeConfig.primary }}
          onClick={() => setActivePanel('git')}
          title={t('sidebar.git')}
        >
          <GitBranch className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div
          className="flex min-h-0 flex-1 flex-col rounded-lg border p-3"
          style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" style={{ color: themeConfig.text }}>
                {connected ? `${config.ownerOrNamespace}/${config.repo}` : t('git.notConnected')}
              </div>
              <div className="truncate text-xs" style={{ color: themeConfig.muted }}>
                {connected ? `${config.branch} · ${t('git.workingTree')}` : t('git.connectFirst')}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                style={{ borderColor: themeConfig.border, color: themeConfig.text, backgroundColor: themeConfig.background }}
                onClick={() => setActivePanel('settings')}
                title={t('settings.openGitSettings')}
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                style={{ borderColor: themeConfig.border, color: themeConfig.text, backgroundColor: themeConfig.background }}
                onClick={() => setDialogState({ type: 'create-file', path: '' })}
                title={t('git.createFile')}
                disabled={!connected}
              >
                <FilePlus2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                style={{ borderColor: themeConfig.border, color: themeConfig.text, backgroundColor: themeConfig.background }}
                onClick={() => setDialogState({ type: 'create-folder', path: '' })}
                title={t('git.createFolder')}
                disabled={!connected}
              >
                <FolderPlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
                style={{ borderColor: themeConfig.border, color: themeConfig.text, backgroundColor: themeConfig.background }}
                onClick={() => void handleRefreshTree()}
                title={t('git.refreshTree')}
                disabled={!connected || isConnecting || isLoadingTree || isFetchingRemote || isRefreshingRepository}
              >
                {isLoadingTree || isFetchingRemote || isRefreshingRepository
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-2" style={{ borderColor: themeConfig.border }}>
            {worktreeView.treeByPath['']?.length ? (
              <GitWorktreeNode
                treeByPath={worktreeView.treeByPath}
                statusByPath={worktreeView.statusByPath}
                expandedPaths={expandedPaths}
                currentPath={currentPath}
                onToggle={(path) => void handleTogglePath(path)}
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

      <AlertDialog
        open={!!refreshGuardDialogState}
        onOpenChange={(open) => {
          if (!open) {
            setRefreshGuardDialogState(null)
          }
        }}
      >
        <AlertDialogContent
          className="sm:max-w-[520px]"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: `${themeConfig.danger}55`,
            color: themeConfig.text,
          }}
        >
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${themeConfig.danger}18`, color: themeConfig.danger }}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <AlertDialogTitle style={{ color: themeConfig.heading }}>
                  {t('git.refreshCheckResultTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription style={{ color: themeConfig.muted }}>
                  {refreshGuardDialogState?.kind === 'conflict'
                    ? t('git.refreshConflictResult').replace('{count}', String(blockedPathCount))
                    : t('git.refreshUnstagedResult').replace('{count}', String(blockedPathCount))}
                </AlertDialogDescription>
                <div className="text-sm" style={{ color: themeConfig.muted }}>
                  {refreshGuardDialogState?.kind === 'conflict'
                    ? t('git.refreshConflictAction')
                    : t('git.refreshUnstagedAction')}
                </div>
                {refreshGuardDialogState?.paths?.length ? (
                  <div className="space-y-2 text-sm" style={{ color: themeConfig.text }}>
                    <div style={{ color: themeConfig.muted }}>
                      {t('git.refreshBlockedMatchedFilesLabel')}
                    </div>
                    <div className="space-y-1 rounded-md border px-3 py-2" style={{ borderColor: themeConfig.border }}>
                      {visibleBlockedPaths.map((path) => (
                        <div key={path} className="truncate font-mono text-xs">
                          {path}
                        </div>
                      ))}
                      {hiddenBlockedPathCount > 0 ? (
                        <div className="text-xs" style={{ color: themeConfig.muted }}>
                          {t('git.refreshBlockedRemainingCount').replace('{count}', String(hiddenBlockedPathCount))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              onClick={() => setRefreshGuardDialogState(null)}
              style={{
                backgroundColor: themeConfig.background,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
            >
              {t('common.close')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRefreshGuardDialogState(null)
                setActivePanel('git')
              }}
              style={{
                backgroundColor: themeConfig.primary,
                color: themeConfig.buttonText || '#fff',
              }}
            >
              {t('git.openSourceControl')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default GitWorktreePanel
