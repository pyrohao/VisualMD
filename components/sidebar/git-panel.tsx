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
  Folder,
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
  Settings2,
  Undo2,
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
                  renderGitFileIcon(normalizedPath, themeConfig)
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

type GitChangeActionTarget =
  | { kind: 'draft'; value: string }
  | { kind: 'pending-asset'; value: string }
  | { kind: 'pending-structural'; value: string }
  | { kind: 'staged'; value: string }

type GitChangeOpenTarget =
  | { kind: 'path'; value: string }
  | { kind: 'staged'; value: string }
  | { kind: 'pending-structural'; value: string }

type GitChangeEntry = {
  key: string
  path: string
  name: string
  type: 'file' | 'dir'
  deleted: boolean
  actionMode: 'stage' | 'unstage'
  actionTarget: GitChangeActionTarget
  openTarget?: GitChangeOpenTarget
}

type GitChangeTreeNode = {
  key: string
  path: string
  name: string
  type: 'file' | 'dir'
  deleted: boolean
  explicitEntry?: GitChangeEntry
  actionTargets: GitChangeActionTarget[]
  children: GitChangeTreeNode[]
}

type MutableGitChangeTreeNode = Omit<GitChangeTreeNode, 'children' | 'actionTargets'> & {
  children: Map<string, MutableGitChangeTreeNode>
}

function isGitPathWithinFolder(candidatePath: string, folderPath: string) {
  const normalizedCandidatePath = normalizeGitPath(candidatePath)
  const normalizedFolderPath = normalizeGitPath(folderPath)

  return (
    normalizedCandidatePath === normalizedFolderPath ||
    normalizedCandidatePath.startsWith(`${normalizedFolderPath}/`)
  )
}

function sortGitChangeNodes(nodes: GitChangeTreeNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'dir' ? -1 : 1
    }

    return a.name.localeCompare(b.name)
  })
}

function buildGitChangeTree(entries: GitChangeEntry[]) {
  const root = new Map<string, MutableGitChangeTreeNode>()

  for (const entry of entries) {
    const segments = normalizeGitPath(entry.path).split('/').filter(Boolean)
    if (!segments.length) {
      continue
    }

    let currentChildren = root
    let currentPath = ''

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      const isLeaf = index === segments.length - 1
      const existingNode = currentChildren.get(currentPath)

      if (existingNode) {
        if (isLeaf) {
          existingNode.explicitEntry = entry
          existingNode.type = entry.type
          existingNode.deleted = entry.deleted
        }
        currentChildren = existingNode.children
        return
      }

      const nextNode: MutableGitChangeTreeNode = {
        key: currentPath,
        path: currentPath,
        name: segment,
        type: isLeaf ? entry.type : 'dir',
        deleted: isLeaf ? entry.deleted : false,
        explicitEntry: isLeaf ? entry : undefined,
        children: new Map<string, MutableGitChangeTreeNode>(),
      }

      currentChildren.set(currentPath, nextNode)
      currentChildren = nextNode.children
    })
  }

  const finalize = (node: MutableGitChangeTreeNode): GitChangeTreeNode => {
    const children = sortGitChangeNodes(Array.from(node.children.values()).map(finalize))
    const actionTargets = [
      ...(node.explicitEntry ? [node.explicitEntry.actionTarget] : []),
      ...children.flatMap((child) => child.actionTargets),
    ].filter((target, index, list) => (
      list.findIndex((candidate) => candidate.kind === target.kind && candidate.value === target.value) === index
    ))

    return {
      key: node.key,
      path: node.path,
      name: node.name,
      type: node.type,
      deleted: node.explicitEntry?.deleted ?? false,
      explicitEntry: node.explicitEntry,
      actionTargets,
      children,
    }
  }

  return sortGitChangeNodes(Array.from(root.values()).map(finalize))
}

