export type GitProvider = 'github' | 'gitlab' | 'gitee' | 'custom'

export type CustomGitFlavor = 'gitlab' | 'gitea'

export type GitSourceType = 'local' | 'git'

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

export interface GitBranchRef {
  name: string
  commitSha?: string
}

export interface GitTreeItem {
  path: string
  name: string
  type: 'file' | 'dir'
  sha?: string
  size?: number
}

export interface GitFileRef {
  documentId: string
  path: string
  name: string
  sha?: string
  content: string
  provider: GitProvider
  repo: string
  ownerOrNamespace: string
  branch: string
}

export interface GitDraftFile extends GitFileRef {
  originalContent: string
  draftContent: string
  isDirty: boolean
}

export interface GitProviderClient {
  validateConnection(config: GitProviderConfig): Promise<void>
  listRepos(config: GitProviderConfig): Promise<GitRepoRef[]>
  getBranches(config: GitProviderConfig): Promise<GitBranchRef[]>
  listTree(config: GitProviderConfig, path?: string): Promise<GitTreeItem[]>
  getFile(config: GitProviderConfig, path: string): Promise<Pick<GitFileRef, 'path' | 'name' | 'sha' | 'content'>>
  createOrUpdateFile(
    config: GitProviderConfig,
    path: string,
    content: string,
    message: string,
    sha?: string
  ): Promise<{ sha?: string }>
  deleteFile(config: GitProviderConfig, path: string, message: string, sha?: string): Promise<void>
  renameFile(config: GitProviderConfig, oldPath: string, newPath: string, message: string, content: string, sha?: string): Promise<void>
  createFolder(config: GitProviderConfig, path: string, message: string): Promise<void>
  deleteFolder(config: GitProviderConfig, path: string, message: string): Promise<void>
}
