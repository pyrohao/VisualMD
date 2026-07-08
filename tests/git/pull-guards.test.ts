import { describe, expect, it } from 'vitest'
import { findGitDirectoryPathConflicts, findGitPullBlockers, findGitStagedAssetConflicts, findGitUnstagedChanges } from '@/lib/git/pull-guards'
import type { GitDraftFile, StagedGitChange } from '@/lib/git/types'

function createDraft(overrides: Partial<GitDraftFile>): GitDraftFile {
  return {
    documentId: 'doc-1',
    path: 'README.md',
    name: 'README.md',
    sha: 'base-sha',
    content: '# Title',
    originalContent: '# Title',
    draftContent: '# Title',
    isDirty: false,
    isNew: false,
    fileOrigin: 'remote',
    provider: 'github',
    ownerOrNamespace: 'owner',
    repo: 'repo',
    branch: 'main',
    ...overrides,
  }
}

function createChange(overrides: Partial<StagedGitChange>): StagedGitChange {
  return {
    id: 'change-1',
    kind: 'git-draft',
    label: 'README.md',
    repoPath: 'README.md',
    documentId: 'doc-1',
    updatedAt: Date.now(),
    ...overrides,
  } as StagedGitChange
}

describe('git pull guards', () => {
  it('blocks untracked local files when the same remote path changes', () => {
    const blockers = findGitPullBlockers({
      drafts: {
        'doc-1': createDraft({
          isNew: true,
          fileOrigin: 'local',
          sha: undefined,
          originalContent: '',
          draftContent: 'local note',
        }),
      },
      stagedChanges: [],
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
      changedPaths: ['README.md'],
      remoteTreeMap: { 'README.md': 'remote-sha' },
    })

    expect(blockers).toEqual([{ kind: 'untracked-overwrite', path: 'README.md' }])
  })

  it('blocks tracked files with unstaged changes when the same remote path changes', () => {
    const blockers = findGitPullBlockers({
      drafts: {
        'doc-1': createDraft({
          draftContent: '# Changed',
          isDirty: true,
        }),
      },
      stagedChanges: [],
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
      changedPaths: ['README.md'],
      remoteTreeMap: { 'README.md': 'remote-sha' },
    })

    expect(blockers).toEqual([{ kind: 'unstaged-overwrite', path: 'README.md' }])
  })

  it('blocks staged files that were edited again after staging when remote path changes', () => {
    const blockers = findGitPullBlockers({
      drafts: {
        'doc-1': createDraft({
          draftContent: '# Edited after stage',
          isDirty: true,
        }),
      },
      stagedChanges: [
        createChange({
          content: '# Staged content',
          originalContent: '# Title',
          baseSha: 'base-sha',
          blobSha: 'blob-sha',
        }),
      ],
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
      changedPaths: ['README.md'],
      remoteTreeMap: { 'README.md': 'remote-sha' },
    })

    expect(blockers).toEqual([{ kind: 'unstaged-overwrite', path: 'README.md' }])
  })

  it('does not block a staged local add with no further edits; that path should fall through to conflict handling later', () => {
    const blockers = findGitPullBlockers({
      drafts: {
        'doc-1': createDraft({
          isNew: true,
          fileOrigin: 'local',
          sha: undefined,
          originalContent: '',
          draftContent: 'same as staged',
          content: 'same as staged',
        }),
      },
      stagedChanges: [
        createChange({
          content: 'same as staged',
          originalContent: '',
          baseSha: undefined,
          blobSha: 'blob-sha',
        }),
      ],
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
      changedPaths: ['README.md'],
      remoteTreeMap: { 'README.md': 'remote-sha' },
    })

    expect(blockers).toEqual([])
  })

  it('blocks pending git assets when the same remote path appears', () => {
    const blockers = findGitPullBlockers({
      drafts: {},
      stagedChanges: [],
      pendingAssetChanges: [
        createChange({
          id: 'asset-1',
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          contentBase64: 'Zm9v',
        }),
      ],
      pendingStructuralChanges: [],
      changedPaths: ['.visualmd-assets/logo.png'],
      remoteTreeMap: { '.visualmd-assets/logo.png': 'remote-sha' },
    })

    expect(blockers).toEqual([{ kind: 'untracked-overwrite', path: '.visualmd-assets/logo.png' }])
  })

  it('treats pending git assets with a remote base sha as tracked unstaged changes', () => {
    const blockers = findGitPullBlockers({
      drafts: {},
      stagedChanges: [],
      pendingAssetChanges: [
        createChange({
          id: 'asset-1',
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          contentBase64: 'Zm9v',
          baseSha: 'remote-sha',
          originalSha: 'remote-sha',
        }),
      ],
      pendingStructuralChanges: [],
      changedPaths: ['.visualmd-assets/logo.png'],
      remoteTreeMap: { '.visualmd-assets/logo.png': 'next-remote-sha' },
    })

    expect(blockers).toEqual([{ kind: 'unstaged-overwrite', path: '.visualmd-assets/logo.png' }])
  })

  it('still blocks tracked pending assets when the remote change is a delete, not only when the path still exists', () => {
    const blockers = findGitPullBlockers({
      drafts: {},
      stagedChanges: [],
      pendingAssetChanges: [
        createChange({
          id: 'asset-1',
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          contentBase64: 'Zm9v',
          baseSha: 'remote-sha',
          originalSha: 'remote-sha',
        }),
      ],
      pendingStructuralChanges: [],
      changedPaths: ['.visualmd-assets/logo.png'],
      remoteTreeMap: {},
    })

    expect(blockers).toEqual([{ kind: 'unstaged-overwrite', path: '.visualmd-assets/logo.png' }])
  })

  it('detects delete-directory/add-file path conflicts', () => {
    const conflicts = findGitDirectoryPathConflicts(
      [],
      [
        createChange({
          id: 'delete-folder',
          kind: 'git-delete-folder',
          label: 'docs',
          repoPath: 'docs',
        }),
      ],
      ['docs/new-api.md', 'README.md']
    )

    expect(conflicts).toEqual([
      {
        kind: 'directory-delete-add-file',
        folderPath: 'docs',
        path: 'docs/new-api.md',
      },
    ])
  })

  it('only reports staged-path drift for commit-time unstaged checks', () => {
    const blockers = findGitUnstagedChanges({
      drafts: {
        staged: createDraft({
          documentId: 'staged',
          path: 'README.md',
          draftContent: '# Edited after stage',
          isDirty: true,
        }),
        unrelated: createDraft({
          documentId: 'unrelated',
          path: 'docs/guide.md',
          name: 'guide.md',
          draftContent: 'dirty but not staged',
          originalContent: 'base',
          isDirty: true,
        }),
      },
      stagedChanges: [
        createChange({
          documentId: 'staged',
          repoPath: 'README.md',
          content: '# Staged content',
          originalContent: '# Title',
          baseSha: 'base-sha',
          blobSha: 'blob-sha',
        }),
      ],
      pendingAssetChanges: [],
      pendingStructuralChanges: [],
    })

    expect(blockers).toEqual([{ kind: 'unstaged-overwrite', path: 'README.md' }])
  })

  it('detects staged asset conflicts when the same remote path changed after staging', () => {
    const conflicts = findGitStagedAssetConflicts(
      [
        createChange({
          id: 'asset-1',
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          contentBase64: 'Zm9v',
          baseSha: 'old-remote-sha',
          originalSha: 'old-remote-sha',
        }),
      ],
      ['.visualmd-assets/logo.png'],
      { '.visualmd-assets/logo.png': 'new-remote-sha' }
    )

    expect(conflicts).toEqual(['.visualmd-assets/logo.png'])
  })

  it('detects add/add staged asset conflicts when a locally staged new asset appears remotely', () => {
    const conflicts = findGitStagedAssetConflicts(
      [
        createChange({
          id: 'asset-1',
          kind: 'git-asset',
          label: 'logo.png',
          repoPath: '.visualmd-assets/logo.png',
          contentBase64: 'Zm9v',
        }),
      ],
      ['.visualmd-assets/logo.png'],
      { '.visualmd-assets/logo.png': 'remote-sha' }
    )

    expect(conflicts).toEqual(['.visualmd-assets/logo.png'])
  })
})
