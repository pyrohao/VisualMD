export type GitProvider = 'github' | 'gitlab' | 'gitee' | 'custom'

export type CustomGitFlavor = 'gitlab' | 'gitea'

export type GitSourceType = 'local' | 'git'

export type GitFileKind = 'text' | 'image' | 'audio' | 'video' | 'pdf' | 'binary'

export type GitDraftStatus =
  | 'clean'
  | 'dirty'
  | 'conflict'

export interface GitProviderConfig {
  provider: GitProvider
  token: string
  ownerOrNamespace: string
  repo: string
  branch: string
  baseUrl?: string
  customFlavor?: CustomGitFlavor
}

export interface GitRepoRef {
  id: string
  name: string
  fullName: string
  defaultBranch?: string
}

export interface BranchDto {
  name: string
  commitSha?: string
}

export interface GitBranchRef extends BranchDto {}

export interface RemoteTreeEntryDto {
  path: string
  name: string
  type: 'file' | 'dir'
  sha?: string
  size?: number
}

export interface GitTreeItem extends RemoteTreeEntryDto {}

export interface GitRemoteSnapshotEntry extends RemoteTreeEntryDto {}

export interface GitRemoteSnapshotState {
  branch: string
  fetchedAt: number
  entriesByPath: Record<string, GitRemoteSnapshotEntry>
  treeByPath: Record<string, GitTreeItem[]>
}

export interface RemoteTextFileDto {
  path: string
  name: string
  sha?: string
  content: string
}

export interface GitRemoteTextCacheEntry extends RemoteTextFileDto {
  loadedAt: number
}

export interface RemoteBinaryFileDto {
  path: string
  name: string
  sha?: string
  contentBase64: string
  mimeType?: string
}

export interface GitFileRef extends RemoteTextFileDto {
  documentId: string
  provider: GitProvider
  repo: string
  ownerOrNamespace: string
  branch: string
}

export interface GitConflictSnapshot {
  kind?: 'content' | 'modify-delete' | 'path' | 'rename'
  baseContent: string
  baseSha?: string
  localContent: string
  remoteContent: string
  remoteSha?: string
  remoteMissing?: boolean
  resolvedContent?: string
  pathHint?: string
}

export interface GitDraftFile extends GitFileRef {
  originalContent: string
  draftContent: string
  isDirty: boolean
  isNew?: boolean
  localFileId?: string
  renamedFromPath?: string
  renamedFromSha?: string
  fileOrigin?: 'remote' | 'local'
  status?: GitDraftStatus
  remoteContent?: string
  remoteSha?: string
  remoteMissing?: boolean
  hasRemoteUpdates?: boolean
  hasConflict?: boolean
  conflictResolvedContent?: string
  conflictSnapshot?: GitConflictSnapshot
  lastCheckedAt?: number
}

export interface StagedGitChange {
  id: string
  kind: 'git-draft' | 'git-asset' | 'git-delete-file' | 'git-delete-folder' | 'git-create-folder'
  label: string
  repoPath: string
  documentId?: string
  content?: string
  originalContent?: string
  baseSha?: string
  originalSha?: string
  blobSha?: string
  renamedFromPath?: string
  renamedFromSha?: string
  contentBase64?: string
  mimeType?: string
  shelvedDrafts?: GitDraftFile[]
  shelvedStagedChanges?: StagedGitChange[]
  shelvedPendingAssetChanges?: StagedGitChange[]
  shelvedPendingStructuralChanges?: StagedGitChange[]
  updatedAt: number
}

export interface GitBatchCommitAction {
  kind: 'upsert' | 'delete'
  path: string
  content?: string
  encoding?: 'text' | 'base64'
  previousSha?: string
  isCreate?: boolean
}

export interface GitProviderClient {
  validateConnection(config: GitProviderConfig): Promise<void>
  listRepos(config: GitProviderConfig): Promise<GitRepoRef[]>
  getBranches(config: GitProviderConfig): Promise<BranchDto[]>
  listTree(config: GitProviderConfig, path?: string): Promise<RemoteTreeEntryDto[]>
  getFile(config: GitProviderConfig, path: string): Promise<RemoteTextFileDto>
  getBinaryFile?(config: GitProviderConfig, path: string): Promise<RemoteBinaryFileDto>
  createOrUpdateFile(
    config: GitProviderConfig,
    path: string,
    content: string,
    message: string,
    sha?: string
  ): Promise<{ sha?: string }>
  createOrUpdateBinaryFile?(
    config: GitProviderConfig,
    path: string,
    contentBase64: string,
    message: string,
    sha?: string
  ): Promise<{ sha?: string }>
  commitBatch?(config: GitProviderConfig, message: string, actions: GitBatchCommitAction[]): Promise<void>
  deleteFile(config: GitProviderConfig, path: string, message: string, sha?: string): Promise<void>
  renameFile(config: GitProviderConfig, oldPath: string, newPath: string, message: string, content: string, sha?: string): Promise<void>
  createFolder(config: GitProviderConfig, path: string, message: string): Promise<void>
  deleteFolder(config: GitProviderConfig, path: string, message: string): Promise<void>
}