function GitChangeTree({
  nodes,
  depth = 0,
  collapsedPaths,
  onToggle,
  onAction,
  onSecondaryAction,
  onOpen,
  themeConfig,
  t,
}: {
  nodes: GitChangeTreeNode[]
  depth?: number
  collapsedPaths: string[]
  onToggle: (path: string) => void
  onAction: (targets: GitChangeActionTarget[]) => void
  onSecondaryAction?: (targets: GitChangeActionTarget[]) => void
  onOpen: (target: GitChangeOpenTarget) => void
  themeConfig: typeof themeConfigs.light
  t: (key: string) => string
}) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => {
        const isDir = node.type === 'dir'
        const hasChildren = node.children.length > 0
        const isCollapsed = collapsedPaths.includes(node.path)
        const canToggle = isDir && hasChildren
        const iconColor = node.deleted ? themeConfig.danger : (isDir ? themeConfig.primary : themeConfig.muted)
        const actionMode = node.explicitEntry?.actionMode || (node.actionTargets.some((target) => target.kind === 'staged') ? 'unstage' : 'stage')

        return (
          <div key={node.key} className="space-y-1">
            <div
              className="group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors"
              style={{
                marginLeft: depth * 12,
                backgroundColor: 'transparent',
                color: node.deleted ? themeConfig.danger : themeConfig.text,
              }}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => {
                  if (canToggle) {
                    onToggle(node.path)
                    return
                  }

                  if (node.explicitEntry?.openTarget) {
                    onOpen(node.explicitEntry.openTarget)
                  }
                }}
              >
                {isDir ? (
                  canToggle ? (
                    isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                {isDir ? (
                  <Folder className="h-4 w-4 shrink-0" style={{ color: iconColor }} />
                ) : (
                  renderGitFileIcon(node.path, themeConfig)
                )}
                <span
                  className="min-w-0 truncate text-sm"
                  style={{
                    color: node.deleted ? themeConfig.danger : themeConfig.text,
                    fontStyle: node.deleted ? 'italic' : 'normal',
                    textDecoration: node.deleted ? 'line-through' : 'none',
                  }}
                >
                  {node.name}
                </span>
              </button>

              {node.actionTargets.length > 0 ? (
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {onSecondaryAction ? (
                    <button
                      type="button"
                      className="rounded p-1"
                      style={{ color: themeConfig.danger }}
                      onClick={() => onSecondaryAction(node.actionTargets)}
                      title={t('git.discard')}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded p-1"
                    style={{ color: themeConfig.primary }}
                    onClick={() => onAction(node.actionTargets)}
                    title={actionMode === 'unstage' ? t('git.unstage') : t('git.stageConfirm')}
                  >
                    {actionMode === 'unstage' ? (
                      <RotateCcw className="h-3.5 w-3.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ) : null}
            </div>

            {isDir && hasChildren && !isCollapsed ? (
              <GitChangeTree
                nodes={node.children}
                depth={depth + 1}
                collapsedPaths={collapsedPaths}
                onToggle={onToggle}
                onAction={onAction}
                onSecondaryAction={onSecondaryAction}
                onOpen={onOpen}
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

export function GitPanel() {
  const { getThemeConfig } = useThemeStore()
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [deleteDialogState, setDeleteDialogState] = useState<DeleteDialogState>(null)
  const [commitMessage, setCommitMessage] = useState('')
  const [collapsedPendingPaths, setCollapsedPendingPaths] = useState<string[]>([])
  const [collapsedStagedPaths, setCollapsedStagedPaths] = useState<string[]>([])
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
    pendingStructuralChanges,
    currentDocumentId,
    isConnecting,
    isLoadingTree,
    isCommitting,
    error,
    connected,
    lastFetchedAt,
    clearError,
    loadTree,
    refreshRepositoryFromRemote,
    toggleExpandedPath,
    openFile,
    setCurrentDocumentId,
    stageGitDraft,
    unstageChange,
    restagePendingAsset,
    stagePendingStructuralChange,
    discardDraftChange,
    discardPendingAsset,
    discardPendingStructuralChange,
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
  const conflictedDrafts = useMemo(
    () => Object.values(drafts).filter((draft) => draft.status === 'conflict'),
    [drafts]
  )
  const currentPath = currentDraft?.path || activeTab?.gitMeta?.path || null
  const stagedChangeIdSet = useMemo(() => new Set(stagedChanges.map((item) => item.id)), [stagedChanges])
  const deletedDocumentIdSet = useMemo(
    () => new Set(
      [...stagedChanges, ...pendingStructuralChanges]
        .filter((item) => item.kind === 'git-delete-file' && item.documentId)
        .map((item) => item.documentId as string)
    ),
    [pendingStructuralChanges, stagedChanges]
  )
  const deletedFolderPathSet = useMemo(
    () => new Set(
      [...stagedChanges, ...pendingStructuralChanges]
        .filter((item) => item.kind === 'git-delete-folder')
        .map((item) => normalizeGitPath(item.repoPath))
    ),
    [pendingStructuralChanges, stagedChanges]
  )
  const pendingDrafts = useMemo(
    () => Object.values(drafts).filter((draft) => (
      (draft.isDirty || draft.isNew) &&
      !stagedChangeIdSet.has(`git-draft:${draft.documentId}`) &&
      !deletedDocumentIdSet.has(draft.documentId) &&
      !Array.from(deletedFolderPathSet).some((folderPath) => isGitPathWithinFolder(draft.path, folderPath))
    )),
    [deletedDocumentIdSet, deletedFolderPathSet, drafts, stagedChangeIdSet]
  )
  const pendingGitAssetChanges = useMemo(
    () => pendingAssetChanges.filter((item) => (
      item.kind === 'git-asset' &&
      !stagedChangeIdSet.has(item.id)
    )),
    [pendingAssetChanges, stagedChangeIdSet]
  )
  const pendingStructuralStageChanges = useMemo(
    () => pendingStructuralChanges.filter((item) => !stagedChangeIdSet.has(item.id)),
    [pendingStructuralChanges, stagedChangeIdSet]
  )
  const pendingChangeEntries = useMemo<GitChangeEntry[]>(
    () => [
      ...pendingDrafts.map((draft) => ({
        key: `pending-draft:${draft.documentId}`,
        path: draft.path,
        name: draft.name,
        type: 'file' as const,
        deleted: false,
        actionMode: 'stage' as const,
        actionTarget: { kind: 'draft' as const, value: draft.documentId },
        openTarget: { kind: 'path' as const, value: draft.path },
      })),
      ...pendingGitAssetChanges.map((change) => ({
        key: `pending-asset:${change.id}`,
        path: change.repoPath,
        name: change.label,
        type: 'file' as const,
        deleted: false,
        actionMode: 'stage' as const,
        actionTarget: { kind: 'pending-asset' as const, value: change.id },
      })),
      ...pendingStructuralStageChanges.map((change) => ({
        key: `pending-structural:${change.id}`,
        path: change.repoPath,
        name: change.label,
        type: change.kind === 'git-delete-folder' || change.kind === 'git-create-folder' ? 'dir' as const : 'file' as const,
        deleted: change.kind === 'git-delete-file' || change.kind === 'git-delete-folder',
        actionMode: 'stage' as const,
        actionTarget: { kind: 'pending-structural' as const, value: change.id },
        openTarget: { kind: 'pending-structural' as const, value: change.id },
      })),
    ],
    [pendingDrafts, pendingGitAssetChanges, pendingStructuralStageChanges]
  )
  const stagedChangeEntries = useMemo<GitChangeEntry[]>(
    () => stagedChanges.map((change) => ({
      key: `staged:${change.id}`,
      path: change.repoPath,
      name: change.label,
      type: change.kind === 'git-delete-folder' || change.kind === 'git-create-folder' ? 'dir' as const : 'file' as const,
      deleted: change.kind === 'git-delete-file' || change.kind === 'git-delete-folder',
      actionMode: 'unstage' as const,
      actionTarget: { kind: 'staged' as const, value: change.id },
      openTarget: { kind: 'staged' as const, value: change.id },
    })),
    [stagedChanges]
  )
  const pendingChangeTree = useMemo(() => buildGitChangeTree(pendingChangeEntries), [pendingChangeEntries])
  const stagedChangeTree = useMemo(() => buildGitChangeTree(stagedChangeEntries), [stagedChangeEntries])
  const hasPendingStageItems =
    pendingDrafts.length > 0 ||
    pendingGitAssetChanges.length > 0 ||
    pendingStructuralStageChanges.length > 0
  const hasCommitCandidates = stagedChanges.length > 0
  const hasUnresolvedConflicts = conflictedDrafts.length > 0
  const pendingSummary = useMemo(() => {
    const pendingCount = pendingDrafts.length + pendingGitAssetChanges.length + pendingStructuralStageChanges.length
    if (pendingCount > 0) {
      return t('git.stagedCount').replace('{count}', String(pendingCount))
    }
    return t('git.noStagedChanges')
  }, [pendingDrafts.length, pendingGitAssetChanges.length, pendingStructuralStageChanges.length, t])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!connected || isConnecting || isLoadingTree) return
    if (Object.prototype.hasOwnProperty.call(treeByPath, '')) return

    void refreshRepositoryFromRemote().catch(() => {
      // handled by store
    })
  }, [connected, isConnecting, isLoadingTree, refreshRepositoryFromRemote, treeByPath])

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
    if (hasUnresolvedConflicts) {
      toast({
        title: t('common.error'),
        description: 'Resolve all conflicted files before refreshing repository content',
        variant: 'destructive',
      })
      return
    }

    try {
      const result = await refreshRepositoryFromRemote()
      await loadTree('')
      await Promise.all(
        expandedPaths
          .filter((path) => normalizeGitPath(path).length > 0)
          .map(async (path) => {
            await loadTree(path)
          })
      )

      if (currentDocumentId) {
        const refreshedDraft = useGitStore.getState().drafts[currentDocumentId]
        const latestActiveTab = useTabsStore.getState().getActiveTab()

        if (refreshedDraft && latestActiveTab?.fileId === currentDocumentId) {
          useTabsStore.getState().updateTabContent(latestActiveTab.id, refreshedDraft.draftContent)
          if (refreshedDraft.hasConflict || refreshedDraft.isDirty || refreshedDraft.isNew) {
            useTabsStore.getState().markTabAsModified(latestActiveTab.id, true)
          } else {
            useTabsStore.getState().markTabAsSaved(latestActiveTab.id, refreshedDraft.name)
          }
          loadDocument(refreshedDraft.draftContent, refreshedDraft.name, refreshedDraft.documentId)
        }
      }

      toast({
        title: t('git.refreshTree'),
        description:
          result.addedPaths.length || result.deletedPaths.length || result.updatedPaths.length
            ? t('git.reposLoaded')
            : t('git.noStagedChanges'),
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
      const targetDraft = useGitStore.getState().drafts[change.documentId]
      if (targetDraft && change.originalContent !== undefined) {
        await requestNavigationWithUnsavedGuard(() => {
          openDraftInTab(change.documentId!, change.originalContent)
        }, change.label)
      } else {
        await handleOpenFile(change.repoPath)
      }
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

    if (change.kind === 'git-create-folder' || change.kind === 'git-delete-folder') {
      await toggleExpandedPath(change.repoPath)
    }
  }

  const handleOpenPendingStructuralChange = async (change: StagedGitChange) => {
    if (change.kind === 'git-delete-file' && change.documentId) {
      const targetDraft = useGitStore.getState().drafts[change.documentId]
      if (targetDraft && change.originalContent !== undefined) {
        await requestNavigationWithUnsavedGuard(() => {
          openDraftInTab(change.documentId!, change.originalContent)
        }, change.label)
      } else {
        await handleOpenFile(change.repoPath)
      }
      return
    }

    if (change.kind === 'git-create-folder' || change.kind === 'git-delete-folder') {
      await toggleExpandedPath(change.repoPath)
    }
  }

  const toggleCollapsedPath = (path: string, section: 'pending' | 'staged') => {
    const setPaths = section === 'pending' ? setCollapsedPendingPaths : setCollapsedStagedPaths

    setPaths((currentPaths) => (
      currentPaths.includes(path)
        ? currentPaths.filter((currentPath) => currentPath !== path)
        : [...currentPaths, path]
    ))
  }

  const handleOpenChangeTarget = async (target: GitChangeOpenTarget) => {
    if (target.kind === 'path') {
      await handleOpenFile(target.value)
      return
    }

    if (target.kind === 'staged') {
      await handleOpenStagedChange(target.value)
      return
    }

    const change = pendingStructuralChanges.find((item) => item.id === target.value)
    if (change) {
      await handleOpenPendingStructuralChange(change)
    }
  }

  const handlePendingActionTargets = (targets: GitChangeActionTarget[]) => {
    const dedupedTargets = targets.filter((target, index, list) => (
      list.findIndex((candidate) => candidate.kind === target.kind && candidate.value === target.value) === index
    ))

    dedupedTargets.forEach((target) => {
      if (target.kind === 'draft') {
        stageGitDraft(target.value)
        return
      }

      if (target.kind === 'pending-asset') {
        restagePendingAsset(target.value)
        return
      }

      if (target.kind === 'pending-structural') {
        stagePendingStructuralChange(target.value)
      }
    })

    if (dedupedTargets.length > 0) {
      toast({ title: t('git.stagedToGit') })
    }
  }

  const handleDiscardPendingTargets = (targets: GitChangeActionTarget[]) => {
    const dedupedTargets = targets.filter((target, index, list) => (
      list.findIndex((candidate) => candidate.kind === target.kind && candidate.value === target.value) === index
    ))

    const structuralTargets = dedupedTargets
      .filter((target): target is Extract<GitChangeActionTarget, { kind: 'pending-structural' }> => target.kind === 'pending-structural')
      .sort((left, right) => {
        const leftPath = pendingStructuralChanges.find((item) => item.id === left.value)?.repoPath || ''
        const rightPath = pendingStructuralChanges.find((item) => item.id === right.value)?.repoPath || ''
        return rightPath.length - leftPath.length
      })

    dedupedTargets.forEach((target) => {
      if (target.kind === 'draft') {
        discardDraftChange(target.value)
        return
      }

      if (target.kind === 'pending-asset') {
        discardPendingAsset(target.value)
      }
    })

    structuralTargets.forEach((target) => {
      discardPendingStructuralChange(target.value)
    })

    if (dedupedTargets.length > 0) {
      toast({ title: t('toast.deleted') })
    }
  }

  const handleStagedActionTargets = (targets: GitChangeActionTarget[]) => {
    const dedupedTargets = targets.filter((target, index, list) => (
      list.findIndex((candidate) => candidate.kind === target.kind && candidate.value === target.value) === index
    ))

    dedupedTargets
      .filter((target) => target.kind === 'staged')
      .forEach((target) => {
        unstageChange(target.value)
      })
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

      <div className="min-h-0 flex-1 p-4">
        <div className="flex h-full min-h-0 flex-col gap-4">
        <div
          className="flex min-h-0 flex-1 flex-col space-y-3 rounded-lg border p-3"
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
                disabled={!connected}
              >
                {isLoadingTree ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>

            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-2" style={{ borderColor: themeConfig.border }}>
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
          className="flex min-h-0 flex-1 flex-col space-y-3 rounded-lg border p-3"
          style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
        >
          <div className="shrink-0">
            <div className="text-sm font-medium" style={{ color: themeConfig.text }}>
              {t('git.stageChanges')}
            </div>
            <div className="text-xs" style={{ color: themeConfig.muted }}>
              {stagedChanges.length
                ? t('git.stagedCount').replace('{count}', String(stagedChanges.length))
                : t('git.noStagedChanges')}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border p-2" style={{ borderColor: themeConfig.border }}>
            {stagedChanges.length ? (
              <GitChangeTree
                nodes={stagedChangeTree}
                collapsedPaths={collapsedStagedPaths}
                onToggle={(path) => toggleCollapsedPath(path, 'staged')}
                onAction={handleStagedActionTargets}
                onOpen={(target) => void handleOpenChangeTarget(target)}
                themeConfig={themeConfig}
                t={t}
              />
            ) : (
              <div className="py-6 text-center text-sm" style={{ color: themeConfig.muted }}>
                {t('git.noStagedChanges')}
              </div>
            )}
          </div>

          {hasUnresolvedConflicts ? (
            <div className="shrink-0">
              <div className="text-sm font-medium" style={{ color: themeConfig.text }}>
                {t('git.conflictDetected')}
              </div>
              <div className="mt-2 max-h-[120px] space-y-2 overflow-y-auto rounded-md border p-2" style={{ borderColor: themeConfig.border }}>
                {conflictedDrafts.map((draft) => (
                  <button
                    key={draft.documentId}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border px-2 py-2 text-left transition-colors"
                    style={{
                      borderColor: themeConfig.border,
                      backgroundColor: currentDraft?.documentId === draft.documentId ? `${themeConfig.danger}10` : themeConfig.background,
                    }}
                    onClick={() => void handleOpenFile(draft.path)}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: themeConfig.text }}>
                      {draft.name}
                    </span>
                    <span className="ml-2 shrink-0 text-[11px]" style={{ color: themeConfig.danger }}>
                      {t('git.mergeNeedsReview')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="shrink-0">
            <div className="text-sm font-medium" style={{ color: themeConfig.text }}>
              {t('git.pendingChanges')}
            </div>
            <div className="text-xs" style={{ color: themeConfig.muted }}>
              {pendingSummary}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md border p-2" style={{ borderColor: themeConfig.border }}>
            {hasPendingStageItems ? (
              <GitChangeTree
                nodes={pendingChangeTree}
                collapsedPaths={collapsedPendingPaths}
                onToggle={(path) => toggleCollapsedPath(path, 'pending')}
                onAction={handlePendingActionTargets}
                onSecondaryAction={handleDiscardPendingTargets}
                onOpen={(target) => void handleOpenChangeTarget(target)}
                themeConfig={themeConfig}
                t={t}
              />
            ) : (
              <div className="py-6 text-center text-sm" style={{ color: themeConfig.muted }}>
                {t('git.noStagedChanges')}
              </div>
            )}
          </div>

          {currentDraft?.hasConflict ? (
            <div
              className="flex shrink-0 items-start gap-2 rounded-md border px-3 py-2 text-xs"
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
            <div className="shrink-0 text-[11px]" style={{ color: themeConfig.muted }}>
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
            className="shrink-0"
          />

          <Button
            onClick={handleCommit}
            disabled={!hasCommitCandidates || !commitMessage.trim() || isCommitting || hasUnresolvedConflicts}
            className="w-full shrink-0"
            style={{
              backgroundColor:
                hasCommitCandidates && commitMessage.trim() && !isCommitting && !hasUnresolvedConflicts
                  ? themeConfig.primary
                  : themeConfig.border,
              color:
                hasCommitCandidates && commitMessage.trim() && !isCommitting && !hasUnresolvedConflicts
                  ? themeConfig.buttonText || '#fff'
                  : themeConfig.muted,
            }}
          >
            {isCommitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t('git.commitToRepo')}
          </Button>
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
    </div>
  )
}

export default GitPanel
