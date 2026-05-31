import type { Edge, Node } from '@xyflow/react'
import type { TreeNode } from '@/types/tree'
import {
  calculateTreeLayoutResult,
  type TreeLayoutMode,
  type BranchDirection,
} from './layout-engine'

export const FLOW_HANDLE_IDS = {
  sourceLeft: 'source-left',
  sourceRight: 'source-right',
  sourceBottom: 'source-bottom',
  targetLeft: 'target-left',
  targetRight: 'target-right',
  targetTop: 'target-top',
} as const

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  level: number
  isCollapsed: boolean
  hasChildren: boolean
  layoutMode: TreeLayoutMode
  content?: string
  childrenCount: number
  isDetached?: boolean
  isVirtual?: boolean
  branchDirection?: BranchDirection
  orderIndex?: number
  siblingsCount?: number
  onToggleCollapse?: (id: string) => void
  onSelect?: (id: string) => void
  onMoveToPosition?: (id: string, position: number) => void
  metadata?: Record<string, string>
}

export function shouldHideVirtualRoot(root: TreeNode): boolean {
  return Boolean(root.isVirtual && root.children.length === 1)
}

export function getHandlesForDirection(direction: BranchDirection): {
  sourceHandle: string
  targetHandle: string
} {
  if (direction === 'left') {
    return {
      sourceHandle: FLOW_HANDLE_IDS.sourceLeft,
      targetHandle: FLOW_HANDLE_IDS.targetRight,
    }
  }

  if (direction === 'down') {
    return {
      sourceHandle: FLOW_HANDLE_IDS.sourceBottom,
      targetHandle: FLOW_HANDLE_IDS.targetTop,
    }
  }

  return {
    sourceHandle: FLOW_HANDLE_IDS.sourceRight,
    targetHandle: FLOW_HANDLE_IDS.targetLeft,
  }
}

function getVisibleTreeLayout(root: TreeNode, detachedNodes: TreeNode[], layoutMode: TreeLayoutMode) {
  if (shouldHideVirtualRoot(root)) {
    return calculateTreeLayoutResult(root.children[0], detachedNodes, undefined, layoutMode)
  }

  return calculateTreeLayoutResult(root, detachedNodes, undefined, layoutMode)
}

function createNodeData(
  node: TreeNode,
  direction: BranchDirection,
  layoutMode: TreeLayoutMode,
  orderIndex?: number,
  siblingsCount?: number
): FlowNodeData {
  return {
    label: node.isVirtual ? 'Metadata' : node.title || '未命名',
    level: node.level,
    isCollapsed: node.isCollapsed || false,
    hasChildren: node.children.length > 0,
    layoutMode,
    content: node.content,
    childrenCount: node.children.length,
    isDetached: node.isDetached || false,
    isVirtual: node.isVirtual || false,
    branchDirection: direction,
    orderIndex,
    siblingsCount,
  }
}

export function treeToNodesAndEdges(
  tree: TreeNode,
  detachedNodes: TreeNode[] = [],
  layoutMode: TreeLayoutMode = 'balanced'
): {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
} {
  const nodes: Node<FlowNodeData>[] = []
  const edges: Edge[] = []
  const { positions, directions } = getVisibleTreeLayout(tree, detachedNodes, layoutMode)
  const hideVirtualRoot = shouldHideVirtualRoot(tree)

  function pushEdge(parentId: string, child: TreeNode, fallbackDirection: BranchDirection) {
    const direction = directions.get(child.id) || fallbackDirection
    const { sourceHandle, targetHandle } = getHandlesForDirection(direction)

    edges.push({
      id: `${parentId}-${child.id}`,
      source: parentId,
      target: child.id,
      type: 'default',
      sourceHandle,
      targetHandle,
      animated: true,
      style: {
        stroke: child.isDetached ? '#9ca3af' : getLevelColor(child.level),
        strokeWidth: 2,
        cursor: 'pointer',
        ...(child.isDetached ? { strokeDasharray: '5,5' } : {}),
      },
      ...(child.isDetached
        ? {}
        : {
            markerEnd: {
              type: 'arrowclosed',
              width: 12,
              height: 12,
              color: getLevelColor(child.level),
            },
          }),
    })
  }

  function traverse(node: TreeNode, parentId?: string, orderIndex?: number, siblingsCount?: number) {
    if (hideVirtualRoot && node.id === tree.id) {
      const childCount = node.children.length
      node.children.forEach((child, index) => traverse(child, undefined, index + 1, childCount))
      return
    }

    const position = positions.get(node.id) || { x: 0, y: 0 }
    const branchDirection = directions.get(node.id) || 'right'

    nodes.push({
      id: node.id,
      type: 'headingNode',
      position,
      data: createNodeData(node, branchDirection, layoutMode, orderIndex, siblingsCount),
    })

    if (parentId && !node.isDetached) {
      pushEdge(parentId, node, branchDirection)
    }

    if (node.children && !node.isCollapsed) {
      const childCount = node.children.length
      node.children.forEach((child, index) => traverse(child, node.id, index + 1, childCount))
    }
  }

  traverse(tree, undefined, 1, 1)

  detachedNodes.forEach((detachedNode, index) => {
    const position = positions.get(detachedNode.id) || { x: 0, y: 0 }
    const branchDirection = directions.get(detachedNode.id) || 'right'

    nodes.push({
      id: detachedNode.id,
      type: 'headingNode',
      position,
      data: createNodeData(
        { ...detachedNode, isDetached: true },
        branchDirection,
        layoutMode,
        index + 1,
        detachedNodes.length
      ),
    })

    const traverseDetached = (
      parentNode: TreeNode,
      parentId: string,
      parentDirection: BranchDirection
    ) => {
      if (!parentNode.children || parentNode.isCollapsed) {
        return
      }

      parentNode.children.forEach((child) => {
        const childPosition = positions.get(child.id) || { x: 0, y: 0 }
        const childDirection = directions.get(child.id) || parentDirection

        nodes.push({
          id: child.id,
          type: 'headingNode',
          position: childPosition,
          data: createNodeData({ ...child, isDetached: true }, childDirection, layoutMode),
        })

        pushEdge(parentId, { ...child, isDetached: true }, childDirection)
        traverseDetached(child, child.id, childDirection)
      })
    }

    if (detachedNode.children && !detachedNode.isCollapsed) {
      traverseDetached(detachedNode, detachedNode.id, branchDirection)
    }
  })

  return { nodes, edges }
}

