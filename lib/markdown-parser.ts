/**
 * Markdown解析服务
 *
 * 本模块提供Markdown解析功能，包括：
 * 1. YAML Front Matter解析
 * 2. 标题树解析（基于栈的算法）
 * 3. 内容块提取（只提取当前节点自身内容，不包含子节点内容）
 *
 * 对应技术文档第3.1节
 */

import { nanoid } from 'nanoid'
import yaml from 'js-yaml'
import type { TreeNode, DocumentMetadata, DocumentState, HeadingNode } from '@/types/tree'

/**
 * 生成唯一ID
 */
function generateId(): string {
  return nanoid(10)
}

/**
 * 步骤1：提取YAML Front Matter
 * 对应技术文档3.1节 - 步骤1
 *
 * @param content Markdown文本
 * @returns 元数据对象和剩余的markdown内容
 */
export function extractFrontMatter(content: string): {
  metadata: DocumentMetadata
  remainingContent: string
} {
  // 使用正则表达式匹配Front Matter
  // 支持两种格式：
  // 1. --- 后面直接跟换行符 (---\n)
  // 2. --- 在行首，后面可能有空白字符再跟换行符 (^---\s*\n)
  const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---/
  const match = content.match(frontMatterRegex)

  if (!match) {
    return { metadata: {}, remainingContent: content }
  }

  try {
    // 使用js-yaml解析YAML
    const metadata = yaml.load(match[1]) as DocumentMetadata || {}
    const remainingContent = content.slice(match[0].length).trimStart()
    return { metadata, remainingContent }
  } catch (error) {
    console.warn('Failed to parse YAML Front Matter:', error)
    return { metadata: {}, remainingContent: content }
  }
}

/**
 * 步骤2：提取所有标题节点
 * 对应技术文档3.1节 - 步骤2
 *
 * @param content Markdown内容（不含Front Matter）
 * @returns 标题节点数组
 */
export function extractHeadings(content: string): HeadingNode[] {
  const headings: HeadingNode[] = []
  // 使用正则匹配标题：^(#{1,6})\s+(.+)$
  const headingRegex = /^(#{1,6})\s+(.+)$/gm

  let match
  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length
    const title = match[2].trim()
    const position = match.index
    const endPosition = match.index + match[0].length

    headings.push({
      level,
      title,
      position,
      endPosition,
    })
  }

  return headings
}

/**
 * 步骤3：构建树结构（核心算法）- 优化版本
 * 对应技术文档3.1节 - 步骤3
 *
 * 算法优化：
 * 1. 层级优先查找：先确定文档中存在的最大标题层级
 * 2. 虚拟根节点：连接所有最大层级的标题（同级标题）
 * 3. 孤立节点处理：无父节点的标题作为孤立节点，不连接任何节点
 * 4. 栈结构构建：O(n)时间复杂度构建树
 *
 * 示例：
 * #### 四级标题A
 * # 一级A
 * ## 二级A1
 * #### 四级标题B
 *
 * 处理结果：
 * - 最大层级为1（存在一级标题）
 * - 一级A → 二级A1（正常层级关系）
 * - 四级标题A、四级标题B为孤立节点（无父节点）
 *
 * @param headings 标题节点数组（按文档顺序）
 * @param metadata 文档元数据（用于根节点标题）
 * @returns 树形结构的根节点
 */
