import { describe, expect, it } from 'vitest'
import { getGitProviderClient } from '@/lib/git/providers'
import type { GitProviderConfig } from '@/lib/git/types'

function createConfig(provider: GitProviderConfig['provider']): GitProviderConfig {
  return {
    provider,
    token: 'token',
    ownerOrNamespace: 'owner',
    repo: 'repo',
    branch: 'main',
    baseUrl: '',
    customFlavor: 'gitlab',
  }
}

describe('getGitProviderClient', () => {
  it('returns a client shape for github provider', () => {
    const client = getGitProviderClient(createConfig('github'))
    expect(typeof client.validateConnection).toBe('function')
    expect(typeof client.commitBatch).toBe('function')
    expect(typeof client.createOrUpdateBinaryFile).toBe('function')
  })

  it('returns a client shape for gitee provider', () => {
    const client = getGitProviderClient(createConfig('gitee'))
    expect(typeof client.validateConnection).toBe('function')
    expect(typeof client.listTree).toBe('function')
    expect(typeof client.deleteFolder).toBe('function')
  })

  it('returns legacy client for gitlab/custom providers', () => {
    const gitlabClient = getGitProviderClient(createConfig('gitlab'))
    const customClient = getGitProviderClient({
      ...createConfig('custom'),
      customFlavor: 'gitea',
      baseUrl: 'https://git.example.com/api/v1',
    })

    expect(typeof gitlabClient.listRepos).toBe('function')
    expect(typeof customClient.createFolder).toBe('function')
  })
})
