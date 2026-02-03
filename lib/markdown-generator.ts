/**
 * Markdown生成服务
 * 
 * 本模块提供从树结构生成Markdown的功能，包括：
 * 1. YAML Front Matter生成
 * 2. 深度优先遍历生成内容（核心算法）
 * 
 * 对应技术文档第3.2节
 */

import yaml from 'js-yaml'
import type { TreeNode, DocumentMetadata, DocumentState } from '@/types/tree'

/**
 * 步骤1：生成YAML Front Matter
 * 对应技术文档3.2节 - 步骤1
 * 
 * @param metadata 文档元数据
 * @returns YAML Front Matter字符串
 */
export function generateFrontMatter(metadata: DocumentMetadata): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return ''
  }

  try {
    // 使用js-yaml.dump()将metadata转为YAML字符串
    const yamlStr = yaml.dump(metadata, {
      indent: 2,
      lineWidth: -1, // 不限制行宽
      noRefs: true,
      sortKeys: false,
    })
    
    // 包装在 --- 之间
    return `---\n${yamlStr}---\n\n`
  } catch (error) {
    return ''
  }
}

/**
 * 步骤2：深度优先遍历生成内容（核心算法）- 优化版本
 * 对应技术文档3.2节 - 步骤2
 * 
 * 算法：DFS生成Markdown，子节点按children数组顺序渲染
 * 时间复杂度：O(n)，n为节点数量
 * 
 * 注意：
 * 1. 断开的节点（isDetached=true）不会渲染到Markdown中
 * 2. 子节点按children数组顺序渲染，用户可通过调整顺序控制MD输出
 * 
 * @param node 当前节点
 * @param currentLevel 当前层级（用于计算#数量）
 * @returns Markdown字符串
 */
export function generateContent(node: TreeNode, currentLevel: number = 1): string {
  let result = ''

  // 如果节点是断开的，跳过该节点及其所有子节点
  if (node.isDetached) {
    return ''
  }

  // 如果节点不是虚拟根节点
  if (node.level > 0) {
    // 生成标题："#".repeat(level) + " " + title + "\n\n"
    const hashes = '#'.repeat(node.level)
    result += `${hashes} ${node.title}\n\n`
    
    // 如果有内容，追加内容 + "\n\n"
    if (node.content && node.content.trim()) {
      result += `${node.content.trim()}\n\n`
    }
  }

  // 递归处理每个子节点，按children数组顺序
  // 用户可通过上移/下移节点来调整渲染顺序
  for (const child of node.children) {
    result += generateContent(child, currentLevel + 1)
  }

  return result
}

/**
 * 从树结构生成完整Markdown
 * 对应技术文档4.2节 - IMarkdownGenerator接口
 * 
 * @param root 根节点
 * @param metadata 可选的元数据
 * @returns 完整的Markdown文本
 */
export function generateMarkdown(root: TreeNode, metadata?: DocumentMetadata): string {
  let markdown = ''

  // 添加YAML Front Matter
  if (metadata) {
    markdown += generateFrontMatter(metadata)
  }

  // 生成内容
  // 如果根节点是虚拟的，从子节点开始生成
  if (root.isVirtual || root.level === 0) {
    for (const child of root.children) {
      markdown += generateContent(child)
    }
  } else {
    markdown += generateContent(root)
  }

  return markdown.trim()
}

/**
 * 从文档状态生成Markdown
 * 对应技术文档4.2节 - generate(state: DocumentState)
 * 
 * @param state 文档状态
 * @returns Markdown文本
 */
export function generateFromState(state: DocumentState): string {
  return generateMarkdown(state.root, state.metadata)
}

/**
 * 仅生成内容部分（不含Front Matter）
 * 对应技术文档4.2节 - generateContent(root: TreeNode)
 * 
 * @param root 根节点
 * @returns 内容部分的Markdown文本
 */
export function generateContentOnly(root: TreeNode): string {
  let markdown = ''

  // 如果根节点是虚拟的，从子节点开始生成
  if (root.isVirtual || root.level === 0) {
    for (const child of root.children) {
      markdown += generateContent(child)
    }
  } else {
    markdown += generateContent(root)
  }

  return markdown.trim()
}

// 向后兼容的导出
export const treeToMarkdown = generateMarkdown