export function buildTree(headings: HeadingNode[], metadata: DocumentMetadata): TreeNode {
  // 创建虚拟根节点（level=0）
  // 虚拟根节点标题固定为 'Front Matter'，用于显示
  const root: TreeNode = {
    id: 'root',
    level: 0,
    title: 'Front Matter',
    children: [],
    parentId: null,
    isVirtual: true,
    isCollapsed: false,
  }

  if (headings.length === 0) {
    return root
  }

  // 步骤1：确定最大标题层级
  // 从1到6查找，找到存在的最高层级
  let maxLevel = 6
  for (let level = 1; level <= 6; level++) {
    if (headings.some(h => h.level === level)) {
      maxLevel = level
      break
    }
  }

  // 步骤2：分类标题
  // - 顶级标题：层级等于maxLevel的标题
  // - 普通标题：其他层级的标题
  const topLevelHeadings = headings.filter(h => h.level === maxLevel)
  const normalHeadings = headings.filter(h => h.level > maxLevel)

  // 步骤3：构建节点映射
  const nodeMap = new Map<string, TreeNode>()

  // 创建所有标题对应的节点，并分配文档顺序
  const allNodes: TreeNode[] = []
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]
    const node: TreeNode = {
      id: generateId(),
      level: heading.level,
      title: heading.title,
      children: [],
      parentId: null, // 初始为null，后续根据关系设置
      isCollapsed: false,
      documentOrder: i, // 分配文档原始顺序
      // 记录原始位置信息，用于后续处理
      _headingIndex: i,
    } as TreeNode & { _headingIndex: number }

    nodeMap.set(node.id, node)
    allNodes.push(node)
  }

  // 步骤4：使用栈结构构建树关系
  // 按文档顺序处理标题，维护一个层级栈
  const stack: TreeNode[] = [root]

  for (const node of allNodes) {
    // 如果是顶级标题（最大层级），连接到虚拟根节点
    if (node.level === maxLevel) {
      node.parentId = root.id
      root.children.push(node)
      // 更新栈：弹出所有层级 >= 当前节点的，然后入栈当前节点
      while (stack.length > 1 && stack[stack.length - 1].level >= node.level) {
        stack.pop()
      }
      stack.push(node)
      continue
    }

    // 对于非顶级标题，查找父节点
    // 策略：向前查找最近的、层级小于当前节点的标题
    let parentFound = false

    // 从栈中查找合适的父节点
    while (stack.length > 1) {
      const potentialParent = stack[stack.length - 1]
      // 父节点必须满足：层级 < 当前节点层级
      if (potentialParent.level < node.level) {
        node.parentId = potentialParent.id
        potentialParent.children.push(node)
        parentFound = true
        break
      }
      // 如果不满足，弹出栈顶
      stack.pop()
    }

    // 如果没找到父节点（孤立节点），保持parentId为null
    // 这些节点不会连接到树中，但会保留在文档中
    if (!parentFound) {
      // 标记为孤立节点
      ;(node as TreeNode & { _isOrphan: boolean })._isOrphan = true
    }

    // 将当前节点入栈（如果找到了父节点）
    if (parentFound) {
      stack.push(node)
    }
  }

  // 步骤5：收集孤立节点到根节点的特殊children中（用于前端展示）
  // 这些节点在MD渲染时不显示，但在可视化中可以显示为未连接节点
  const orphanNodes = allNodes.filter(
    node => (node as TreeNode & { _isOrphan?: boolean })._isOrphan
  )

  if (orphanNodes.length > 0) {
    // 将孤立节点存储在根节点的元数据中
    ;(root as TreeNode & { orphanNodes?: TreeNode[] }).orphanNodes = orphanNodes
  }

  return root
}

/**
 * 步骤4：提取内容块 - 修复版本
 * 对应技术文档3.1节 - 步骤4
 *
 * 关键逻辑：
 * 每个节点只包含自身的内容，不包含子节点的内容
 * 自身内容 = 当前标题结束位置 到 下一个同级或更高级别标题之前 的内容
 *
 * 示例：
 * ## 二级标题
 * 这是二级标题的内容
 * ### 三级标题
 * 这是三级标题的内容
 *
 * 二级标题节点的内容 = "这是二级标题的内容"（不包含三级标题及其内容）
 * 三级标题节点的内容 = "这是三级标题的内容"
 *
 * @param content Markdown内容
 * @param headings 标题节点数组
 * @param root 根节点
 * @returns 填充了content字段的根节点
 */
