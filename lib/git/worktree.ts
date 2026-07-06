import type { GitDraftFile, GitTreeItem, StagedGitChange } from '@/lib/git/types'
import { getGitFileName, joinGitPath, normalizeGitPath } from '@/lib/git/utils'

export type GitWorktreeStatus = 'clean' | 'untracked' | 'added' | 'modified' | 'deleted'

export type GitWorktreeView = {
  treeByPath: Record<string, GitTreeItem[]>
  statusByPath: Record<string, GitWorktreeStatus>
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

function applyStatus(statusByPath: Record<string, GitWorktreeStatus>, targetPath: string, status: GitWorktreeStatus) {
  const normalizedPath = normalizeGitPath(targetPath)
  statusByPath[normalizedPath] = status
}

function markAncestorDirectories(statusByPath: Record<string, GitWorktreeStatus>, targetPath: string) {
  let currentPath = getParentPath(targetPath)

  while (currentPath) {
    if (!statusByPath[currentPath] || statusByPath[currentPath] === 'clean') {
      statusByPath[currentPath] = 'modified'
    }
    currentPath = getParentPath(currentPath)
  }
}

type WorktreeOverlayState = {
  treeByPath: Record<string, GitTreeItem[]>
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
    if (draft.isNew) {
      upsertTreeEntry(nextTreeByPath, normalizedPath, 'file')
      applyStatus(statusByPath, normalizedPath, stagedDraftDocumentIds.has(draft.documentId) ? 'added' : 'untracked')
      return
    }

    if (draft.isDirty) {
      applyStatus(statusByPath, normalizedPath, 'modified')
    }
  })

  ;[...state.pendingAssetChanges, ...state.stagedChanges.filter((item) => item.kind === 'git-asset')].forEach((change) => {
    upsertTreeEntry(nextTreeByPath, change.repoPath, 'file')
    applyStatus(statusByPath, change.repoPath, stagedAssetPaths.has(normalizeGitPath(change.repoPath)) ? 'added' : 'untracked')
  })

  ;[...state.pendingStructuralChanges, ...state.stagedChanges.filter((item) => (
    item.kind === 'git-create-folder' || item.kind === 'git-delete-file' || item.kind === 'git-delete-folder'
  ))].forEach((change) => {
    if (change.kind === 'git-create-folder') {
      upsertTreeEntry(nextTreeByPath, change.repoPath, 'dir')
      applyStatus(statusByPath, change.repoPath, stagedCreatedFolderPaths.has(normalizeGitPath(change.repoPath)) ? 'added' : 'untracked')
      return
    }

    if (change.kind === 'git-delete-file') {
      removeTreeEntry(nextTreeByPath, change.repoPath, 'file')
      applyStatus(statusByPath, change.repoPath, 'deleted')
      return
    }

    if (change.kind === 'git-delete-folder') {
      removeTreeEntry(nextTreeByPath, change.repoPath, 'dir')
      applyStatus(statusByPath, change.repoPath, 'deleted')
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
