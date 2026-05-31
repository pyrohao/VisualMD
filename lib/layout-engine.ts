/**
 * 树形布局算法
 *
 * 提供多种布局计算：
 * 1. 左右平衡（默认）
 * 2. 全左布局
 * 3. 全右布局
 * 4. 向下布局（组织架构图）
 */

import type { TreeNode, Position } from '@/types/tree'

export type BranchDirection = 'left' | 'right' | 'center' | 'down'
export type TreeLayoutMode = 'balanced' | 'left' | 'right' | 'down'

/**
 * 布局配置参数
 */
export interface LayoutConfig {
  /** 每层宽度（水平间距） */
  levelWidth: number
  /** 估算节点高度 */
  nodeHeight: number
  /** 兄弟节点垂直间距 */
  siblingGap: number
  /** 左侧边距 */
  startX: number
  /** 顶部边距 */
  startY: number
}

export interface LayoutResult {
  positions: Map<string, Position>
  directions: Map<string, BranchDirection>
}

/**
 * 默认布局配置
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  levelWidth: 240,
  nodeHeight: 80,
  siblingGap: 12,
  startX: 60,
  startY: 40,
}

function calculateSubtreeHeight(node: TreeNode, config: LayoutConfig): number {
  if (node.children.length === 0 || node.isCollapsed) {
    return config.nodeHeight + config.siblingGap
  }

  const childrenHeight = node.children.reduce(
    (sum, child) => sum + calculateSubtreeHeight(child, config),
    0
  )

  return Math.max(config.nodeHeight + config.siblingGap, childrenHeight)
}

function calculateBranchDepth(node: TreeNode): number {
  if (node.children.length === 0 || node.isCollapsed) {
    return 1
  }

  return 1 + Math.max(...node.children.map(calculateBranchDepth))
}

function splitRootChildren(children: TreeNode[]): {
  leftChildren: TreeNode[]
  rightChildren: TreeNode[]
} {
  const splitIndex = Math.floor(children.length / 2)

  return {
    leftChildren: children.slice(0, splitIndex),
    rightChildren: children.slice(splitIndex),
  }
}

function inferDirectionFromX(
  parentX: number,
  childX: number,
  fallback: BranchDirection
): BranchDirection {
  if (childX < parentX) {
    return 'left'
  }

  if (childX > parentX) {
    return 'right'
  }

  return fallback
}

function calculateHorizontalTreeLayoutResult(
  root: TreeNode,
  detachedNodes: TreeNode[],
  config: LayoutConfig,
  rootMode: 'balanced' | 'left' | 'right'
): LayoutResult {
  const positions = new Map<string, Position>()
  const directions = new Map<string, BranchDirection>()

  const rootChildrenSplit =
    rootMode === 'left'
      ? { leftChildren: root.children, rightChildren: [] as TreeNode[] }
      : rootMode === 'right'
        ? { leftChildren: [] as TreeNode[], rightChildren: root.children }
        : splitRootChildren(root.children)

  const { leftChildren, rightChildren } = rootChildrenSplit
  const maxLeftDepth = Math.max(0, ...leftChildren.map(calculateBranchDepth))
  const centerX = config.startX + maxLeftDepth * config.levelWidth

  const layoutBranch = (
    node: TreeNode,
    depth: number,
    startY: number,
    direction: Exclude<BranchDirection, 'center' | 'down'>
  ): number => {
    directions.set(node.id, direction)

    const x =
      direction === 'left'
        ? centerX - depth * config.levelWidth
        : centerX + depth * config.levelWidth

    if (node.children.length === 0 || node.isCollapsed) {
      positions.set(node.id, { x, y: startY })
      return config.nodeHeight + config.siblingGap
    }

    let currentY = startY

    for (const child of node.children) {
      const childHeight = calculateSubtreeHeight(child, config)
      layoutBranch(child, depth + 1, currentY, direction)
      currentY += childHeight
    }

    const occupiedHeight = currentY - startY
    const totalHeight = Math.max(config.nodeHeight + config.siblingGap, occupiedHeight)
    const y = startY + Math.max(0, (totalHeight - config.nodeHeight) / 2)

    positions.set(node.id, { x, y })
    return totalHeight
  }

  const layoutGroup = (
    nodes: TreeNode[],
    direction: Exclude<BranchDirection, 'center' | 'down'>,
    startY: number
  ): number => {
    let currentY = startY

    for (const node of nodes) {
      const subtreeHeight = calculateSubtreeHeight(node, config)
      layoutBranch(node, 1, currentY, direction)
      currentY += subtreeHeight
    }

    return currentY - startY
  }

  directions.set(root.id, 'center')

  if (root.children.length === 0 || root.isCollapsed) {
    positions.set(root.id, { x: centerX, y: config.startY })
  } else {
    const leftHeight = leftChildren.reduce(
      (sum, child) => sum + calculateSubtreeHeight(child, config),
      0
    )
    const rightHeight = rightChildren.reduce(
      (sum, child) => sum + calculateSubtreeHeight(child, config),
      0
    )

    const contentHeight = Math.max(
      config.nodeHeight + config.siblingGap,
      leftHeight,
      rightHeight
    )

    if (leftChildren.length > 0) {
      layoutGroup(leftChildren, 'left', config.startY + (contentHeight - leftHeight) / 2)
    }

    if (rightChildren.length > 0) {
      layoutGroup(rightChildren, 'right', config.startY + (contentHeight - rightHeight) / 2)
    }

    positions.set(root.id, {
      x: centerX,
      y: config.startY + Math.max(0, (contentHeight - config.nodeHeight) / 2),
    })
  }

  const preserveDetachedPosition = (
    node: TreeNode,
    parentPosition: Position | null,
    fallbackDirection: BranchDirection
  ) => {
    const fallbackX = parentPosition
      ? parentPosition.x + (fallbackDirection === 'left' ? -config.levelWidth : config.levelWidth)
      : centerX + config.levelWidth * 1.5
    const fallbackY = parentPosition ? parentPosition.y : config.startY
    const position = node.position ?? { x: fallbackX, y: fallbackY }
    const direction = parentPosition
      ? inferDirectionFromX(parentPosition.x, position.x, fallbackDirection)
      : inferDirectionFromX(centerX, position.x, fallbackDirection)

    positions.set(node.id, position)
    directions.set(node.id, direction)

    node.children.forEach((child, index) => {
      const childFallbackPosition = child.position ?? {
        x: position.x + (direction === 'left' ? -config.levelWidth : config.levelWidth),
        y: position.y + (index + 1) * (config.nodeHeight + config.siblingGap),
      }

      preserveDetachedPosition(
        { ...child, position: childFallbackPosition },
        position,
        direction
      )
    })
  }

  const layoutDetachedBranch = (
    node: TreeNode,
    depth: number,
    startY: number,
    startX: number,
    direction: Exclude<BranchDirection, 'center' | 'down'>
  ): number => {
    const x =
      direction === 'left'
        ? startX - depth * config.levelWidth
        : startX + depth * config.levelWidth

    positions.set(node.id, { x, y: startY })
    directions.set(node.id, direction)

    if (node.children.length === 0 || node.isCollapsed) {
      return config.nodeHeight + config.siblingGap
    }

    let currentY = startY

    for (const child of node.children) {
      const childHeight = calculateSubtreeHeight(child, config)
      layoutDetachedBranch(child, depth + 1, currentY, startX, direction)
      currentY += childHeight
    }

    const occupiedHeight = currentY - startY
    const totalHeight = Math.max(config.nodeHeight + config.siblingGap, occupiedHeight)
    const y = startY + Math.max(0, (totalHeight - config.nodeHeight) / 2)

    positions.set(node.id, { x, y })
    return totalHeight
  }

  if (detachedNodes.length > 0) {
    let maxX = centerX
    let nextDetachedY = config.startY

    for (const position of positions.values()) {
      maxX = Math.max(maxX, position.x)
      nextDetachedY = Math.max(nextDetachedY, position.y)
    }

    const detachedStartX = maxX + config.levelWidth * 1.5

    detachedNodes.forEach((detachedNode) => {
      if (detachedNode.position) {
        preserveDetachedPosition(detachedNode, null, 'right')
        const subtreeBottom = detachedNode.position.y + calculateSubtreeHeight(detachedNode, config)
        nextDetachedY = Math.max(nextDetachedY, subtreeBottom)
        return
      }

      layoutDetachedBranch(detachedNode, 0, nextDetachedY, detachedStartX, 'right')
      nextDetachedY += calculateSubtreeHeight(detachedNode, config)
    })
  }

  return { positions, directions }
}

function rotateToDownLayout(base: LayoutResult, rootId: string): LayoutResult {
  const positions = new Map<string, Position>()
  const directions = new Map<string, BranchDirection>()

  const rootPosition = base.positions.get(rootId) ?? { x: 0, y: 0 }

  for (const [nodeId, position] of base.positions.entries()) {
    positions.set(nodeId, {
      x: rootPosition.x + (position.y - rootPosition.y),
      y: rootPosition.y + (position.x - rootPosition.x),
    })

    directions.set(nodeId, nodeId === rootId ? 'center' : 'down')
  }

  return { positions, directions }
}

/**
 * 计算树布局及分支方向
 */
