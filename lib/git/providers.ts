import type {
  CustomGitFlavor,
  GitBranchRef,
  GitBatchCommitAction,
  GitFileRef,
  GitProviderClient,
  GitProviderConfig,
  GitRepoRef,
  GitTreeItem,
} from './types'
import { decodeBase64, encodeBase64, getGitFileName, joinGitPath, normalizeGitPath, safeJson } from './utils'

function getHeaders(config: GitProviderConfig) {
  const headers: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  if (!config.token) return headers

  if (config.provider === 'github' || config.provider === 'custom' && config.customFlavor === 'gitea') {
    headers.Authorization = `token ${config.token}`
    return headers
  }

  headers.Authorization = `Bearer ${config.token}`
  return headers
}

function getBaseUrl(config: GitProviderConfig, fallback: string) {
  return (config.baseUrl?.trim() || fallback).replace(/\/+$/, '')
}

function getEncodedProject(config: GitProviderConfig) {
  return encodeURIComponent(`${config.ownerOrNamespace}/${config.repo}`)
}

async function githubLikeListRepos(config: GitProviderConfig, baseUrl: string): Promise<GitRepoRef[]> {
  const headers = getHeaders(config)
  const orgUrl = `${baseUrl}/users/${encodeURIComponent(config.ownerOrNamespace)}/repos?per_page=100`
  const repos = await safeJson<any[]>(await fetch(orgUrl, { headers }))
  return repos.map((repo) => ({
    id: String(repo.id),
    name: repo.name,
    fullName: repo.full_name || `${config.ownerOrNamespace}/${repo.name}`,
    defaultBranch: repo.default_branch,
  }))
}

async function githubLikeGetBranches(config: GitProviderConfig, baseUrl: string): Promise<GitBranchRef[]> {
  const headers = getHeaders(config)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/branches?per_page=100`
  const branches = await safeJson<any[]>(await fetch(url, { headers }))
  return branches.map((branch) => ({
    name: branch.name,
    commitSha: branch.commit?.sha,
  }))
}

async function githubLikeListTree(config: GitProviderConfig, baseUrl: string, path = ''): Promise<GitTreeItem[]> {
  const headers = getHeaders(config)
  const normalizedPath = normalizeGitPath(path)
  const pathSuffix = normalizedPath ? `/${normalizedPath}` : ''
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/contents${pathSuffix}?ref=${encodeURIComponent(config.branch)}`
  const result = await safeJson<any>(await fetch(url, { headers }))
  const items = Array.isArray(result) ? result : [result]
  return items.map((item) => ({
    path: item.path,
    name: item.name,
    type: item.type === 'dir' ? 'dir' : 'file',
    sha: item.sha,
    size: item.size,
  }))
}

async function githubLikeGetFile(config: GitProviderConfig, baseUrl: string, path: string): Promise<Pick<GitFileRef, 'path' | 'name' | 'sha' | 'content'>> {
  const headers = getHeaders(config)
  const normalizedPath = normalizeGitPath(path)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/contents/${normalizedPath}?ref=${encodeURIComponent(config.branch)}`
  const result = await safeJson<any>(await fetch(url, { headers }))
  return {
    path: result.path,
    name: result.name,
    sha: result.sha,
    content: decodeBase64((result.content || '').replace(/\n/g, '')),
  }
}

async function githubLikeGetBinaryFile(config: GitProviderConfig, baseUrl: string, path: string) {
  const headers = getHeaders(config)
  const normalizedPath = normalizeGitPath(path)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/contents/${normalizedPath}?ref=${encodeURIComponent(config.branch)}`
  const result = await safeJson<any>(await fetch(url, { headers }))
  return {
    contentBase64: String(result.content || '').replace(/\n/g, ''),
    mimeType: result.type === 'file' ? undefined : undefined,
  }
}

async function githubLikePutEncodedFile(config: GitProviderConfig, baseUrl: string, path: string, encodedContent: string, message: string, sha?: string) {
  const headers = getHeaders(config)
  const normalizedPath = normalizeGitPath(path)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/contents/${normalizedPath}`
  const payload: Record<string, unknown> = {
    message,
    content: encodedContent,
    branch: config.branch,
  }
  if (sha) payload.sha = sha
  const response = await safeJson<any>(await fetch(url, { method: 'PUT', headers, body: JSON.stringify(payload) }))
  return { sha: response.content?.sha as string | undefined }
}

async function githubLikePutFile(config: GitProviderConfig, baseUrl: string, path: string, content: string, message: string, sha?: string) {
  return githubLikePutEncodedFile(config, baseUrl, path, encodeBase64(content), message, sha)
}

async function githubLikeDeleteFile(config: GitProviderConfig, baseUrl: string, path: string, message: string, sha?: string) {
  if (!sha) {
    const file = await githubLikeGetFile(config, baseUrl, path)
    sha = file.sha
  }
  const headers = getHeaders(config)
  const normalizedPath = normalizeGitPath(path)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/contents/${normalizedPath}`
  await safeJson<any>(await fetch(url, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      message,
      sha,
      branch: config.branch,
    }),
  }))
}

