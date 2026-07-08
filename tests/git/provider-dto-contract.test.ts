import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLegacyGitProviderClient } from '@/lib/git/adapters/legacy-adapter'
import type { GitProviderConfig } from '@/lib/git/types'

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  })
}

function createConfig(provider: GitProviderConfig['provider']): GitProviderConfig {
  return {
    provider,
    token: 'token',
    ownerOrNamespace: 'owner',
    repo: 'repo',
    branch: 'main',
    baseUrl: provider === 'gitlab' ? 'https://gitlab.example/api/v4' : 'https://api.example.test',
    customFlavor: 'gitlab',
  }
}

describe('provider DTO contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('normalizes github-like tree/file DTO paths and disables request caching', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([
        { path: 'docs\\guide.md', name: 'guide.md', type: 'file', sha: 'blob-sha', size: 12 },
        { path: 'docs', name: 'docs', type: 'dir' },
      ]))
      .mockResolvedValueOnce(jsonResponse({
        path: 'docs\\guide.md',
        name: 'guide.md',
        sha: 'blob-sha',
        content: 'aGVsbG8=',
      }))

    vi.stubGlobal('fetch', fetchMock)
    const config = createConfig('github')
    const client = getLegacyGitProviderClient(config)

    const tree = await client.listTree(config, 'docs')
    const file = await client.getFile(config, 'docs/guide.md')

    expect(tree).toEqual([
      { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'blob-sha', size: 12 },
      { path: 'docs', name: 'docs', type: 'dir', sha: undefined, size: undefined },
    ])
    expect(file).toEqual({
      path: 'docs/guide.md',
      name: 'guide.md',
      sha: 'blob-sha',
      content: 'hello',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ cache: 'no-store' })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ cache: 'no-store' })
    )
  })

  it('normalizes gitlab tree/file DTO paths into the shared contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([
        { path: 'docs\\guide.md', name: 'guide.md', type: 'blob', id: 'blob-sha' },
        { path: 'docs', name: 'docs', type: 'tree', id: 'tree-sha' },
      ]))
      .mockResolvedValueOnce(jsonResponse({
        file_path: 'docs\\guide.md',
        last_commit_id: 'commit-sha',
        content: 'aGk=',
      }))

    vi.stubGlobal('fetch', fetchMock)
    const config = createConfig('gitlab')
    const client = getLegacyGitProviderClient(config)

    const tree = await client.listTree(config, 'docs')
    const file = await client.getFile(config, 'docs/guide.md')

    expect(tree).toEqual([
      { path: 'docs/guide.md', name: 'guide.md', type: 'file', sha: 'blob-sha' },
      { path: 'docs', name: 'docs', type: 'dir', sha: 'tree-sha' },
    ])
    expect(file).toEqual({
      path: 'docs/guide.md',
      name: 'guide.md',
      sha: 'commit-sha',
      content: 'hi',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ cache: 'no-store' })
    )
  })
})