export function extractContentBlocks(
  content: string,
  headings: HeadingNode[],
  root: TreeNode
): TreeNode {
  // 创建节点ID到heading索引的映射
  const nodeToHeadingIndex = new Map<string, number>()

  // 遍历树，为每个节点找到对应的heading索引
  function mapNodeToHeadingIndex(node: TreeNode, startIndex: number): number {
    if (node.isVirtual) {
      // 虚拟根节点
      let currentIndex = startIndex
      for (const child of node.children) {
        currentIndex = mapNodeToHeadingIndex(child, currentIndex)
      }
      return currentIndex
    }

    // 找到当前节点对应的heading
    for (let i = startIndex; i < headings.length; i++) {
      const heading = headings[i]
      // 匹配标题文本（可能有重复标题，所以还需要匹配层级）
      if (heading.title === node.title && heading.level === node.level) {
        nodeToHeadingIndex.set(node.id, i)

        // 递归处理子节点
        let childIndex = i + 1
        for (const child of node.children) {
          childIndex = mapNodeToHeadingIndex(child, childIndex)
        }
        return childIndex
      }
    }

    return startIndex
  }

  mapNodeToHeadingIndex(root, 0)

  /**
   * 获取节点的内容范围 - 修复版本
   *
   * 核心逻辑：
   * 1. 从当前标题的结束位置开始
   * 2. 找到下一个同级或更高级别标题的位置作为结束
   * 3. 如果中间有更低级别的标题（子标题），它们的内容不应该包含在当前节点中
   *
   * @param nodeId 节点ID
   * @returns 内容范围 {start, end} 或 null
   */
  function getNodeContentRange(nodeId: string): { start: number; end: number } | null {
    const headingIndex = nodeToHeadingIndex.get(nodeId)
    if (headingIndex === undefined) return null

    const heading = headings[headingIndex]
    const startPos = heading.endPosition

    // 找到结束位置：下一个同级或更高级别标题的位置
    let endPos = content.length
    for (let i = headingIndex + 1; i < headings.length; i++) {
      // 关键：只找同级或更高级别的标题
      // 如果找到更低级别的标题（子标题），跳过它，继续找
      if (headings[i].level <= heading.level) {
        endPos = headings[i].position
        break
      }
    }

    return { start: startPos, end: endPos }
  }

  /**
   * 清理内容 - 移除子标题及其内容
   *
   * @param rawContent 原始内容
   * @param nodeLevel 当前节点层级
   * @returns 清理后的内容
   */
  function cleanContent(rawContent: string, nodeLevel: number): string {
    if (!rawContent) return ''

    // 按行分割
    const lines = rawContent.split('\n')
    const result: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 检查是否是标题行
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        const headingLevel = headingMatch[1].length
        // 如果是更低级别的标题（子标题），跳过它和它的内容
        if (headingLevel > nodeLevel) {
          // 跳过这个子标题及其所有内容，直到遇到同级或更高级别的内容
          i++
          while (i < lines.length) {
            const nextLine = lines[i]
            const nextHeadingMatch = nextLine.match(/^(#{1,6})\s+(.+)$/)
            if (nextHeadingMatch) {
              const nextHeadingLevel = nextHeadingMatch[1].length
              // 如果遇到同级或更高级别的标题，回退一行并退出
              if (nextHeadingLevel <= nodeLevel) {
                i--
                break
              }
            }
            i++
          }
          continue
        }
      }

      result.push(line)
    }

    return result.join('\n').trim()
  }

  // 填充content字段
  function fillContent(node: TreeNode): TreeNode {
    if (!node.isVirtual) {
      const range = getNodeContentRange(node.id)
      if (range) {
        // 提取原始内容
        const rawContent = content.slice(range.start, range.end)
        // 清理内容，移除子标题及其内容
        const cleanedContent = cleanContent(rawContent, node.level)
        // 如果内容块为空，设置为undefined
        node.content = cleanedContent || undefined
      }
    } else {
      // 虚拟根节点：获取第一个标题之前的内容
      if (headings.length > 0) {
        const contentBlock = content.slice(0, headings[0].position).trim()
        node.content = contentBlock || undefined
      }
    }

    // 递归处理子节点
    node.children = node.children.map(fillContent)
    return node
  }

  return fillContent(root)
}

/**
 * 完整的Markdown解析函数
 * 对应技术文档4.1节 - IMarkdownParser接口
 *
 * @param content Markdown文本字符串
 * @param fileName 可选的文件名
 * @returns 完整的文档状态
 */
export function parseMarkdown(content: string, fileName?: string): DocumentState {
  // 步骤1：提取Front Matter
  const { metadata, remainingContent } = extractFrontMatter(content)

  // 步骤2：提取标题
  const headings = extractHeadings(remainingContent)

  // 步骤3：构建树结构
  const root = buildTree(headings, metadata)

  // 步骤4：提取内容块
  const rootWithContent = extractContentBlocks(remainingContent, headings, root)

  return {
    root: rootWithContent,
    metadata,
    originalContent: content,
    isModified: false,
    fileName,
  }
}

/**
 * 将树结构转换回Markdown文本
 * 对应技术文档4.1节 - IMarkdownParser接口
 *
 * @param document 文档状态
 * @returns Markdown文本字符串
 */
export function generateMarkdown(document: DocumentState): string {
  const lines: string[] = []

  // 添加Front Matter（如果有元数据）
  if (document.metadata && Object.keys(document.metadata).length > 0) {
    lines.push('---')
    // 简单的YAML序列化
    for (const [key, value] of Object.entries(document.metadata)) {
      if (value !== undefined && value !== null) {
        lines.push(`${key}: ${value}`)
      }
    }
    lines.push('---')
    lines.push('')
  }

  // 递归生成Markdown
  function generateNodeContent(node: TreeNode): void {
    if (!node.isVirtual) {
      // 添加标题
      const headingMarker = '#'.repeat(node.level)
      lines.push(`${headingMarker} ${node.title}`)
      lines.push('')

      // 添加内容（如果有）
      if (node.content) {
        lines.push(node.content)
        lines.push('')
      }
    } else {
      // 虚拟根节点的内容
      if (node.content) {
        lines.push(node.content)
        lines.push('')
      }
    }

    // 递归处理子节点
    for (const child of node.children) {
      generateNodeContent(child)
    }
  }

  generateNodeContent(document.root)

  return lines.join('\n').trim()
}
