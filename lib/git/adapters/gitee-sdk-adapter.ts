import type { GitBranchRef, GitProviderClient, GitProviderConfig, GitRepoRef } from '../types'
import { withGitProviderError } from '../provider-errors'
import { getLegacyGitProviderClient } from './legacy-adapter'
import type { GitBatchCommitAction } from '../types'
import { joinGitPath, normalizeGitPath, safeJson } from '../utils'

type GiteeSdkModule = {
  client?: {
    setConfig?: (config: Record<string, unknown>) => unknown
  }
  getV5ReposOwnerRepo?: (data: unknown) => Promise<unknown>
  getV5UsersUsernameRepos?: (data: unknown) => Promise<unknown>
  getV5OrgsOrgRepos?: (data: unknown) => Promise<unknown>
  getV5ReposOwnerRepoBranches?: (data: unknown) => Promise<unknown>
}

type SdkResponse<T> = { data?: T } & T
type GiteeContentResponse = {
  path?: string
  sha?: string
  type?: string
  commit?: {
    sha?: string
  }
}
type GiteeCommitSummary = {
  sha?: string
}
type GiteeRemoteFileState = {
  exists: boolean
  lastCommitId?: string
}

type GiteeCommitActionPayload = {
  action: 'create' | 'update' | 'delete'
  path: string
  content?: string
  encoding?: 'text' | 'base64'
  last_commit_id?: string
}

const runtimeImport = new Function(
  'specifier',
  'return import(specifier);'
) as (specifier: string) => Promise<unknown>

let giteeSdkPromise: Promise<GiteeSdkModule | null> | null = null

function getRequestBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim()
  return trimmed || 'https://gitee.com/api/v5'
}

function unwrap<T>(response: SdkResponse<T>): T {
  if (response && typeof response === 'object' && 'data' in response && response.data !== undefined) {
    return response.data as T
  }
  return response as T
}

async function loadGiteeSdkModule(): Promise<GiteeSdkModule | null> {
  if (!giteeSdkPromise) {
    // Upstream SDK has incompatible static exports for current toolchain.
    // Use runtime import so Turbopack does not statically evaluate the module.
    giteeSdkPromise = runtimeImport('@gitee/typescript-sdk-v5')
      .then((module) => module as GiteeSdkModule)
      .catch(() => null)
  }
  return giteeSdkPromise
}

async function withSdkModule<T>(
  baseUrl: string,
  task: (sdk: GiteeSdkModule) => Promise<T | null>
): Promise<T | null> {
  const sdk = await loadGiteeSdkModule()
  if (!sdk) return null

  sdk.client?.setConfig?.({
    baseURL: getRequestBaseUrl(baseUrl),
    throwOnError: true,
  })

  return task(sdk)
}

async function tryValidateWithSdk(config: GitProviderConfig, baseUrl: string) {
  return withSdkModule(baseUrl, async (sdk) => {
    if (!sdk.getV5ReposOwnerRepo) return null
    await sdk.getV5ReposOwnerRepo({
      path: {
        owner: config.ownerOrNamespace,
        repo: config.repo,
      },
      query: {
        accessToken: config.token,
      },
    })
    return true
  })
}

async function validateWithRawRepoName(config: GitProviderConfig, baseUrl: string) {
  const normalizedBaseUrl = getRequestBaseUrl(baseUrl).replace(/\/+$/, '')
  const owner = config.ownerOrNamespace.trim()
  const repo = config.repo.trim()
  const token = config.token.trim()

  const headers: HeadersInit = {
    Accept: 'application/json',
  }
  if (token) {
    headers.Authorization = `token ${token}`
  }

  const query = new URLSearchParams()
  if (token) {
    query.set('access_token', token)
  }

  const queryString = query.toString()
  const url = `${normalizedBaseUrl}/repos/${encodeURIComponent(owner)}/${repo}${queryString ? `?${queryString}` : ''}`
  await safeJson<unknown>(await fetch(url, { headers }))
}

