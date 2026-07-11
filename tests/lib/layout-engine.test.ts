import { describe, expect, it } from 'vitest'
import { calculateTreeLayoutResult } from '@/lib/layout-engine'
import type { TreeNode } from '@/types/tree'

function createNode(
  id: string,
  title: string,
  level: number,
  children: TreeNode[] = []
): TreeNode {
  return {
    id,
    title,
    level,
    parentId: level === 1 ? 'root' : null,
    children,
    content: '',
  }
}

describe('calculateTreeLayoutResult', () => {
  it('keeps balanced root children in document order on each side', () => {
    const root: TreeNode = {
      id: 'root',
      title: 'Root',
      level: 0,
      parentId: null,
      children: [
        createNode('n1', '1', 1),
        createNode('n2', '2', 1),
        createNode('n3', '3', 1),
        createNode('n4', '4', 1),
        createNode('n5', '5', 1),
      ],
      content: '',
    }

    const { directions } = calculateTreeLayoutResult(root, undefined, 'balanced')
    const leftIds = root.children.filter((node) => directions.get(node.id) === 'left').map((node) => node.id)
    const rightIds = root.children.filter((node) => directions.get(node.id) === 'right').map((node) => node.id)

    expect(leftIds).toEqual(['n1', 'n2'])
    expect(rightIds).toEqual(['n3', 'n4', 'n5'])
  })
})
