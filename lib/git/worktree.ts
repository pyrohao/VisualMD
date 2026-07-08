import type { GitDraftFile, GitRemoteSnapshotEntry, GitTreeItem, StagedGitChange } from '@/lib/git/types'
import { getGitFileName, joinGitPath, normalizeGitPath } from '@/lib/git/utils'

export type GitIndexStatus = 'added' | 'modified' | 'deleted'
export type GitWorkingTreeStatus = 'untracked' | 'modified' | 'deleted'

export type GitWorktreeStatus = {
  index?: GitIndexStatus
  worktree?: GitWorkingTreeStatus
}

export type GitWorktreeView = {
  treeByPath: Record<string, GitTreeItem[]>
  statusByPath: Record<string, GitWorktreeStatus>
}

export function hasGitRemoteSnapshotPath(
  remoteSnapshotEntries: Record<string, GitRemoteSnapshotEntry>,
  targetPath: string,
  expectedType?: GitTreeItem['type']
) {
  const normalizedPath = normalizeGitPath(targetPath)
  const entry = remoteSnapshotEntries[normalizedPath]
  if (!entry) {
    return false
  }

  return expectedType ? entry.type === expectedType : true
}

function getParentPath(path: string) {
  const normalizedPath = normalizeGitPath(path)
  if (!normalizedPath.includes('/')) {
    return ''
  }

  return normalizedPath.split('/').slice(0, -1).join('/')
}

