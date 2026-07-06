import { describe, expect, it } from 'vitest'
import { decryptSecret } from '@/lib/secret-storage'
import { migrateGitStorePersistedState } from '@/stores/gitStore'

describe('migrateGitStorePersistedState', () => {
  it('migrates v1 state and normalizes encrypted token', () => {
    const migrated = migrateGitStorePersistedState({
      config: {
        provider: 'github',
        token: 'plain-token',
        ownerOrNamespace: 'owner',
        repo: 'repo',
        branch: 'main',
      },
      lastConnectedConfigSignature: 'sig',
      connected: true,
    }, 1)

    expect(migrated.connected).toBe(true)
    expect(migrated.config?.token).not.toBe('plain-token')
    expect(decryptSecret(migrated.config?.token || '')).toBe('plain-token')
    expect(migrated.drafts).toEqual({})
    expect(migrated.stagedChanges).toEqual([])
  })

  it('keeps v2 draft and staged state', () => {
    const migrated = migrateGitStorePersistedState({
      config: {
        provider: 'gitee',
        token: 'plain-token-2',
        ownerOrNamespace: 'owner',
        repo: 'repo',
        branch: 'main',
      },
      lastConnectedConfigSignature: 'sig2',
      connected: true,
      drafts: {
        'doc-id': {
          documentId: 'doc-id',
          path: 'README.md',
          name: 'README.md',
          sha: 'sha123',
          content: '# content',
          originalContent: '# content',
          draftContent: '# content',
          isDirty: false,
          provider: 'gitee',
          repo: 'repo',
          ownerOrNamespace: 'owner',
          branch: 'main',
        },
      },
      stagedChanges: [{
        id: 'git-draft:doc-id',
        kind: 'git-draft',
        label: 'README.md',
        repoPath: 'README.md',
        documentId: 'doc-id',
        updatedAt: Date.now(),
      }],
      currentDocumentId: 'doc-id',
      expandedPaths: ['docs'],
    }, 2)

    expect(migrated.drafts?.['doc-id']?.path).toBe('README.md')
    expect(migrated.stagedChanges).toHaveLength(1)
    expect(migrated.currentDocumentId).toBe('doc-id')
    expect(migrated.expandedPaths).toEqual(['docs'])
  })

  it('restores pending structural changes in v4 workspace state', () => {
    const migrated = migrateGitStorePersistedState({
      config: {
        provider: 'github',
        token: 'plain-token-3',
        ownerOrNamespace: 'owner',
        repo: 'repo',
        branch: 'main',
      },
      connected: true,
      drafts: {},
      stagedChanges: [],
      pendingAssetChanges: [],
      workspaceStateByKey: {
        'github:owner:repo:main': {
          drafts: {},
          stagedChanges: [],
          pendingAssetChanges: [],
          pendingStructuralChanges: [{
            id: 'git-delete-file:README.md',
            kind: 'git-delete-file',
            label: 'README.md',
            repoPath: 'README.md',
            documentId: 'doc-id',
            originalContent: '# old',
            originalSha: 'sha-old',
            updatedAt: 123,
          }],
          currentDocumentId: null,
          expandedPaths: [],
          pendingCommitMessage: null,
          baseTreeMap: {},
        },
      },
    }, 4)

    expect(migrated.pendingStructuralChanges).toHaveLength(1)
    expect(migrated.pendingStructuralChanges?.[0]?.kind).toBe('git-delete-file')
    expect(Object.keys(migrated.workspaceStateByKey || {})).toContain('github:owner:repo:main')
  })
})
