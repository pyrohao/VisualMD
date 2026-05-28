import { Octokit } from 'octokit'
import type { GitBatchCommitAction, GitBranchRef, GitFileRef, GitProviderClient, GitProviderConfig, GitRepoRef, GitTreeItem } from '../types'
import { arrayBufferToBase64, decodeBase64, encodeBase64, getGitFileName, joinGitPath, normalizeGitPath } from '../utils'
import { withGitProviderError } from '../provider-errors'

type GitHubContent = {
  path?: string
  name?: string
  sha?: string
  type?: string
  size?: number
  encoding?: string
  content?: string
  download_url?: string | null
}

function getRequestBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim()
  return trimmed || 'https://api.github.com'
}

function toTreeItem(item: GitHubContent): GitTreeItem {
  return {
    path: normalizeGitPath(item.path || ''),
    name: item.name || getGitFileName(item.path || ''),
    type: item.type === 'dir' ? 'dir' : 'file',
    sha: item.sha,
    size: item.size,
  }
}

function createOctokitClient(config: GitProviderConfig, baseUrl: string) {
  return new Octokit({
    auth: config.token,
    baseUrl: getRequestBaseUrl(baseUrl),
  })
}

async function readGitHubContent(
  octokit: Octokit,
  config: GitProviderConfig,
  path: string
): Promise<GitHubContent | GitHubContent[]> {
  const normalizedPath = normalizeGitPath(path)
  const response = await octokit.rest.repos.getContent({
    owner: config.ownerOrNamespace,
    repo: config.repo,
    path: normalizedPath || '',
    ref: config.branch || undefined,
  })
  return response.data as GitHubContent | GitHubContent[]
}

async function listReposViaSdk(octokit: Octokit, config: GitProviderConfig): Promise<GitRepoRef[]> {
  const username = config.ownerOrNamespace
  const normalize = (repos: Array<{ id: number; name: string; full_name?: string; default_branch?: string }>) => (
    repos.map((repo) => ({
      id: String(repo.id),
      name: repo.name,
      fullName: repo.full_name || `${username}/${repo.name}`,
      defaultBranch: repo.default_branch,
    }))
  )

  try {
    const userRepos = await octokit.paginate(octokit.rest.repos.listForUser, {
      username,
      per_page: 100,
    })
    if (userRepos.length > 0) {
      return normalize(userRepos)
    }
  } catch {
    // try organization endpoint next
  }

  const orgRepos = await octokit.paginate(octokit.rest.repos.listForOrg, {
    org: username,
    per_page: 100,
    type: 'all',
  })
  return normalize(orgRepos)
}

async function readGitHubTextContent(
  octokit: Octokit,
  config: GitProviderConfig,
  path: string
): Promise<Pick<GitFileRef, 'path' | 'name' | 'sha' | 'content'>> {
  const result = await readGitHubContent(octokit, config, path)
  if (Array.isArray(result)) {
    throw new Error('Target path is a directory')
  }

  const content = result.content
    ? decodeBase64(result.content.replace(/\n/g, ''))
    : await (async () => {
      if (!result.download_url) return ''
      const response = await fetch(result.download_url, {
        headers: {
          Authorization: `token ${config.token}`,
          Accept: 'application/vnd.github.raw',
        },
      })
      if (!response.ok) {
        throw new Error(`Failed to download remote file: HTTP ${response.status}`)
      }
      return response.text()
    })()

  return {
    path: normalizeGitPath(result.path || path),
    name: result.name || getGitFileName(result.path || path),
    sha: result.sha,
    content,
  }
}