function sortGitTreeItems(items: GitTreeItem[]) {
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function setTreeItems(
  treeByPath: Record<string, GitTreeItem[]>,
  path: string,
  items: GitTreeItem[]
) {
  treeByPath[path] = sortGitTreeItems(
    items.filter((item, index, list) => (
      list.findIndex((candidate) => normalizeGitPath(candidate.path) === normalizeGitPath(item.path)) === index
    ))
  )
}

function ensureDirectoryChain(treeByPath: Record<string, GitTreeItem[]>, targetPath: string) {
  const normalizedTargetPath = normalizeGitPath(targetPath)
  if (!normalizedTargetPath) {
    return
  }

  const segments = normalizedTargetPath.split('/').filter(Boolean)
  let currentPath = ''

  segments.forEach((segment) => {
    const parentPath = currentPath
    currentPath = currentPath ? joinGitPath(currentPath, segment) : segment
    const parentItems = treeByPath[parentPath] || []
    setTreeItems(treeByPath, parentPath, [
      ...parentItems,
      {
        path: currentPath,
        name: segment,
        type: 'dir',
      },
    ])

    if (!treeByPath[currentPath]) {
      treeByPath[currentPath] = []
    }
  })
}

function upsertTreeEntry(
  treeByPath: Record<string, GitTreeItem[]>,
  entryPath: string,
  type: GitTreeItem['type']
) {
  const normalizedPath = normalizeGitPath(entryPath)
  const parentPath = normalizedPath.includes('/')
    ? normalizedPath.split('/').slice(0, -1).join('/')
    : ''
  const name = getGitFileName(normalizedPath)

  ensureDirectoryChain(treeByPath, parentPath)
  const parentItems = treeByPath[parentPath] || []
  setTreeItems(treeByPath, parentPath, [
    ...parentItems.filter((item) => normalizeGitPath(item.path) !== normalizedPath),
    {
      path: normalizedPath,
      name,
      type,
    },
  ])

  if (type === 'dir' && !treeByPath[normalizedPath]) {
    treeByPath[normalizedPath] = []
  }
}

function removeTreeEntry(treeByPath: Record<string, GitTreeItem[]>, targetPath: string, type: GitTreeItem['type']) {
  const normalizedPath = normalizeGitPath(targetPath)
  const parentPath = normalizedPath.includes('/')
    ? normalizedPath.split('/').slice(0, -1).join('/')
    : ''

  if (treeByPath[parentPath]) {
    setTreeItems(
      treeByPath,
      parentPath,
      treeByPath[parentPath].filter((item) => normalizeGitPath(item.path) !== normalizedPath)
    )
  }

  if (type === 'dir') {
    Object.keys(treeByPath).forEach((path) => {
      if (path === normalizedPath || path.startsWith(`${normalizedPath}/`)) {
        delete treeByPath[path]
      } else if (treeByPath[path]) {
        setTreeItems(
          treeByPath,
          path,
          treeByPath[path].filter((item) => !(
            normalizeGitPath(item.path) === normalizedPath ||
            normalizeGitPath(item.path).startsWith(`${normalizedPath}/`)
          ))
        )
      }
    })
  }
}

function applyIndexStatus(statusByPath: Record<string, GitWorktreeStatus>, targetPath: string, status: GitIndexStatus) {
  const normalizedPath = normalizeGitPath(targetPath)
  statusByPath[normalizedPath] = {
    ...statusByPath[normalizedPath],
    index: status,
  }
}

function applyWorktreeStatus(statusByPath: Record<string, GitWorktreeStatus>, targetPath: string, status: GitWorkingTreeStatus) {
  const normalizedPath = normalizeGitPath(targetPath)
  statusByPath[normalizedPath] = {
    ...statusByPath[normalizedPath],
    worktree: status,
  }
}

function markAncestorDirectories(statusByPath: Record<string, GitWorktreeStatus>, targetPath: string) {
  const sourceStatus = statusByPath[normalizeGitPath(targetPath)]
  let currentPath = getParentPath(targetPath)

  while (currentPath) {
    const currentStatus = statusByPath[currentPath] || {}
    statusByPath[currentPath] = {
      index: sourceStatus?.index ? (currentStatus.index || 'modified') : currentStatus.index,
      worktree: sourceStatus?.worktree ? (currentStatus.worktree || 'modified') : currentStatus.worktree,
    }
    currentPath = getParentPath(currentPath)
  }
}

type WorktreeOverlayState = {
  treeByPath: Record<string, GitTreeItem[]>
  remoteSnapshotEntries: Record<string, GitRemoteSnapshotEntry>
  drafts: Record<string, GitDraftFile>
  pendingAssetChanges: StagedGitChange[]
  pendingStructuralChanges: StagedGitChange[]
  stagedChanges: StagedGitChange[]
}

/**
 * Git state model:
 * - `treeByPath` is the committed remote baseline that successful refreshes load.
 * - `drafts` + pending/staged change lists form the local working tree overlay.
 * - Source Control views (`Changes` / `Staged`) are selections over that working tree.
 * - The worktree tree shown to users is baseline plus the local overlay below.
 */
export function buildGitWorktreeView(state: WorktreeOverlayState): GitWorktreeView {
  const nextTreeByPath: Record<string, GitTreeItem[]> = Object.fromEntries(
    Object.entries(state.treeByPath).map(([path, items]) => [path, sortGitTreeItems(items.map((item) => ({ ...item })))]),
  )
  const statusByPath: Record<string, GitWorktreeStatus> = {}
  const stagedDraftDocumentIds = new Set(
    state.stagedChanges
      .filter((item) => item.kind === 'git-draft' && item.documentId)
      .map((item) => item.documentId as string)
  )
  const stagedDraftByDocumentId = new Map(
    state.stagedChanges
      .filter((item) => item.kind === 'git-draft' && item.documentId)
      .map((item) => [item.documentId as string, item] as const)
  )
  const stagedAssetPaths = new Set(
    state.stagedChanges
      .filter((item) => item.kind === 'git-asset')
      .map((item) => normalizeGitPath(item.repoPath))
  )
  const stagedCreatedFolderPaths = new Set(
    state.stagedChanges
      .filter((item) => item.kind === 'git-create-folder')
      .map((item) => normalizeGitPath(item.repoPath))
  )

  Object.values(state.drafts).forEach((draft) => {
    const normalizedPath = normalizeGitPath(draft.path)
    const stagedDraft = stagedDraftByDocumentId.get(draft.documentId)
    if (draft.isNew) {
      upsertTreeEntry(nextTreeByPath, normalizedPath, 'file')
      if (stagedDraftDocumentIds.has(draft.documentId)) {
        applyIndexStatus(statusByPath, normalizedPath, 'added')
        if ((stagedDraft?.content ?? '') !== draft.draftContent) {
          applyWorktreeStatus(statusByPath, normalizedPath, 'modified')
        }
      } else {
        applyWorktreeStatus(statusByPath, normalizedPath, 'untracked')
      }
      return
    }

    if (stagedDraft) {
      if ((stagedDraft.content ?? '') !== draft.draftContent) {
        applyWorktreeStatus(statusByPath, normalizedPath, 'modified')
      }
      return
    }

    if (draft.isDirty) {
      applyWorktreeStatus(statusByPath, normalizedPath, 'modified')
    }
  })

  ;[...state.pendingAssetChanges, ...state.stagedChanges.filter((item) => item.kind === 'git-asset')].forEach((change) => {
    const normalizedPath = normalizeGitPath(change.repoPath)
    const existsRemotely = hasGitRemoteSnapshotPath(state.remoteSnapshotEntries, normalizedPath, 'file')
    upsertTreeEntry(nextTreeByPath, normalizedPath, 'file')
    if (stagedAssetPaths.has(normalizedPath)) {
      if (!existsRemotely) {
        applyIndexStatus(statusByPath, normalizedPath, 'added')
      }
      return
    }

    applyWorktreeStatus(statusByPath, normalizedPath, existsRemotely ? 'modified' : 'untracked')
  })

  ;[...state.pendingStructuralChanges, ...state.stagedChanges.filter((item) => (
    item.kind === 'git-create-folder' || item.kind === 'git-delete-file' || item.kind === 'git-delete-folder'
  ))].forEach((change) => {
    if (change.kind === 'git-create-folder') {
      upsertTreeEntry(nextTreeByPath, change.repoPath, 'dir')
      if (stagedCreatedFolderPaths.has(normalizeGitPath(change.repoPath))) {
        applyIndexStatus(statusByPath, change.repoPath, 'added')
        return
      }

      applyWorktreeStatus(statusByPath, change.repoPath, 'untracked')
      return
    }

    if (change.kind === 'git-delete-file') {
      removeTreeEntry(nextTreeByPath, change.repoPath, 'file')
      if (!state.stagedChanges.some((item) => item.id === change.id)) {
        applyWorktreeStatus(statusByPath, change.repoPath, 'deleted')
      }
      return
    }

    if (change.kind === 'git-delete-folder') {
      removeTreeEntry(nextTreeByPath, change.repoPath, 'dir')
      if (!state.stagedChanges.some((item) => item.id === change.id)) {
        applyWorktreeStatus(statusByPath, change.repoPath, 'deleted')
      }
    }
  })

  Object.keys(statusByPath).forEach((path) => {
    markAncestorDirectories(statusByPath, path)
  })

  return {
    treeByPath: nextTreeByPath,
    statusByPath,
  }
}
