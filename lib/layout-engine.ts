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
  /** 每层宽度（横向布局使用） */
  levelWidth: number
  /** 估算节点高度 */
  nodeHeight: number
  /** 常规兄弟节点间距 */
  siblingGap: number
  /** 左侧边距 */
  startX: number
  /** 顶部边距 */
  startY: number
}

interface ResolvedLayoutConfig extends LayoutConfig {
  nodeWidth: number
  rootSiblingGap: number
  rootLevelWidth: number
  levelHeight: number
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

const MODE_CONFIG_OVERRIDES: Record<TreeLayoutMode, Partial<ResolvedLayoutConfig>> = {
  balanced: {
    levelWidth: 250,
    siblingGap: 16,
    rootSiblingGap: 28,
    rootLevelWidth: 270,
    nodeWidth: 200,
    levelHeight: 150,
    startX: 72,
    startY: 48,
  },
  left: {
    levelWidth: 250,
    siblingGap: 18,
    rootSiblingGap: 34,
    rootLevelWidth: 290,
    nodeWidth: 200,
    levelHeight: 150,
    startX: 88,
    startY: 48,
  },
  right: {
    levelWidth: 250,
    siblingGap: 18,
    rootSiblingGap: 34,
    rootLevelWidth: 290,
    nodeWidth: 200,
    levelHeight: 150,
    startX: 88,
    startY: 48,
  },
  down: {
    siblingGap: 20,
    rootSiblingGap: 36,
    nodeWidth: 188,
    nodeHeight: 80,
    levelHeight: 152,
    startX: 60,
    startY: 52,
  },
}

function resolveLayoutConfig(
  baseConfig: LayoutConfig,
  mode: TreeLayoutMode
): ResolvedLayoutConfig {
  const overrides = MODE_CONFIG_OVERRIDES[mode]

  return {
    ...baseConfig,
    ...overrides,
    nodeWidth: overrides.nodeWidth ?? 200,
    rootSiblingGap: overrides.rootSiblingGap ?? Math.max(baseConfig.siblingGap * 2, 24),
    rootLevelWidth: overrides.rootLevelWidth ?? baseConfig.levelWidth,
    levelHeight: overrides.levelHeight ?? Math.max(baseConfig.nodeHeight + 60, 140),
  }
}

function getSiblingGap(config: ResolvedLayoutConfig, depth: number): number {
  return depth === 0 ? config.rootSiblingGap : config.siblingGap
}

function getHorizontalOffset(config: ResolvedLayoutConfig, depth: number): number {
  if (depth <= 0) {
    return 0
  }

  if (depth === 1) {
    return config.rootLevelWidth
  }

  return config.rootLevelWidth + (depth - 1) * config.levelWidth
}

function calculateBranchDepth(node: TreeNode): number {
  if (node.children.length === 0 || node.isCollapsed) {
    return 1
  }

  return 1 + Math.max(...node.children.map(calculateBranchDepth))
}

function calculateHorizontalSubtreeSpan(
  node: TreeNode,
  config: ResolvedLayoutConfig,
  depth: number
): number {
  if (node.children.length === 0 || node.isCollapsed) {
    return config.nodeHeight
  }

  const childSpans = node.children.map((child) =>
    calculateHorizontalSubtreeSpan(child, config, depth + 1)
  )
  const gap = getSiblingGap(config, depth)
  const childrenTotal =
    childSpans.reduce((sum, span) => sum + span, 0) + gap * Math.max(0, childSpans.length - 1)

  return Math.max(config.nodeHeight, childrenTotal)
}

function splitRootChildrenBySpan(
  children: TreeNode[],
  config: ResolvedLayoutConfig
): {
  leftChildren: TreeNode[]
  rightChildren: TreeNode[]
} {
  if (children.length <= 1) {
    return {
      leftChildren: children.slice(),
      rightChildren: [],
    }
  }

  const spans = children.map((child) => calculateHorizontalSubtreeSpan(child, config, 1))
  const prefixSums: number[] = [0]

  for (let index = 0; index < spans.length; index += 1) {
    prefixSums.push(prefixSums[index] + spans[index])
  }

  let bestSplitIndex = 1
  let bestDifference = Number.POSITIVE_INFINITY

  for (let splitIndex = 1; splitIndex < children.length; splitIndex += 1) {
    const leftSpan = prefixSums[splitIndex]
    const rightSpan = prefixSums[children.length] - leftSpan
    const difference = Math.abs(leftSpan - rightSpan)

    if (difference < bestDifference) {
      bestDifference = difference
      bestSplitIndex = splitIndex
    }
  }

  return {
    leftChildren: children.slice(0, bestSplitIndex),
    rightChildren: children.slice(bestSplitIndex),
  }
}

function calculateHorizontalTreeLayoutResult(
  root: TreeNode,
  config: ResolvedLayoutConfig,
  rootMode: 'balanced' | 'left' | 'right'
): LayoutResult {
  const positions = new Map<string, Position>()
  const directions = new Map<string, BranchDirection>()

  const rootChildrenSplit =
    rootMode === 'left'
      ? { leftChildren: root.children, rightChildren: [] as TreeNode[] }
      : rootMode === 'right'
        ? { leftChildren: [] as TreeNode[], rightChildren: root.children }
        : splitRootChildrenBySpan(root.children, config)

  const { leftChildren, rightChildren } = rootChildrenSplit
  const maxLeftDepth = Math.max(0, ...leftChildren.map(calculateBranchDepth))
  const centerX = config.startX + getHorizontalOffset(config, maxLeftDepth)

  const layoutBranch = (
    node: TreeNode,
    depth: number,
    startY: number,
    direction: Exclude<BranchDirection, 'center' | 'down'>
  ): number => {
    directions.set(node.id, direction)

    const x =
      direction === 'left'
        ? centerX - getHorizontalOffset(config, depth)
        : centerX + getHorizontalOffset(config, depth)

    const span = calculateHorizontalSubtreeSpan(node, config, depth)
    const y = startY + Math.max(0, (span - config.nodeHeight) / 2)
    positions.set(node.id, { x, y })

    if (node.children.length === 0 || node.isCollapsed) {
      return span
    }

    const gap = getSiblingGap(config, depth)
    let currentY = startY

    for (const child of node.children) {
      const childSpan = calculateHorizontalSubtreeSpan(child, config, depth + 1)
      layoutBranch(child, depth + 1, currentY, direction)
      currentY += childSpan + gap
    }

    return span
  }

  const layoutGroup = (
    nodes: TreeNode[],
    direction: Exclude<BranchDirection, 'center' | 'down'>,
    startY: number
  ): number => {
    let currentY = startY
    const gap = getSiblingGap(config, 0)

    for (const node of nodes) {
      const subtreeSpan = calculateHorizontalSubtreeSpan(node, config, 1)
      layoutBranch(node, 1, currentY, direction)
      currentY += subtreeSpan + gap
    }

    return currentY - startY - (nodes.length > 0 ? gap : 0)
  }

  directions.set(root.id, 'center')

  if (root.children.length === 0 || root.isCollapsed) {
    positions.set(root.id, { x: centerX, y: config.startY })
    return { positions, directions }
  }

  const leftHeight = leftChildren.reduce(
    (sum, child, index) =>
      sum +
      calculateHorizontalSubtreeSpan(child, config, 1) +
      (index > 0 ? getSiblingGap(config, 0) : 0),
    0
  )
  const rightHeight = rightChildren.reduce(
    (sum, child, index) =>
      sum +
      calculateHorizontalSubtreeSpan(child, config, 1) +
      (index > 0 ? getSiblingGap(config, 0) : 0),
    0
  )

  const contentHeight = Math.max(config.nodeHeight, leftHeight, rightHeight)

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

  return { positions, directions }
}

function calculateDownSubtreeWidth(
  node: TreeNode,
  config: ResolvedLayoutConfig,
  depth: number
): number {
  if (node.children.length === 0 || node.isCollapsed) {
    return config.nodeWidth
  }

  const childWidths = node.children.map((child) =>
    calculateDownSubtreeWidth(child, config, depth + 1)
  )
  const gap = getSiblingGap(config, depth)
  const childrenTotal =
    childWidths.reduce((sum, width) => sum + width, 0) +
    gap * Math.max(0, childWidths.length - 1)

  return Math.max(config.nodeWidth, childrenTotal)
}

function calculateDownTreeLayoutResult(
  root: TreeNode,
  config: ResolvedLayoutConfig
): LayoutResult {
  const positions = new Map<string, Position>()
  const directions = new Map<string, BranchDirection>()

  const layoutNode = (node: TreeNode, left: number, depth: number): number => {
    const subtreeWidth = calculateDownSubtreeWidth(node, config, depth)
    const x = left + Math.max(0, (subtreeWidth - config.nodeWidth) / 2)
    const y = config.startY + depth * config.levelHeight

    positions.set(node.id, { x, y })
    directions.set(node.id, node.id === root.id ? 'center' : 'down')

    if (node.children.length === 0 || node.isCollapsed) {
      return subtreeWidth
    }

    const gap = getSiblingGap(config, depth)
    let currentLeft = left

    for (const child of node.children) {
      const childWidth = calculateDownSubtreeWidth(child, config, depth + 1)
      layoutNode(child, currentLeft, depth + 1)
      currentLeft += childWidth + gap
    }

    return subtreeWidth
  }

  layoutNode(root, config.startX, 0)
  return { positions, directions }
}

/**
 * 计算树布局及分支方向
 */
export function calculateTreeLayoutResult(
  root: TreeNode,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
  mode: TreeLayoutMode = 'balanced'
): LayoutResult {
  const resolvedConfig = resolveLayoutConfig(config, mode)

  if (mode === 'down') {
    return calculateDownTreeLayoutResult(root, resolvedConfig)
  }

  if (mode === 'left') {
    return calculateHorizontalTreeLayoutResult(root, resolvedConfig, 'left')
  }

  if (mode === 'right') {
    return calculateHorizontalTreeLayoutResult(root, resolvedConfig, 'right')
  }

  return calculateHorizontalTreeLayoutResult(root, resolvedConfig, 'balanced')
}

/**
 * 兼容旧调用：只返回位置映射
 */
export function calculateTreeLayout(
  root: TreeNode,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG,
  mode: TreeLayoutMode = 'balanced'
): Map<string, Position> {
  return calculateTreeLayoutResult(root, config, mode).positions
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
