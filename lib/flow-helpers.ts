/**
 * React Flow辅助函数
 * 
 * 本模块提供React Flow相关的转换和辅助功能，包括：
 * 1. 树结构到React Flow节点/边的转换
 * 2. 节点更新功能
 * 
 * 对应技术文档第6章组件设计
 */

import type { Node, Edge } from '@xyflow/react'
import type { TreeNode } from '@/types/tree'
import { calculateTreeLayout, DEFAULT_LAYOUT_CONFIG } from './layout-engine'

/**
 * 节点数据类型
 */
export interface FlowNodeData extends Record<string, unknown> {
  label: string
  level: number
  isCollapsed: boolean
  hasChildren: boolean
  content?: string
  childrenCount: number
  isDetached?: boolean
  isVirtual?: boolean // 是否为虚拟根节点
  orderIndex?: number // 在父节点中的顺序序号（从1开始）
  siblingsCount?: number // 兄弟节点总数
  onToggleCollapse?: (id: string) => void
  onSelect?: (id: string) => void
  onMoveToPosition?: (id: string, position: number) => void // 移动到指定位置
  metadata?: Record<string, string> // YAML 元数据（用于虚拟根节点）
}

/**
 * 将树结构转换为React Flow的节点和边
 * 
 * @param tree 树结构的根节点
 * @param detachedNodes 断开的节点数组（可选）
 * @param metadata 文档元数据（用于根节点）
 * @param fileName 文件名（用于根节点标题）
 * @returns 包含nodes和edges的对象
 */
export function treeToNodesAndEdges(
  tree: TreeNode,
  detachedNodes: TreeNode[] = []
): {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
} {
  const nodes: Node<FlowNodeData>[] = []
  const edges: Edge[] = []
  
  // 计算布局（包含断开的节点）
  const positions = calculateTreeLayout(tree, detachedNodes)
  
  /**
   * 递归遍历树，创建节点和边
   */
  function traverse(node: TreeNode, parentId?: string, orderIndex?: number, siblingsCount?: number) {
    const position = positions.get(node.id) || { x: 0, y: 0 }

    // 创建React Flow节点
    nodes.push({
      id: node.id,
      type: 'headingNode',
      position,
      data: {
        label: node.isVirtual ? 'Metadata' : (node.title || '未命名'),
        level: node.level,
        isCollapsed: node.isCollapsed || false,
        hasChildren: node.children.length > 0,
        content: node.content,
        childrenCount: node.children.length,
        isDetached: node.isDetached || false,
        isVirtual: node.isVirtual || false, // 是否为虚拟根节点
        orderIndex: orderIndex, // 在父节点中的顺序序号
        siblingsCount: siblingsCount, // 兄弟节点总数
      },
    })

    // 创建边（如果不是根节点且节点不是断开的）
    // 使用贝塞尔曲线连接，从父节点右侧连接到子节点左侧，带箭头
    if (parentId && !node.isDetached) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: 'default',
        sourceHandle: 'right',
        targetHandle: 'left',
        animated: true,
        style: {
          stroke: getLevelColor(node.level),
          strokeWidth: 2,
          cursor: 'pointer',
        },
        markerEnd: {
          type: 'arrowclosed',
          width: 12,
          height: 12,
          color: getLevelColor(node.level),
        },
      })
    }

    // 递归处理子节点，传递序号和兄弟节点数量
    if (node.children && !node.isCollapsed) {
      const childCount = node.children.length
      node.children.forEach((child, index) => traverse(child, node.id, index + 1, childCount))
    }
  }

  // 根节点作为唯一的"兄弟"，siblingsCount = 1
  traverse(tree, undefined, 1, 1)
  
  // 处理断开的节点
  detachedNodes.forEach((detachedNode, index) => {
    const position = positions.get(detachedNode.id) || { x: 0, y: 0 }

    nodes.push({
      id: detachedNode.id,
      type: 'headingNode',
      position,
      data: {
        label: detachedNode.title || '未命名（已断开）',
        level: detachedNode.level,
        isCollapsed: detachedNode.isCollapsed || false,
        hasChildren: detachedNode.children.length > 0,
        content: detachedNode.content,
        childrenCount: detachedNode.children.length,
        isDetached: true,
        orderIndex: index + 1,
        siblingsCount: detachedNodes.length,
      },
    })
    
    // 断开的节点不创建边，但递归处理其子节点（包括所有层级）
    const traverseDetached = (parentNode: TreeNode, parentId: string) => {
      if (parentNode.children && !parentNode.isCollapsed) {
        parentNode.children.forEach((child) => {
          const childPosition = positions.get(child.id) || { x: 0, y: 0 }

          nodes.push({
            id: child.id,
            type: 'headingNode',
            position: childPosition,
            data: {
              label: child.title || '未命名',
              level: child.level,
              isCollapsed: child.isCollapsed || false,
              hasChildren: child.children.length > 0,
              content: child.content,
              childrenCount: child.children.length,
              isDetached: true,
            },
          })

          // 子节点之间创建边（保持内部结构）
          edges.push({
            id: `${parentId}-${child.id}`,
            source: parentId,
            target: child.id,
            type: 'straight',
            sourceHandle: 'right',
            targetHandle: 'left',
            animated: true,
            style: {
              stroke: '#9ca3af', // 灰色表示断开状态
              strokeWidth: 2,
              strokeDasharray: '5,5', // 虚线表示断开
            },
          })

          // 递归处理子节点的子节点
          traverseDetached(child, child.id)
        })
      }
    }

    // 开始递归处理断开节点的子节点
    if (detachedNode.children && !detachedNode.isCollapsed) {
      traverseDetached(detachedNode, detachedNode.id)
    }
  })
  
  return { nodes, edges }
}

