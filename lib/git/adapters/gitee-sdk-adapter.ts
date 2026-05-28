import type { GitBranchRef, GitProviderClient, GitProviderConfig, GitRepoRef } from '../types'
import { withGitProviderError } from '../provider-errors'
import { getLegacyGitProviderClient } from './legacy-adapter'

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

export function createGiteeSdkClient(baseUrl: string): GitProviderClient {
  const useLegacy = (config: GitProviderConfig) => getLegacyGitProviderClient(config)

  return {
    validateConnection: (config) => withGitProviderError('gitee', async () => {
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
      const legacy = useLegacy(config)
      if (!legacy.commitBatch) {
        throw new Error('Current Git provider does not support atomic batch commits')
      }
      await legacy.commitBatch(config, message, actions)
    }),
    deleteFile: (config, path, message, sha) => withGitProviderError('gitee', async () => {
      await useLegacy(config).deleteFile(config, path, message, sha)
    }),
    renameFile: (config, oldPath, newPath, message, content, sha) => withGitProviderError('gitee', async () => {
      await useLegacy(config).renameFile(config, oldPath, newPath, message, content, sha)
    }),
    createFolder: (config, path, message) => withGitProviderError('gitee', async () => {
      await useLegacy(config).createFolder(config, path, message)
    }),
    deleteFolder: (config, path, message) => withGitProviderError('gitee', async () => {
      await useLegacy(config).deleteFolder(config, path, message)
    }),
  }
}