async function tryListReposWithSdk(config: GitProviderConfig, baseUrl: string): Promise<GitRepoRef[] | null> {
  return withSdkModule(baseUrl, async (sdk) => {
    if (!sdk.getV5UsersUsernameRepos && !sdk.getV5OrgsOrgRepos) return null

    if (sdk.getV5UsersUsernameRepos) {
      try {
        const response = await sdk.getV5UsersUsernameRepos({
          path: { username: config.ownerOrNamespace },
          query: {
            accessToken: config.token,
            perPage: 100,
            page: 1,
          },
        })
        const repos = unwrap(response as SdkResponse<Array<{
          id?: number
          name?: string
          full_name?: string
          path_with_namespace?: string
          default_branch?: string
        }>>)

        if (Array.isArray(repos) && repos.length > 0) {
          return repos.map((repo) => ({
            id: String(repo.id || repo.full_name || repo.name || ''),
            name: repo.name || '',
            fullName: repo.full_name || repo.path_with_namespace || `${config.ownerOrNamespace}/${repo.name || ''}`,
            defaultBranch: repo.default_branch,
          }))
        }
      } catch {
        // try org endpoint fallback
      }
    }

    if (!sdk.getV5OrgsOrgRepos) return null

    const response = await sdk.getV5OrgsOrgRepos({
      path: { org: config.ownerOrNamespace },
      query: {
        accessToken: config.token,
        perPage: 100,
        page: 1,
        type: 'all',
      },
    })
    const repos = unwrap(response as SdkResponse<Array<{
      id?: number
      name?: string
      full_name?: string
      path_with_namespace?: string
      default_branch?: string
    }>>)

    if (!Array.isArray(repos)) return null
    return repos.map((repo) => ({
      id: String(repo.id || repo.full_name || repo.name || ''),
      name: repo.name || '',
      fullName: repo.full_name || repo.path_with_namespace || `${config.ownerOrNamespace}/${repo.name || ''}`,
      defaultBranch: repo.default_branch,
    }))
  })
}

async function tryGetBranchesWithSdk(config: GitProviderConfig, baseUrl: string): Promise<GitBranchRef[] | null> {
  return withSdkModule(baseUrl, async (sdk) => {
    if (!sdk.getV5ReposOwnerRepoBranches) return null

    const response = await sdk.getV5ReposOwnerRepoBranches({
      path: {
        owner: config.ownerOrNamespace,
        repo: config.repo,
      },
      query: {
        accessToken: config.token,
        perPage: 100,
        page: 1,
      },
    })

    const branches = unwrap(response as SdkResponse<Array<{ name?: string; commit?: string }>>)
    if (!Array.isArray(branches)) return null

    return branches
      .filter((branch) => !!branch.name)
      .map((branch) => ({
        name: branch.name || '',
        commitSha: branch.commit,
      }))
  })
}

function getGiteeRepoUrl(
  baseUrl: string,
  owner: string,
  repo: string,
  endpoint: string,
  token?: string,
  queryParams?: Record<string, string | undefined>
) {
  const normalizedBaseUrl = getRequestBaseUrl(baseUrl).replace(/\/+$/, '')
  const query = new URLSearchParams()
  if (token) {
    query.set('access_token', token)
  }
  Object.entries(queryParams || {}).forEach(([key, value]) => {
    if (!value) return
    query.set(key, value)
  })
  const queryString = query.toString()
  return `${normalizedBaseUrl}/repos/${encodeURIComponent(owner)}/${repo}${endpoint}${queryString ? `?${queryString}` : ''}`
}

function getGiteeHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) {
    headers.Authorization = `token ${token}`
  }
  return headers
}

