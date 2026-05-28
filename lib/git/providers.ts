import type { GitProviderClient, GitProviderConfig } from './types'
import { getLegacyGitProviderClient } from './adapters/legacy-adapter'

type ClientFactory = () => Promise<GitProviderClient>

function getBaseUrl(config: GitProviderConfig, fallback: string) {
  return (config.baseUrl?.trim() || fallback).replace(/\/+$/, '')
}

function createLazyClient(factory: ClientFactory): GitProviderClient {
  let clientPromise: Promise<GitProviderClient> | null = null

  const getClient = () => {
    if (!clientPromise) {
      clientPromise = factory()
    }
    return clientPromise
  }

  return {
    validateConnection: async (config) => (await getClient()).validateConnection(config),
    listRepos: async (config) => (await getClient()).listRepos(config),
    getBranches: async (config) => (await getClient()).getBranches(config),
    listTree: async (config, path) => (await getClient()).listTree(config, path),
    getFile: async (config, path) => (await getClient()).getFile(config, path),
    getBinaryFile: async (config, path) => {
      const client = await getClient()
      if (!client.getBinaryFile) {
        throw new Error('Current Git provider does not support binary file fetch')
      }
      return client.getBinaryFile(config, path)
    },
    createOrUpdateFile: async (config, path, content, message, sha) =>
      (await getClient()).createOrUpdateFile(config, path, content, message, sha),
    createOrUpdateBinaryFile: async (config, path, contentBase64, message, sha) => {
      const client = await getClient()
      if (!client.createOrUpdateBinaryFile) {
        throw new Error('Current Git provider does not support binary uploads')
      }
      return client.createOrUpdateBinaryFile(config, path, contentBase64, message, sha)
    },
    commitBatch: async (config, message, actions) => {
      const client = await getClient()
      if (!client.commitBatch) {
        throw new Error('Current Git provider does not support atomic batch commits')
      }
      return client.commitBatch(config, message, actions)
    },
    deleteFile: async (config, path, message, sha) => (await getClient()).deleteFile(config, path, message, sha),
    renameFile: async (config, oldPath, newPath, message, content, sha) =>
      (await getClient()).renameFile(config, oldPath, newPath, message, content, sha),
    createFolder: async (config, path, message) => (await getClient()).createFolder(config, path, message),
    deleteFolder: async (config, path, message) => (await getClient()).deleteFolder(config, path, message),
  }
}

function createGithubClient(config: GitProviderConfig) {
  const baseUrl = getBaseUrl(config, 'https://api.github.com')
  return createLazyClient(async () => {
    const { createGithubSdkClient } = await import('./adapters/github-sdk-adapter')
    return createGithubSdkClient(baseUrl)
  })
}

function createGiteeClient(config: GitProviderConfig) {
  const baseUrl = getBaseUrl(config, 'https://gitee.com/api/v5')
  return createLazyClient(async () => {
    const { createGiteeSdkClient } = await import('./adapters/gitee-sdk-adapter')
    return createGiteeSdkClient(baseUrl)
  })
}

export function getGitProviderClient(config: GitProviderConfig): GitProviderClient {
  if (config.provider === 'github') {
    return createGithubClient(config)
  }

  if (config.provider === 'gitee') {
    return createGiteeClient(config)
  }

  return getLegacyGitProviderClient(config)
}
