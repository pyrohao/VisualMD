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
  const frontMatterRegex = /^---\n([\s\S]*?)\n---/
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
 * 步骤3：构建树结构（核心算法）
 * 对应技术文档3.1节 - 步骤3
 *
 * 算法：基于栈的树构建算法
 * 时间复杂度：O(n)，n为标题数量
 * 空间复杂度：O(h)，h为树的最大深度
 *
 * @param headings 标题节点数组（按文档顺序）
 * @param metadata 文档元数据（用于根节点标题）
 * @returns 树形结构的根节点
 */
export function buildTree(headings: HeadingNode[], metadata: DocumentMetadata): TreeNode {
  // 创建虚拟根节点（level=0）
  const root: TreeNode = {
    id: 'root',
    level: 0,
    title: metadata.name || '未命名文档',
    children: [],
    parentId: null,
    isVirtual: true,
    isCollapsed: false,
  }

  if (headings.length === 0) {
    return root
  }

  // 初始化栈，将根节点入栈
  const stack: TreeNode[] = [root]

  for (const heading of headings) {
    // 弹出层级 >= 当前节点的
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop()
    }

    // 此时栈顶节点即为当前节点的父节点
    const parent = stack[stack.length - 1]

    // 创建新节点
    const node: TreeNode = {
      id: generateId(),
      level: heading.level,
      title: heading.title,
      children: [],
      parentId: parent.id,
      isCollapsed: false,
    }

    // 将当前节点添加到父节点的children数组
    parent.children.push(node)

    // 将当前节点入栈
    stack.push(node)
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
