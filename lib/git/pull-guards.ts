import type { GitDraftFile, StagedGitChange } from './types'
import { hasMeaningfulLocalGitChange } from './sync'
import { normalizeGitPath } from './utils'

export type GitPullBlocker =
  | {
      kind: 'untracked-overwrite'
      path: string
    }
  | {
      kind: 'unstaged-overwrite'
      path: string
    }
  | {
      kind: 'directory-delete-add-file'
      path: string
      folderPath: string
    }

type PullBlockerInput = {
  drafts: Record<string, GitDraftFile>
  stagedChanges: StagedGitChange[]
  pendingAssetChanges: StagedGitChange[]
  pendingStructuralChanges: StagedGitChange[]
  changedPaths: string[]
  remoteTreeMap: Record<string, string>
}

type UnstagedChangeInput = {
  drafts: Record<string, GitDraftFile>
  stagedChanges: StagedGitChange[]
  pendingAssetChanges: StagedGitChange[]
  pendingStructuralChanges: StagedGitChange[]
}

function buildStagedIndex(stagedChanges: StagedGitChange[]) {
  const stagedDraftByDocumentId = new Map<string, StagedGitChange>()
  const stagedPaths = new Set<string>()

  stagedChanges.forEach((change) => {
    stagedPaths.add(normalizeGitPath(change.repoPath))
    if (change.kind === 'git-draft' && change.documentId) {
      stagedDraftByDocumentId.set(change.documentId, change)
    }
  })

  return {
    stagedDraftByDocumentId,
    stagedPaths,
  }
}

export function findGitPullBlockers({
  drafts,
  stagedChanges,
  pendingAssetChanges,
  pendingStructuralChanges,
  changedPaths,
  remoteTreeMap,
}: PullBlockerInput): GitPullBlocker[] {
  const normalizedChangedPaths = new Set(changedPaths.map((path) => normalizeGitPath(path)))
  const { stagedDraftByDocumentId, stagedPaths } = buildStagedIndex(stagedChanges)
  const stagedDeletePaths = new Set<string>()
  const pendingDeletePaths = new Set<string>()

  stagedChanges.forEach((change) => {
    if (change.kind === 'git-delete-file') {
      stagedDeletePaths.add(normalizeGitPath(change.repoPath))
    }
  })

  pendingStructuralChanges.forEach((change) => {
    if (change.kind === 'git-delete-file') {
      pendingDeletePaths.add(normalizeGitPath(change.repoPath))
    }
  })

  const blockers: GitPullBlocker[] = []
  const seenPaths = new Set<string>()

  for (const draft of Object.values(drafts)) {
    const draftPath = normalizeGitPath(draft.path)
    if (!normalizedChangedPaths.has(draftPath) || seenPaths.has(draftPath)) {
      continue
    }

    const stagedDraft = stagedDraftByDocumentId.get(draft.documentId)
    const remotePathExists = Object.prototype.hasOwnProperty.call(remoteTreeMap, draftPath)
    const hasPendingDelete = pendingDeletePaths.has(draftPath)
    const hasStagedDelete = stagedDeletePaths.has(draftPath)

    if (hasPendingDelete && !hasStagedDelete) {
      blockers.push({ kind: 'unstaged-overwrite', path: draftPath })
      seenPaths.add(draftPath)
      continue
    }

    if (draft.isNew && !stagedDraft) {
      if (remotePathExists) {
        blockers.push({ kind: 'untracked-overwrite', path: draftPath })
        seenPaths.add(draftPath)
      }
      continue
    }

    if (stagedDraft) {
      const stagedContent = stagedDraft.content ?? ''
      if (draft.draftContent !== stagedContent) {
        blockers.push({ kind: 'unstaged-overwrite', path: draftPath })
        seenPaths.add(draftPath)
      }
      continue
    }

    if (!draft.isNew && hasMeaningfulLocalGitChange(draft.draftContent, draft.originalContent)) {
      blockers.push({ kind: 'unstaged-overwrite', path: draftPath })
      seenPaths.add(draftPath)
    }
  }

  for (const path of pendingDeletePaths) {
    if (!normalizedChangedPaths.has(path) || stagedDeletePaths.has(path) || seenPaths.has(path)) {
      continue
    }

    blockers.push({ kind: 'unstaged-overwrite', path })
    seenPaths.add(path)
  }

  for (const change of pendingAssetChanges) {
    if (change.kind !== 'git-asset') {
      continue
    }

    const repoPath = normalizeGitPath(change.repoPath)
    const hasRemoteBase = typeof change.baseSha === 'string' || typeof change.originalSha === 'string'
    if (
      !normalizedChangedPaths.has(repoPath) ||
      stagedPaths.has(repoPath) ||
      seenPaths.has(repoPath)
    ) {
      continue
    }

    if (!hasRemoteBase && !Object.prototype.hasOwnProperty.call(remoteTreeMap, repoPath)) {
      continue
    }

    blockers.push({
      kind: hasRemoteBase ? 'unstaged-overwrite' : 'untracked-overwrite',
      path: repoPath,
    })
    seenPaths.add(repoPath)
  }

  return blockers
}

