/**
 * Markdown可视化编辑器 - 核心类型定义
 * 
 * 本文件定义了文档树结构、元数据和文档状态的核心类型
 * 遵循技术文档第2章的数据结构设计
 */

/**
 * 树节点数据结构
 * 对应技术文档2.1节
 */
export interface TreeNode {
  /** 唯一标识符 */
  id: string
  /** 标题层级 (1-6)，0表示虚拟根节点 */
  level: number
  /** 标题文本 */
  title: string
  /** 标题下的内容块（两个标题之间的内容） */
  content?: string
  /** 子节点数组 */
  children: TreeNode[]
  /** 父节点ID，根节点为null */
  parentId: string | null
  /** 是否为虚拟根节点 */
  isVirtual?: boolean
  /** 是否收起（用于可视化） */
  isCollapsed?: boolean
  /** 是否断开连接（悬浮状态） */
  isDetached?: boolean
  /** 断开连接前的父节点ID（用于恢复） */
  detachedFrom?: string | null
  /** React Flow 需要的位置信息（由布局算法计算） */
  position?: {
    x: number
    y: number
  }
  /** 文档原始顺序（用于MD渲染排序） */
  documentOrder?: number
}

/**
 * 文档元数据（YAML Front Matter）
 * 对应技术文档2.1节
 */
export interface DocumentMetadata {
  name?: string
  description?: string
  author?: string
  version?: string
  /** 支持自定义字段 */
  [key: string]: any
}

/**
 * 完整文档状态
 * 对应技术文档2.1节
 */
export interface DocumentState {
  /** 文档元数据 */
  metadata: DocumentMetadata
  /** 根节点（包含整个树） */
  root: TreeNode
  /** 原始Markdown内容 */
  originalContent: string
  /** 是否已修改 */
  isModified: boolean
  /** 文件名 */
  fileName?: string
  /** 文件ID（用于关联编辑器状态） */
  fileId?: string
  /** 断开的节点数组（悬浮状态） */
  detachedNodes?: TreeNode[]
}

/**
 * React Flow 节点数据
 * 对应技术文档2.2节
 */
export interface FlowNodeData {
  /** 显示文本（标题） */
  label: string
  /** 层级（用于样式） */
  level: number
  /** 是否收起 */
  isCollapsed: boolean
  /** 是否有子节点 */
  hasChildren: boolean
  /** 内容预览 */
  content?: string
  /** 子节点数量 */
  childrenCount: number
  /** 允许额外属性以满足 Record<string, unknown> */
  [key: string]: unknown
}

/**
 * React Flow 节点类型
 */
export type FlowNodeType = 'headingNode'

/**
 * 节点位置
 */
export interface Position {
  x: number
  y: number
}

/**
 * 解析后的标题节点（用于构建树之前的中间结构）
 */
export interface HeadingNode {
  level: number
  title: string
  position: number
  endPosition: number
}

/**
 * 文件操作结果
 */
export interface FileOperationResult {
  success: boolean
  fileName?: string
  content?: string
  error?: string
}
