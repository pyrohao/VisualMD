import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentStore } from '@/stores/documentStore'

const markdownWithSkippedLevels = `---
name: 未命名
description:
---

# 新节点1

### 很好

### 测试节点

# 新节点2
`

describe('documentStore expanded state recovery', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      document: null,
      selectedNodeId: null,
      expandedNodeIds: new Set(['root']),
      isLoading: false,
      error: null,
      externalRevision: 0,
      lastMutation: {
        id: 0,
        type: 'load-document',
        scope: 'full',
      },
    })
  })

  it('re-expands reparsed headings when previous expanded node ids no longer exist', () => {
    const store = useDocumentStore.getState()
    store.loadDocument(markdownWithSkippedLevels, 'Test.md')

    const firstDocument = useDocumentStore.getState().document
    expect(firstDocument).not.toBeNull()

    const oldExpandedIds = useDocumentStore.getState().expandedNodeIds
    expect(oldExpandedIds.size).toBeGreaterThan(1)

    useDocumentStore.setState({
      expandedNodeIds: oldExpandedIds,
    })

    const reparsed = useDocumentStore.getState().updateFromMarkdown(markdownWithSkippedLevels)
    expect(reparsed).toBe(true)

    const nextState = useDocumentStore.getState()
    const rootChildren = nextState.document?.root.children || []
    const firstRootChild = rootChildren[0]

    expect(firstRootChild?.title).toBe('新节点1')
    expect(firstRootChild?.isCollapsed).toBe(false)
    expect(firstRootChild?.children.map((child) => child.title)).toEqual(['很好', '测试节点'])
    expect(nextState.expandedNodeIds.has(firstRootChild.id)).toBe(true)
  })
})