export function findGitDirectoryPathConflicts(
  stagedChanges: StagedGitChange[],
  pendingStructuralChanges: StagedGitChange[],
  addedPaths: string[]
): GitPullBlocker[] {
  const deletedFolderPaths = new Set<string>()

  for (const change of [...stagedChanges, ...pendingStructuralChanges]) {
    if (change.kind !== 'git-delete-folder') {
      continue
    }

    deletedFolderPaths.add(normalizeGitPath(change.repoPath))
  }

  const conflicts: GitPullBlocker[] = []
  const seenPairs = new Set<string>()

  for (const addedPath of addedPaths.map((path) => normalizeGitPath(path))) {
    for (const folderPath of deletedFolderPaths) {
      if (!addedPath.startsWith(`${folderPath}/`)) {
        continue
      }

      const conflictKey = `${folderPath}::${addedPath}`
      if (seenPairs.has(conflictKey)) {
        continue
      }

      seenPairs.add(conflictKey)
      conflicts.push({
        kind: 'directory-delete-add-file',
        path: addedPath,
        folderPath,
      })
    }
  }

  return conflicts
}

export function findGitStagedAssetConflicts(
  stagedChanges: StagedGitChange[],
  changedPaths: string[],
  remoteTreeMap: Record<string, string>
) {
  const normalizedChangedPaths = new Set(changedPaths.map((path) => normalizeGitPath(path)))
  const conflicts: string[] = []
  const seenPaths = new Set<string>()

  for (const change of stagedChanges) {
    if (change.kind !== 'git-asset') {
      continue
    }

    const repoPath = normalizeGitPath(change.repoPath)
    if (!normalizedChangedPaths.has(repoPath) || seenPaths.has(repoPath)) {
      continue
    }

    const remoteSha = remoteTreeMap[repoPath]
    const localBaseSha = change.baseSha ?? change.originalSha
    const localIsCreate = !localBaseSha
    const remoteExists = typeof remoteSha === 'string' && remoteSha.length > 0
    const remoteChangedSinceStage = localBaseSha !== remoteSha

    if ((localIsCreate && remoteExists) || (!localIsCreate && remoteChangedSinceStage)) {
      conflicts.push(repoPath)
      seenPaths.add(repoPath)
    }
  }

  return conflicts
}

export function findGitUnstagedChanges({
  drafts,
  stagedChanges,
  pendingAssetChanges: _pendingAssetChanges,
  pendingStructuralChanges: _pendingStructuralChanges,
}: UnstagedChangeInput): GitPullBlocker[] {
  const { stagedDraftByDocumentId } = buildStagedIndex(stagedChanges)
  const blockers: GitPullBlocker[] = []
  const seenPaths = new Set<string>()

  const pushBlocker = (path: string) => {
    const normalizedPath = normalizeGitPath(path)
    if (seenPaths.has(normalizedPath)) {
      return
    }

    blockers.push({ kind: 'unstaged-overwrite', path: normalizedPath })
    seenPaths.add(normalizedPath)
  }

  for (const change of stagedChanges) {
    if (change.kind !== 'git-draft' || !change.documentId) {
      continue
    }

    const draft = drafts[change.documentId]
    if (!draft) {
      continue
    }

    const stagedDraft = stagedDraftByDocumentId.get(change.documentId)
    if (!stagedDraft) {
      continue
    }

    const stagedContent = stagedDraft.content ?? ''
    if (draft.draftContent !== stagedContent) {
      pushBlocker(draft.path)
    }
  }

  return blockers
}
