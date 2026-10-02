import { beforeEach, describe, expect, it } from 'vitest'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useTabsStore } from '@/stores/tabsStore'

describe('fileSystemStore renameFile', () => {
  beforeEach(() => {
    useFileSystemStore.setState({
      files: [{
        id: 'local-file',
        name: 'before.md',
        content: '# Note',
        folderId: null,
        createdAt: 1,
        updatedAt: 1,
        isModified: false,
      }],
    } as never)
    useTabsStore.setState({
      activeTabId: 'local-tab',
      tabs: [
        {
          id: 'local-tab',
          fileId: 'local-file',
          fileName: 'before.md',
          content: '# Note',
          savedContent: '# Note',
          isModified: false,
          sourceType: 'local',
        },
        {
          id: 'other-tab',
          fileId: 'other-file',
          fileName: 'other.md',
          content: '',
          isModified: false,
          sourceType: 'local',
        },
        {
          id: 'git-tab',
          fileId: 'git-file',
          fileName: 'remote.md',
          content: '',
          isModified: false,
          sourceType: 'git',
        },
      ],
    })
  })

  it('updates the matching local tab name without affecting other tabs', () => {
    useFileSystemStore.getState().renameFile('local-file', 'after.md')

    expect(useFileSystemStore.getState().files[0].name).toBe('after.md')
    expect(useTabsStore.getState().tabs).toEqual([
      expect.objectContaining({ id: 'local-tab', fileName: 'after.md' }),
      expect.objectContaining({ id: 'other-tab', fileName: 'other.md' }),
      expect.objectContaining({ id: 'git-tab', fileName: 'remote.md' }),
    ])
  })
})