/**
 * 获取层级对应的颜色（浅色主题）
 * 
 * @param level 层级（0-6）
 * @returns 颜色值
 */
export function getLevelColor(level: number): string {
  const colors = [
    '#3b82f6', // H0 - blue-500
    '#3b82f6', // H1 - blue-500
    '#10b981', // H2 - emerald-500
    '#f59e0b', // H3 - amber-500
    '#8b5cf6', // H4 - violet-500
    '#f97316', // H5 - orange-500
    '#6b7280', // H6 - gray-500
  ]
  return colors[level] || colors[0]
}

/**
 * 获取层级对应的背景色（浅色主题）
 * 
 * @param level 层级（0-6）
 * @returns 背景色值
 */
export function getLevelBgColor(level: number): string {
  const colors = [
    '#eff6ff', // blue-50
    '#eff6ff', // blue-50
    '#ecfdf5', // emerald-50
    '#fffbeb', // amber-50
    '#f5f3ff', // violet-50
    '#fff7ed', // orange-50
    '#f9fafb', // gray-50
  ]
  return colors[level] || colors[0]
}

/**
 * 更新树中的节点
 * 
 * @param tree 树结构
 * @param nodeId 节点ID
 * @param updates 更新的字段
 * @returns 更新后的树
 */
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
    children: tree.children.map((child) =>
      updateNodeInTree(child, nodeId, updates)
    ),
  }
}

/**
 * 在树中查找节点
 * 
 * @param tree 树结构
 * @param nodeId 节点ID
 * @returns 找到的节点或null
 */
export function findNodeInTree(tree: TreeNode, nodeId: string): TreeNode | null {
  if (tree.id === nodeId) {
    return tree
  }

  for (const child of tree.children) {
    const found = findNodeInTree(child, nodeId)
    if (found) return found
  }

  return null
}

/**
 * 在断开节点列表中查找节点
 * 
 * @param detachedNodes 断开节点数组
 * @param nodeId 节点ID
 * @returns 找到的节点或null
 */
export function findNodeInDetached(detachedNodes: TreeNode[], nodeId: string): TreeNode | null {
  for (const node of detachedNodes) {
    if (node.id === nodeId) {
      return node
    }
    // 递归查找子节点
    const found = findNodeInDetached(node.children, nodeId)
    if (found) return found
  }
  return null
}

/**
 * 在树和断开节点中查找节点
 * 
 * @param tree 树结构
 * @param detachedNodes 断开节点数组
 * @param nodeId 节点ID
 * @returns 找到的节点或null
 */
export function findNodeInTreeOrDetached(
  tree: TreeNode,
  detachedNodes: TreeNode[],
  nodeId: string
): TreeNode | null {
  // 先在树中查找
  const foundInTree = findNodeInTree(tree, nodeId)
  if (foundInTree) return foundInTree
  
  // 再在断开节点中查找
  return findNodeInDetached(detachedNodes, nodeId)
}

/**
 * 在树中查找父节点
 * 
 * @param tree 树结构
 * @param nodeId 节点ID
 * @returns 父节点或null
 */
export function findParentInTree(tree: TreeNode, nodeId: string): TreeNode | null {
  for (const child of tree.children) {
    if (child.id === nodeId) {
      return tree
    }
    const found = findParentInTree(child, nodeId)
    if (found) return found
  }
  return null
}

/**
 * 从树中删除节点
 * 
 * @param tree 树结构
 * @param nodeId 节点ID
 * @returns 删除后的树
 */
export function deleteNodeFromTree(tree: TreeNode, nodeId: string): TreeNode {
  return {
    ...tree,
    children: tree.children
      .filter((child) => child.id !== nodeId)
      .map((child) => deleteNodeFromTree(child, nodeId)),
  }
}

/**
 * 移动节点到新的父节点
 * 
 * @param tree 树结构
 * @param nodeId 要移动的节点ID
 * @param newParentId 新父节点ID
 * @param index 在新父节点中的位置
 * @returns 移动后的树
 */
export function moveNodeInTree(
  tree: TreeNode,
  nodeId: string,
  newParentId: string,
  index: number
): TreeNode {
  // 先找到要移动的节点
  const nodeToMove = findNodeInTree(tree, nodeId)
  if (!nodeToMove) return tree

  // 从原位置删除
  const treeWithoutNode = deleteNodeFromTree(tree, nodeId)

  // 添加到新位置
  function addNodeToParent(node: TreeNode): TreeNode {
    if (node.id === newParentId) {
      const newChildren = [...node.children]
      newChildren.splice(index, 0, nodeToMove as TreeNode)
      return { ...node, children: newChildren }
    }

    return {
      ...node,
      children: node.children.map((child) => addNodeToParent(child)),
    }
  }

  return addNodeToParent(treeWithoutNode)
}

/**
 * 收集所有节点ID
 * 
 * @param tree 树结构
 * @returns 节点ID数组
 */
export function collectAllNodeIds(tree: TreeNode): string[] {
  const ids: string[] = [tree.id]
  
  for (const child of tree.children) {
    ids.push(...collectAllNodeIds(child))
  }
  
  return ids
}

/**
 * 计算子树高度（用于横向布局）
 * 
 * @param node 节点
 * @param config 布局配置
 * @returns 高度
 */
function calculateSubtreeHeight(
  node: TreeNode,
  config: typeof DEFAULT_LAYOUT_CONFIG
): number {
  if (node.children.length === 0 || node.isCollapsed) {
    return config.nodeHeight + config.siblingGap
  }

  let height = 0
  for (const child of node.children) {
    height += calculateSubtreeHeight(child, config)
  }

  return Math.max(config.nodeHeight + config.siblingGap, height)
}