export function calculateTreeLayoutResult(
  root: TreeNode,
  detachedNodes: TreeNode[] = [],
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
  mode: TreeLayoutMode = 'balanced'
): LayoutResult {
  if (mode === 'down') {
    const rightLayout = calculateHorizontalTreeLayoutResult(root, detachedNodes, config, 'right')
    return rotateToDownLayout(rightLayout, root.id)
  }

  if (mode === 'left') {
    return calculateHorizontalTreeLayoutResult(root, detachedNodes, config, 'left')
  }

  if (mode === 'right') {
    return calculateHorizontalTreeLayoutResult(root, detachedNodes, config, 'right')
  }

  return calculateHorizontalTreeLayoutResult(root, detachedNodes, config, 'balanced')
}

/**
 * 兼容旧调用：只返回位置映射
 */
export function calculateTreeLayout(
  root: TreeNode,
  detachedNodes: TreeNode[] = [],
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
  mode: TreeLayoutMode = 'balanced'
): Map<string, Position> {
  return calculateTreeLayoutResult(root, detachedNodes, config, mode).positions
}

/**
 * 计算节点边界框
 */
export function calculateBounds(positions: Map<string, Position>): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x)
    maxY = Math.max(maxY, pos.y)
  }

  return { minX, minY, maxX, maxY }
}