async function readGitHubBinaryContent(
  octokit: Octokit,
  config: GitProviderConfig,
  path: string
): Promise<{ contentBase64: string; mimeType?: string }> {
  const result = await readGitHubContent(octokit, config, path)
  if (Array.isArray(result)) {
    throw new Error('Target path is a directory')
  }

  if (result.content && result.encoding === 'base64') {
    return { contentBase64: result.content.replace(/\n/g, '') }
  }

  if (!result.download_url) {
    return { contentBase64: '' }
  }

  const response = await fetch(result.download_url, {
    headers: {
      Authorization: `token ${config.token}`,
      Accept: 'application/vnd.github.raw',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to download remote file: HTTP ${response.status}`)
  }

  const mimeType = response.headers.get('content-type') || undefined
  const buffer = await response.arrayBuffer()
  return { contentBase64: arrayBufferToBase64(buffer), mimeType }
}

async function createOrUpdateGitHubFile(
  octokit: Octokit,
  config: GitProviderConfig,
  path: string,
  contentBase64: string,
  message: string,
  sha?: string
) {
  const response = await octokit.rest.repos.createOrUpdateFileContents({
    owner: config.ownerOrNamespace,
    repo: config.repo,
    path: normalizeGitPath(path),
    message,
    content: contentBase64,
    branch: config.branch || undefined,
    sha: sha || undefined,
  })
  return { sha: response.data.content?.sha }
}

async function deleteGitHubFile(
  octokit: Octokit,
  config: GitProviderConfig,
  path: string,
  message: string,
  sha?: string
) {
  const normalizedPath = normalizeGitPath(path)
  const fileSha = sha || (await readGitHubTextContent(octokit, config, normalizedPath)).sha
  if (!fileSha) {
    throw new Error(`Missing file sha for ${normalizedPath}`)
  }

  await octokit.rest.repos.deleteFile({
    owner: config.ownerOrNamespace,
    repo: config.repo,
    path: normalizedPath,
    message,
    sha: fileSha,
    branch: config.branch || undefined,
  })
}

async function commitBatchViaGitData(
  octokit: Octokit,
  config: GitProviderConfig,
  message: string,
  actions: GitBatchCommitAction[]
) {
  const owner = config.ownerOrNamespace
  const repo = config.repo
  const branch = config.branch

  const refResponse = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  })
  const headSha = refResponse.data.object.sha

  const commitResponse = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: headSha,
  })
  const baseTreeSha = commitResponse.data.tree.sha

  const treeEntries = await Promise.all(actions.map(async (action) => {
    const normalizedPath = normalizeGitPath(action.path)

    if (action.kind === 'delete') {
      return {
        path: normalizedPath,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: null,
      }
    }

    if (action.content === undefined) {
      throw new Error(`Missing content for ${normalizedPath}`)
    }

    const blob = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: action.content,
      encoding: action.encoding === 'base64' ? 'base64' : 'utf-8',
    })

    return {
      path: normalizedPath,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: blob.data.sha,
    }
  }))

  const tree = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeEntries,
  })

  const commit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.data.sha,
    parents: [headSha],
  })

  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.data.sha,
    force: false,
  })
}

export function createGithubSdkClient(baseUrl: string): GitProviderClient {
  return {
    validateConnection: (config) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      await octokit.rest.repos.get({
        owner: config.ownerOrNamespace,
        repo: config.repo,
      })
    }),
    listRepos: (config) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      return listReposViaSdk(octokit, config)
    }),
    getBranches: (config) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      const branches = await octokit.paginate(octokit.rest.repos.listBranches, {
        owner: config.ownerOrNamespace,
        repo: config.repo,
        per_page: 100,
      })
      return branches.map((branch) => ({
        name: branch.name,
        commitSha: branch.commit.sha,
      })) as GitBranchRef[]
    }),
    listTree: (config, path = '') => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      const result = await readGitHubContent(octokit, config, path)
      const items = Array.isArray(result) ? result : [result]
      return items.map((item) => toTreeItem(item))
    }),
    getFile: (config, path) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      return readGitHubTextContent(octokit, config, path)
    }),
    getBinaryFile: (config, path) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      return readGitHubBinaryContent(octokit, config, path)
    }),
    createOrUpdateFile: (config, path, content, message, sha) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      return createOrUpdateGitHubFile(octokit, config, path, encodeBase64(content), message, sha)
    }),
    createOrUpdateBinaryFile: (config, path, contentBase64, message, sha) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      return createOrUpdateGitHubFile(octokit, config, path, contentBase64, message, sha)
    }),
    commitBatch: (config, message, actions) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      await commitBatchViaGitData(octokit, config, message, actions)
    }),
    deleteFile: (config, path, message, sha) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      await deleteGitHubFile(octokit, config, path, message, sha)
    }),
    renameFile: (config, oldPath, newPath, message, content, sha) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      await createOrUpdateGitHubFile(octokit, config, newPath, encodeBase64(content), message)
      await deleteGitHubFile(octokit, config, oldPath, `${message} (cleanup old path)`, sha)
    }),
    createFolder: (config, path, message) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      await createOrUpdateGitHubFile(octokit, config, joinGitPath(path, '.gitkeep'), encodeBase64(''), message)
    }),
    deleteFolder: (config, path, message) => withGitProviderError('github', async () => {
      const octokit = createOctokitClient(config, baseUrl)
      const items = await (async () => {
        const result = await readGitHubContent(octokit, config, path)
        return Array.isArray(result) ? result : [result]
      })()
      const nonPlaceholder = items.filter((item) => item.name !== '.gitkeep')
      if (nonPlaceholder.length > 0) {
        throw new Error('Folder is not empty')
      }
      const placeholder = items.find((item) => item.name === '.gitkeep')
      if (placeholder?.path) {
        await deleteGitHubFile(octokit, config, placeholder.path, message, placeholder.sha)
      }
    }),
  }
}