async function githubLikeGetReferenceSha(config: GitProviderConfig, baseUrl: string) {
  const headers = getHeaders(config)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/git/ref/heads/${encodeURIComponent(config.branch)}`
  const result = await safeJson<any>(await fetch(url, { headers }))
  return String(result.object?.sha || '')
}

async function githubLikeGetCommitTreeSha(config: GitProviderConfig, baseUrl: string, commitSha: string) {
  const headers = getHeaders(config)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/git/commits/${commitSha}`
  const result = await safeJson<any>(await fetch(url, { headers }))
  return String(result.tree?.sha || '')
}

async function githubLikeCreateBlob(
  config: GitProviderConfig,
  baseUrl: string,
  content: string,
  encoding: 'utf-8' | 'base64'
) {
  const headers = getHeaders(config)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/git/blobs`
  const result = await safeJson<any>(await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content, encoding }),
  }))
  return String(result.sha || '')
}

async function githubLikeCreateTree(
  config: GitProviderConfig,
  baseUrl: string,
  baseTree: string,
  tree: Array<Record<string, unknown>>
) {
  const headers = getHeaders(config)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/git/trees`
  const result = await safeJson<any>(await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseTree,
      tree,
    }),
  }))
  return String(result.sha || '')
}

async function githubLikeCreateCommit(
  config: GitProviderConfig,
  baseUrl: string,
  message: string,
  treeSha: string,
  parentSha: string
) {
  const headers = getHeaders(config)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/git/commits`
  const result = await safeJson<any>(await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
    }),
  }))
  return String(result.sha || '')
}

async function githubLikeUpdateReference(config: GitProviderConfig, baseUrl: string, commitSha: string) {
  const headers = getHeaders(config)
  const url = `${baseUrl}/repos/${encodeURIComponent(config.ownerOrNamespace)}/${encodeURIComponent(config.repo)}/git/refs/heads/${encodeURIComponent(config.branch)}`
  await safeJson<any>(await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      sha: commitSha,
      force: false,
    }),
  }))
}

async function githubLikeCommitBatch(
  config: GitProviderConfig,
  baseUrl: string,
  message: string,
  actions: GitBatchCommitAction[]
) {
  const headSha = await githubLikeGetReferenceSha(config, baseUrl)
  const baseTreeSha = await githubLikeGetCommitTreeSha(config, baseUrl, headSha)
  const treeEntries = await Promise.all(actions.map(async (action) => {
    if (action.kind === 'delete') {
      return {
        path: normalizeGitPath(action.path),
        mode: '100644',
        type: 'blob',
        sha: null,
      }
    }

    if (!action.content) {
      throw new Error(`Missing content for ${action.path}`)
    }

    const blobSha = await githubLikeCreateBlob(
      config,
      baseUrl,
      action.content,
      action.encoding === 'base64' ? 'base64' : 'utf-8'
    )

    return {
      path: normalizeGitPath(action.path),
      mode: '100644',
      type: 'blob',
      sha: blobSha,
    }
  }))

  const nextTreeSha = await githubLikeCreateTree(config, baseUrl, baseTreeSha, treeEntries)
  const nextCommitSha = await githubLikeCreateCommit(config, baseUrl, message, nextTreeSha, headSha)
  await githubLikeUpdateReference(config, baseUrl, nextCommitSha)
}

async function gitlabListRepos(config: GitProviderConfig, baseUrl: string): Promise<GitRepoRef[]> {
  const headers = getHeaders(config)
  const url = `${baseUrl}/projects?membership=true&simple=true&per_page=100`
  const repos = await safeJson<any[]>(await fetch(url, { headers }))
  return repos.map((repo) => ({
    id: String(repo.id),
    name: repo.name,
    fullName: repo.path_with_namespace,
    defaultBranch: repo.default_branch,
  }))
}

async function gitlabGetBranches(config: GitProviderConfig, baseUrl: string): Promise<GitBranchRef[]> {
  const headers = getHeaders(config)
  const url = `${baseUrl}/projects/${getEncodedProject(config)}/repository/branches?per_page=100`
  const branches = await safeJson<any[]>(await fetch(url, { headers }))
  return branches.map((branch) => ({
    name: branch.name,
    commitSha: branch.commit?.id,
  }))
}

async function gitlabListTree(config: GitProviderConfig, baseUrl: string, path = ''): Promise<GitTreeItem[]> {
  const headers = getHeaders(config)
  const query = new URLSearchParams({
    ref: config.branch,
    per_page: '100',
  })
  const normalizedPath = normalizeGitPath(path)
  if (normalizedPath) query.set('path', normalizedPath)
  const url = `${baseUrl}/projects/${getEncodedProject(config)}/repository/tree?${query.toString()}`
  const items = await safeJson<any[]>(await fetch(url, { headers }))
  return items.map((item) => ({
    path: item.path,
    name: item.name,
    type: item.type === 'tree' ? 'dir' : 'file',
    sha: item.id,
  }))
}

async function gitlabGetFile(config: GitProviderConfig, baseUrl: string, path: string): Promise<Pick<GitFileRef, 'path' | 'name' | 'sha' | 'content'>> {
  const headers = getHeaders(config)
  const normalizedPath = normalizeGitPath(path)
  const url = `${baseUrl}/projects/${getEncodedProject(config)}/repository/files/${encodeURIComponent(normalizedPath)}?ref=${encodeURIComponent(config.branch)}`
  const result = await safeJson<any>(await fetch(url, { headers }))
  return {
    path: result.file_path,
    name: getGitFileName(result.file_path),
    sha: result.last_commit_id,
    content: decodeBase64(result.content),
  }
}

async function gitlabGetBinaryFile(config: GitProviderConfig, baseUrl: string, path: string) {
  const headers = getHeaders(config)
  const normalizedPath = normalizeGitPath(path)
  const url = `${baseUrl}/projects/${getEncodedProject(config)}/repository/files/${encodeURIComponent(normalizedPath)}?ref=${encodeURIComponent(config.branch)}`
  const result = await safeJson<any>(await fetch(url, { headers }))
  return {
    contentBase64: String(result.content || ''),
    mimeType: undefined,
  }
}

async function gitlabCreateOrUpdateWithEncoding(
  config: GitProviderConfig,
  baseUrl: string,
  path: string,
  content: string,
  message: string,
  encoding: 'text' | 'base64',
  sha?: string
) {
  const headers = getHeaders(config)
  const normalizedPath = normalizeGitPath(path)
  const method = sha ? 'PUT' : 'POST'
  const url = `${baseUrl}/projects/${getEncodedProject(config)}/repository/files/${encodeURIComponent(normalizedPath)}`
  const response = await safeJson<any>(await fetch(url, {
    method,
    headers,
    body: JSON.stringify({
      branch: config.branch,
      content,
      commit_message: message,
      encoding,
    }),
  }))
  return { sha: response.branch || sha }
}

async function gitlabCreateOrUpdate(config: GitProviderConfig, baseUrl: string, path: string, content: string, message: string, sha?: string) {
  return gitlabCreateOrUpdateWithEncoding(config, baseUrl, path, content, message, 'text', sha)
}

async function gitlabDelete(config: GitProviderConfig, baseUrl: string, path: string, message: string) {
  const headers = getHeaders(config)
  const normalizedPath = normalizeGitPath(path)
  const url = `${baseUrl}/projects/${getEncodedProject(config)}/repository/files/${encodeURIComponent(normalizedPath)}`
  await safeJson<any>(await fetch(url, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({
      branch: config.branch,
      commit_message: message,
    }),
  }))
}

async function gitlabCommitActions(config: GitProviderConfig, baseUrl: string, message: string, actions: any[]) {
  const headers = getHeaders(config)
  const url = `${baseUrl}/projects/${getEncodedProject(config)}/repository/commits`
  await safeJson<any>(await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      branch: config.branch,
      commit_message: message,
      actions,
    }),
  }))
}

async function gitlabCommitBatch(
  config: GitProviderConfig,
  baseUrl: string,
  message: string,
  actions: GitBatchCommitAction[]
) {
  await gitlabCommitActions(
    config,
    baseUrl,
    message,
    actions.map((action) => {
      if (action.kind === 'delete') {
        return {
          action: 'delete',
          file_path: normalizeGitPath(action.path),
          ...(action.previousSha ? { last_commit_id: action.previousSha } : {}),
        }
      }

      return {
        action: action.isCreate ? 'create' : 'update',
        file_path: normalizeGitPath(action.path),
        content: action.content,
        encoding: action.encoding === 'base64' ? 'base64' : 'text',
        ...(action.previousSha ? { last_commit_id: action.previousSha } : {}),
      }
    })
  )
}

function createGithubLikeClient(baseUrl: string): GitProviderClient {
  return {
    async validateConnection(config) {
      await githubLikeGetBranches(config, baseUrl)
    },
    listRepos(config) {
      return githubLikeListRepos(config, baseUrl)
    },
    getBranches(config) {
      return githubLikeGetBranches(config, baseUrl)
    },
    listTree(config, path) {
      return githubLikeListTree(config, baseUrl, path)
    },
    getFile(config, path) {
      return githubLikeGetFile(config, baseUrl, path)
    },
    getBinaryFile(config, path) {
      return githubLikeGetBinaryFile(config, baseUrl, path)
    },
    createOrUpdateFile(config, path, content, message, sha) {
      return githubLikePutFile(config, baseUrl, path, content, message, sha)
    },
    createOrUpdateBinaryFile(config, path, contentBase64, message, sha) {
      return githubLikePutEncodedFile(config, baseUrl, path, contentBase64, message, sha)
    },
    commitBatch(config, message, actions) {
      return githubLikeCommitBatch(config, baseUrl, message, actions)
    },
    deleteFile(config, path, message, sha) {
      return githubLikeDeleteFile(config, baseUrl, path, message, sha)
    },
    async renameFile(config, oldPath, newPath, message, content, sha) {
      await githubLikePutFile(config, baseUrl, newPath, content, message)
      await githubLikeDeleteFile(config, baseUrl, oldPath, `${message} (cleanup old path)`, sha)
    },
    async createFolder(config, path, message) {
      await githubLikePutFile(config, baseUrl, joinGitPath(path, '.gitkeep'), '', message)
    },
    async deleteFolder(config, path, message) {
      const items = await githubLikeListTree(config, baseUrl, path)
      const nonPlaceholder = items.filter((item) => item.name !== '.gitkeep')
      if (nonPlaceholder.length > 0) {
        throw new Error('Folder is not empty')
      }
      const placeholder = items.find((item) => item.name === '.gitkeep')
      if (placeholder) {
        await githubLikeDeleteFile(config, baseUrl, placeholder.path, message, placeholder.sha)
      }
    },
  }
}

function createGitlabClient(baseUrl: string): GitProviderClient {
  return {
    async validateConnection(config) {
      await gitlabGetBranches(config, baseUrl)
    },
    listRepos(config) {
      return gitlabListRepos(config, baseUrl)
    },
    getBranches(config) {
      return gitlabGetBranches(config, baseUrl)
    },
    listTree(config, path) {
      return gitlabListTree(config, baseUrl, path)
    },
    getFile(config, path) {
      return gitlabGetFile(config, baseUrl, path)
    },
    getBinaryFile(config, path) {
      return gitlabGetBinaryFile(config, baseUrl, path)
    },
    createOrUpdateFile(config, path, content, message, sha) {
      return gitlabCreateOrUpdate(config, baseUrl, path, content, message, sha)
    },
    createOrUpdateBinaryFile(config, path, contentBase64, message, sha) {
      return gitlabCreateOrUpdateWithEncoding(config, baseUrl, path, contentBase64, message, 'base64', sha)
    },
    commitBatch(config, message, actions) {
      return gitlabCommitBatch(config, baseUrl, message, actions)
    },
    deleteFile(config, path, message) {
      return gitlabDelete(config, baseUrl, path, message)
    },
    async renameFile(config, oldPath, newPath, message) {
      await gitlabCommitActions(config, baseUrl, message, [
        { action: 'move', file_path: normalizeGitPath(newPath), previous_path: normalizeGitPath(oldPath) },
      ])
    },
    async createFolder(config, path, message) {
      await gitlabCreateOrUpdate(config, baseUrl, joinGitPath(path, '.gitkeep'), '', message)
    },
    async deleteFolder(config, path, message) {
      const items = await gitlabListTree(config, baseUrl, path)
      const nonPlaceholder = items.filter((item) => item.name !== '.gitkeep')
      if (nonPlaceholder.length > 0) {
        throw new Error('Folder is not empty')
      }
      const placeholder = items.find((item) => item.name === '.gitkeep')
      if (placeholder) {
        await gitlabDelete(config, baseUrl, placeholder.path, message)
      }
    },
  }
}

export function getGitProviderClient(config: GitProviderConfig): GitProviderClient {
  if (config.provider === 'github') {
    return createGithubLikeClient(getBaseUrl(config, 'https://api.github.com'))
  }

  if (config.provider === 'gitee') {
    return createGithubLikeClient(getBaseUrl(config, 'https://gitee.com/api/v5'))
  }

  if (config.provider === 'gitlab') {
    return createGitlabClient(getBaseUrl(config, 'https://gitlab.com/api/v4'))
  }

  const flavor: CustomGitFlavor = config.customFlavor || 'gitlab'
  if (flavor === 'gitea') {
    return createGithubLikeClient(getBaseUrl(config, ''))
  }

  return createGitlabClient(getBaseUrl(config, ''))
}
