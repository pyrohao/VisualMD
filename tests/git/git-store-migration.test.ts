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

  it('upgrades legacy local-file staged entries into git-draft staged snapshots when a matching draft exists', () => {
    const migrated = migrateGitStorePersistedState({
      config: {
        provider: 'github',
        token: 'plain-token-local-file',
        ownerOrNamespace: 'owner',
        repo: 'repo',
        branch: 'main',
      },
      connected: true,
      drafts: {
        'git:github:owner/repo:main:docs/note.md': {
          documentId: 'git:github:owner/repo:main:docs/note.md',
          path: 'docs/note.md',
          name: 'note.md',
          sha: undefined,
          content: '# note',
          originalContent: '',
          draftContent: '# note',
          isDirty: true,
          isNew: true,
          provider: 'github',
          repo: 'repo',
          ownerOrNamespace: 'owner',
          branch: 'main',
        },
      },
      stagedChanges: [{
        id: 'local-file:local-1',
        kind: 'local-file',
        label: 'note.md',
        repoPath: 'docs/note.md',
        localFileId: 'local-1',
        localFileName: 'note.md',
        updatedAt: 123,
      }],
    }, 6)

    expect(migrated.stagedChanges).toEqual([
      expect.objectContaining({
        kind: 'git-draft',
        repoPath: 'docs/note.md',
        label: 'note.md',
        content: '# note',
      }),
    ])
  })

  it('drops malformed persisted staged entries', () => {
    const migrated = migrateGitStorePersistedState({
      config: {
        provider: 'github',
        token: 'plain-token-bad-stage',
        ownerOrNamespace: 'owner',
        repo: 'repo',
        branch: 'main',
      },
      connected: true,
      stagedChanges: [
        {
          id: 'broken-stage',
          kind: 'git-draft',
          label: 'broken.md',
          updatedAt: 1,
        },
      ],
    }, 6)

    expect(migrated.stagedChanges).toEqual([])
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

  it('hydrates remote snapshot entries from legacy baseTreeMap when explicit snapshot entries are missing', () => {
    const migrated = migrateGitStorePersistedState({
      config: {
        provider: 'github',
        token: 'plain-token-4',
        ownerOrNamespace: 'owner',
        repo: 'repo',
        branch: 'main',
      },
      connected: true,
      baseTreeMap: {
        'README.md': 'sha-readme',
        'docs/guide.md': 'sha-guide',
      },
    }, 5)

    expect(migrated.remoteSnapshotEntries?.['README.md']).toMatchObject({
      path: 'README.md',
      name: 'README.md',
      type: 'file',
      sha: 'sha-readme',
    })
    expect(migrated.remoteSnapshotEntries?.['docs/guide.md']).toMatchObject({
      path: 'docs/guide.md',
      name: 'guide.md',
      type: 'file',
      sha: 'sha-guide',
    })
  })

  it('migrates legacy draft creationSource into fileOrigin', () => {
    const migrated = migrateGitStorePersistedState({
      config: {
        provider: 'github',
        token: 'plain-token-5',
        ownerOrNamespace: 'owner',
        repo: 'repo',
        branch: 'main',
      },
      connected: true,
      drafts: {
        'doc-local': {
          documentId: 'doc-local',
          path: 'draft.md',
          name: 'draft.md',
          sha: undefined,
          content: '',
          originalContent: '',
          draftContent: '',
          isDirty: false,
          isNew: true,
          creationSource: 'local',
          provider: 'github',
          repo: 'repo',
          ownerOrNamespace: 'owner',
          branch: 'main',
        },
        'doc-remote': {
          documentId: 'doc-remote',
          path: 'README.md',
          name: 'README.md',
          sha: 'sha-readme',
          content: '# title',
          originalContent: '# title',
          draftContent: '# title',
          isDirty: false,
          isNew: false,
          creationSource: 'git',
          provider: 'github',
          repo: 'repo',
          ownerOrNamespace: 'owner',
          branch: 'main',
        },
      },
    }, 7)

    expect(migrated.drafts?.['doc-local']?.fileOrigin).toBe('local')
    expect(migrated.drafts?.['doc-remote']?.fileOrigin).toBe('remote')
  })
})