export function getLevelColor(level: number): string {
  const colors = [
    '#3b82f6',
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#f97316',
    '#6b7280',
  ]
  return colors[level] || colors[0]
}

export function getLevelBgColor(level: number): string {
  const colors = [
    '#eff6ff',
    '#eff6ff',
    '#ecfdf5',
    '#fffbeb',
    '#f5f3ff',
    '#fff7ed',
    '#f9fafb',
  ]
  return colors[level] || colors[0]
}

export function updateNodeInTree(
  tree: TreeNode,
  nodeId: string,
  updates: Partial<TreeNode>
): TreeNode {
  if (tree.id === nodeId) {
    return { ...tree, ...updates }
  }

  return {
    ...tree,
    children: tree.children.map((child) => updateNodeInTree(child, nodeId, updates)),
  }
}

export function findNodeInTree(tree: TreeNode, nodeId: string): TreeNode | null {
  if (tree.id === nodeId) {
    return tree
  }

  for (const child of tree.children) {
    const found = findNodeInTree(child, nodeId)
    if (found) {
      return found
    }
  }

  return null
}

export function findNodeInDetached(detachedNodes: TreeNode[], nodeId: string): TreeNode | null {
  for (const node of detachedNodes) {
    if (node.id === nodeId) {
      return node
    }

    const found = findNodeInDetached(node.children, nodeId)
    if (found) {
      return found
    }
  }

  return null
}

export function findNodeInTreeOrDetached(
  tree: TreeNode,
  detachedNodes: TreeNode[],
  nodeId: string
): TreeNode | null {
  const foundInTree = findNodeInTree(tree, nodeId)
  if (foundInTree) {
    return foundInTree
  }

  return findNodeInDetached(detachedNodes, nodeId)
}

export function findParentInTree(tree: TreeNode, nodeId: string): TreeNode | null {
  for (const child of tree.children) {
    if (child.id === nodeId) {
      return tree
    }

    const found = findParentInTree(child, nodeId)
    if (found) {
      return found
    }
  }

  return null
}

export function deleteNodeFromTree(tree: TreeNode, nodeId: string): TreeNode {
  return {
    ...tree,
    children: tree.children
      .filter((child) => child.id !== nodeId)
      .map((child) => deleteNodeFromTree(child, nodeId)),
  }
}

export function moveNodeInTree(
  tree: TreeNode,
  nodeId: string,
  newParentId: string,
  index: number
): TreeNode {
  const nodeToMove = findNodeInTree(tree, nodeId)
  if (!nodeToMove) {
    return tree
  }

  const treeWithoutNode = deleteNodeFromTree(tree, nodeId)

  function addNodeToParent(node: TreeNode): TreeNode {
    if (node.id === newParentId) {
      const newChildren = [...node.children]
      newChildren.splice(index, 0, nodeToMove)
      return { ...node, children: newChildren }
    }

    return {
      ...node,
      children: node.children.map((child) => addNodeToParent(child)),
    }
  }

  return addNodeToParent(treeWithoutNode)
}

export function collectAllNodeIds(tree: TreeNode): string[] {
  const ids: string[] = [tree.id]

  for (const child of tree.children) {
    ids.push(...collectAllNodeIds(child))
  }

  return ids
}