function encodeGitPathForUrl(path: string) {
  return normalizeGitPath(path)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

async function tryGetLatestCommitIdForPath(
  config: GitProviderConfig,
  baseUrl: string,
  normalizedPath: string
) {
  const owner = config.ownerOrNamespace.trim()
  const repo = config.repo.trim()
  const token = config.token.trim()
  const url = getGiteeRepoUrl(baseUrl, owner, repo, '/commits', token, {
    sha: config.branch,
    path: normalizedPath,
    page: '1',
    per_page: '1',
  })

  try {
    const commits = await safeJson<GiteeCommitSummary[]>(
      await fetch(url, {
        headers: getGiteeHeaders(token),
      })
    )
    return Array.isArray(commits) ? commits[0]?.sha : undefined
  } catch {
    return undefined
  }
}

async function getGiteeRemoteFileState(
  config: GitProviderConfig,
  baseUrl: string,
  normalizedPath: string
): Promise<GiteeRemoteFileState> {
  const owner = config.ownerOrNamespace.trim()
  const repo = config.repo.trim()
  const token = config.token.trim()
  const url = getGiteeRepoUrl(
    baseUrl,
    owner,
    repo,
    `/contents/${encodeGitPathForUrl(normalizedPath)}`,
    token,
    { ref: config.branch }
  )

  const response = await fetch(url, {
    headers: getGiteeHeaders(token),
  })

  if (response.status === 404) {
    return { exists: false }
  }

  const result = await safeJson<GiteeContentResponse | GiteeContentResponse[]>(response)
  const payload = Array.isArray(result) ? result[0] : result
  const inlineCommitId = typeof payload?.commit?.sha === 'string' ? payload.commit.sha : undefined

  return {
    exists: true,
    lastCommitId: inlineCommitId || await tryGetLatestCommitIdForPath(config, baseUrl, normalizedPath),
  }
}

function getParentDirectoryPaths(path: string) {
  const normalizedPath = normalizeGitPath(path)
  const segments = normalizedPath.split('/').filter(Boolean)
  const parentPaths: string[] = []

  for (let index = 0; index < segments.length - 1; index += 1) {
    parentPaths.push(segments.slice(0, index + 1).join('/'))
  }

  return parentPaths
}

async function buildGiteeCommitActionPayload(
  config: GitProviderConfig,
  baseUrl: string,
  action: GitBatchCommitAction,
  getRemoteState: (path: string) => Promise<GiteeRemoteFileState>
): Promise<GiteeCommitActionPayload> {
  const normalizedPath = normalizeGitPath(action.path)
  const remoteState = await getRemoteState(normalizedPath)

  if (action.kind === 'delete') {
    return {
      action: 'delete',
      path: normalizedPath,
      ...(remoteState.lastCommitId ? { last_commit_id: remoteState.lastCommitId } : {}),
    }
  }

  if (action.content === undefined) {
    throw new Error(`Missing content for ${action.path}`)
  }

  const actionType: 'create' | 'update' =
    action.isCreate === true
      ? 'create'
      : remoteState.exists
        ? 'update'
        : 'create'

  return {
    action: actionType,
    path: normalizedPath,
    content: action.content,
    encoding: action.encoding === 'base64' ? 'base64' : 'text',
    ...(actionType === 'update' && remoteState.lastCommitId
      ? { last_commit_id: remoteState.lastCommitId }
      : {}),
  }
}

async function commitBatchViaCommitsApi(
  config: GitProviderConfig,
  baseUrl: string,
  message: string,
  actions: GitBatchCommitAction[]
) {
  const owner = config.ownerOrNamespace.trim()
  const repo = config.repo.trim()
  const token = config.token.trim()
  const remoteStateCache = new Map<string, Promise<GiteeRemoteFileState>>()

  const getRemoteState = (path: string) => {
    const normalizedPath = normalizeGitPath(path)
    const cached = remoteStateCache.get(normalizedPath)
    if (cached) return cached
    const pendingState = getGiteeRemoteFileState(config, baseUrl, normalizedPath)
    remoteStateCache.set(normalizedPath, pendingState)
    return pendingState
  }

  const normalizedActionPaths = new Set(actions.map((action) => normalizeGitPath(action.path)))
  const placeholderPaths = new Set<string>()

  for (const action of actions) {
    if (action.kind !== 'upsert') {
      continue
    }

    for (const parentPath of getParentDirectoryPaths(action.path)) {
      const placeholderPath = joinGitPath(parentPath, '.gitkeep')
      if (normalizedActionPaths.has(placeholderPath)) {
        continue
      }

      const remoteState = await getRemoteState(placeholderPath)
      if (remoteState.exists) {
        continue
      }

      placeholderPaths.add(placeholderPath)
    }
  }

  const placeholderActions: GitBatchCommitAction[] = Array.from(placeholderPaths)
    .sort((left, right) => left.split('/').length - right.split('/').length)
    .map((path) => ({
      kind: 'upsert',
      path,
      content: '',
      encoding: 'text',
      isCreate: true,
    }))

  const resolvedActions = await Promise.all(
    [...placeholderActions, ...actions].map((action) =>
      buildGiteeCommitActionPayload(config, baseUrl, action, getRemoteState)
    )
  )

  const payload = {
    branch: config.branch,
    message,
    actions: resolvedActions,
  }

  const url = getGiteeRepoUrl(baseUrl, owner, repo, '/commits', token)
  await safeJson<unknown>(
    await fetch(url, {
      method: 'POST',
      headers: getGiteeHeaders(token),
      body: JSON.stringify(payload),
    })
  )
}

export function createGiteeSdkClient(baseUrl: string): GitProviderClient {
  const useLegacy = (config: GitProviderConfig) => getLegacyGitProviderClient(config)

  return {
    validateConnection: (config) => withGitProviderError('gitee', async () => {
      await validateWithRawRepoName(config, baseUrl)
      const usedSdk = await tryValidateWithSdk(config, baseUrl)
      if (usedSdk) return
      await useLegacy(config).validateConnection(config)
    }),
    listRepos: (config) => withGitProviderError('gitee', async () => {
      const repos = await tryListReposWithSdk(config, baseUrl)
      if (repos) return repos
      return useLegacy(config).listRepos(config)
    }),
    getBranches: (config) => withGitProviderError('gitee', async () => {
      const branches = await tryGetBranchesWithSdk(config, baseUrl)
      if (branches) return branches
      return useLegacy(config).getBranches(config)
    }),
    // SDK fallback for endpoints with known OpenAPI generation gaps (formData / optional path patterns).
    listTree: (config, path) => withGitProviderError('gitee', async () => useLegacy(config).listTree(config, path)),
    getFile: (config, path) => withGitProviderError('gitee', async () => useLegacy(config).getFile(config, path)),
    getBinaryFile: (config, path) => withGitProviderError('gitee', async () => {
      const legacy = useLegacy(config)
      if (!legacy.getBinaryFile) {
        throw new Error('Current Git provider does not support binary file fetch')
      }
      return legacy.getBinaryFile(config, path)
    }),
    createOrUpdateFile: (config, path, content, message, sha) => withGitProviderError('gitee', async () => {
      return useLegacy(config).createOrUpdateFile(config, path, content, message, sha)
    }),
    createOrUpdateBinaryFile: (config, path, contentBase64, message, sha) => withGitProviderError('gitee', async () => {
      const legacy = useLegacy(config)
      if (!legacy.createOrUpdateBinaryFile) {
        throw new Error('Current Git provider does not support binary uploads')
      }
      return legacy.createOrUpdateBinaryFile(config, path, contentBase64, message, sha)
    }),
    commitBatch: (config, message, actions) => withGitProviderError('gitee', async () => {
      await commitBatchViaCommitsApi(config, baseUrl, message, actions)
    }),
    deleteFile: (config, path, message, sha) => withGitProviderError('gitee', async () => {
      await useLegacy(config).deleteFile(config, path, message, sha)
    }),
    renameFile: (config, oldPath, newPath, message, content, sha) => withGitProviderError('gitee', async () => {
      await useLegacy(config).renameFile(config, oldPath, newPath, message, content, sha)
    }),
    createFolder: (config, path, message) => withGitProviderError('gitee', async () => {
      await commitBatchViaCommitsApi(config, baseUrl, message, [
        {
          kind: 'upsert',
          path: joinGitPath(path, '.gitkeep'),
          content: '',
          encoding: 'text',
          isCreate: true,
        },
      ])
    }),
    deleteFolder: (config, path, message) => withGitProviderError('gitee', async () => {
      await useLegacy(config).deleteFolder(config, path, message)
    }),
  }
}
