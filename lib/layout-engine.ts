/**
 * 树形布局算法
 *
 * 本模块提供树形布局计算功能，包括：
 * 1. 横向思维导图布局算法
 * 2. 节点位置计算
 *
 * 对应技术文档第3.3节
 */

import type { TreeNode, Position } from '@/types/tree'

/**
 * 布局配置参数
 */
export interface LayoutConfig {
  /** 每层宽度（水平间距，默认280px） */
  levelWidth: number
  /** 节点高度（默认100px） */
  nodeHeight: number
  /** 兄弟节点垂直间距（默认20px） */
  siblingGap: number
  /** 起始X偏移（默认50px） */
  startX: number
  /** 起始Y偏移（默认50px） */
  startY: number
}

/**
 * 默认布局配置 - 横向思维导图风格
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  levelWidth: 320,
  nodeHeight: 100,
  siblingGap: 16,
  startX: 80,
  startY: 50,
}

/**
 * 计算节点的子树高度（垂直方向）
 *
 * @param node 节点
 * @param config 布局配置
 * @returns 子树高度
 */
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

/**
 * 横向思维导图布局算法
 * 根节点在左侧，子节点向右展开
 *
 * 算法：计算横向树形布局
 * 时间复杂度：O(n)，n为节点数量
 *
 * @param root 根节点
 * @param detachedNodes 断开的节点数组（可选）
 * @param config 布局配置
 * @returns 节点ID到位置的映射
 */
export function calculateTreeLayout(
  root: TreeNode,
  detachedNodes: TreeNode[] = [],
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): Map<string, Position> {
  const positions = new Map<string, Position>()

  /**
   * 递归计算节点位置
   *
   * @param node 当前节点
   * @param depth 当前深度（层级）
   * @param startY 起始Y坐标
   * @returns 该子树占用的总高度
   */
  function calculateNodePosition(node: TreeNode, depth: number, startY: number): number {
    // X坐标：基于层级的水平位置
    const x = config.startX + depth * config.levelWidth

    if (node.children.length === 0 || node.isCollapsed) {
      // 叶子节点或折叠节点
      const y = startY + config.nodeHeight / 2
      positions.set(node.id, { x, y })
      return config.nodeHeight + config.siblingGap
    }

    // 计算所有子节点的位置
    let currentY = startY
    const childPositions: { node: TreeNode; y: number; height: number }[] = []

    for (const child of node.children) {
      const childHeight = calculateSubtreeHeight(child, config)
      const childY = currentY + childHeight / 2 - config.nodeHeight / 2
      childPositions.push({
        node: child,
        y: childY + config.nodeHeight / 2,
        height: childHeight,
      })
      calculateNodePosition(child, depth + 1, currentY)
      currentY += childHeight
    }

    // 父节点Y位置：所有子节点的中心
    const firstChild = childPositions[0]
    const lastChild = childPositions[childPositions.length - 1]
    const y = (firstChild.y + lastChild.y) / 2

    positions.set(node.id, { x, y })

    return currentY - startY
  }

  // 从根节点开始布局
  calculateNodePosition(root, 0, config.startY)

  // 计算断开的节点的位置（保留原位置）
  if (detachedNodes.length > 0) {
    detachedNodes.forEach((detachedNode) => {
      // 如果节点已有位置信息，保留原位置
      if (detachedNode.position) {
        // 递归保留断开节点及其子节点的位置
        function preserveDetachedPosition(node: TreeNode, parentX: number, parentY: number) {
          // 使用相对位置或绝对位置
          const x = node.position?.x ?? parentX + config.levelWidth
          const y = node.position?.y ?? parentY
          
          positions.set(node.id, { x, y })

          // 递归处理子节点
          if (node.children && node.children.length > 0) {
            node.children.forEach((child, index) => {
              preserveDetachedPosition(child, x, y + index * (config.nodeHeight + config.siblingGap))
            })
          }
        }

        preserveDetachedPosition(detachedNode, detachedNode.position.x, detachedNode.position.y)
      } else {
        // 如果没有位置信息，放在右侧独立区域
        // 找到已连接节点的最大 X 坐标
        let maxX = config.startX
        for (const pos of positions.values()) {
          maxX = Math.max(maxX, pos.x)
        }

        // 断开节点的起始位置（在已连接节点右侧留出间距）
        const detachedStartX = maxX + config.levelWidth * 1.5
        const detachedStartY = config.startY

        // 计算断开节点及其子树的位置
        const subtreeHeight = calculateSubtreeHeight(detachedNode, config)
        
        // 断开节点放在独立列
        function calculateDetachedPosition(node: TreeNode, depth: number, startY: number): number {
          const x = detachedStartX + depth * config.levelWidth

          if (node.children.length === 0 || node.isCollapsed) {
            const y = startY + config.nodeHeight / 2
            positions.set(node.id, { x, y })
            return config.nodeHeight + config.siblingGap
          }

          let currentY = startY
          const childPositions: { node: TreeNode; y: number; height: number }[] = []

          for (const child of node.children) {
            const childHeight = calculateSubtreeHeight(child, config)
            const childY = currentY + childHeight / 2 - config.nodeHeight / 2
            childPositions.push({
              node: child,
              y: childY + config.nodeHeight / 2,
              height: childHeight,
            })
            calculateDetachedPosition(child, depth + 1, currentY)
            currentY += childHeight
          }

          const firstChild = childPositions[0]
          const lastChild = childPositions[childPositions.length - 1]
          const y = (firstChild.y + lastChild.y) / 2

          positions.set(node.id, { x, y })

          return currentY - startY
        }

        calculateDetachedPosition(detachedNode, 0, detachedStartY)
      }
    })
  }

  return positions
}

/**
 * 计算节点在画布上的边界框
 * 用于自动调整视图
 *
 * @param positions 位置映射
 * @returns 边界框 { minX, minY, maxX, maxY }
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
