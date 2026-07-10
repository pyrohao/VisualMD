/**
 * 编辑器状态管理服务
 * 
 * 提供分离存储方案，将运行时状态（节点位置、展开状态等）
 * 与 Markdown 内容分开保存
 * 
 * 对应技术文档第5章 - 状态管理扩展
 */

/**
 * 节点位置信息
 */
export interface NodePosition {
  x: number
  y: number
}

/**
 * 编辑器状态（保存到 .state.json 文件）
 */
export interface EditorState {
  /** 关联的 Markdown 文件路径 */
  filePath: string
  /** 节点位置映射 */
  nodePositions: Record<string, NodePosition>
  /** 展开的节点ID集合 */
  expandedNodeIds: string[]
  /** 最后修改时间 */
  lastModified: number
  /** 版本号（用于未来兼容性） */
  version: number
}

/**
 * 状态文件版本号
 */
const STATE_VERSION = 1

/**
 * 生成状态文件名
 * @param mdFilePath Markdown文件路径
 * @returns 状态文件路径
 */
export function getStateFilePath(mdFilePath: string): string {
  // 在同级目录下创建 .markdown-editor 文件夹存放状态
  const lastSlashIndex = mdFilePath.lastIndexOf('/')
  const lastBackslashIndex = mdFilePath.lastIndexOf('\\')
  const separatorIndex = Math.max(lastSlashIndex, lastBackslashIndex)
  
  if (separatorIndex === -1) {
    return `.markdown-editor/${mdFilePath}.state.json`
  }
  
  const dir = mdFilePath.substring(0, separatorIndex)
  const fileName = mdFilePath.substring(separatorIndex + 1)
  return `${dir}/.markdown-editor/${fileName}.state.json`
}

/**
 * 序列化编辑器状态
 * @param state 编辑器状态
 * @returns JSON字符串
 */
export function serializeEditorState(state: EditorState): string {
  return JSON.stringify(state, null, 2)
}

/**
 * 反序列化编辑器状态
 * @param json JSON字符串
 * @returns 编辑器状态或null
 */
export function deserializeEditorState(json: string): EditorState | null {
  try {
    const state = JSON.parse(json) as EditorState
    
    // 版本兼容性检查
    if (!state.version) {
      state.version = 1
    }
    
    // 确保必要字段存在
    if (!state.nodePositions) {
      state.nodePositions = {}
    }
    if (!state.expandedNodeIds) {
      state.expandedNodeIds = []
    }
    
    return state
  } catch (error) {
    console.error('Failed to deserialize editor state:', error)
    return null
  }
}

/**
 * 创建新的编辑器状态
 * @param filePath Markdown文件路径
 * @returns 新的编辑器状态
 */
export function createEditorState(filePath: string): EditorState {
  return {
    filePath,
    nodePositions: {},
    expandedNodeIds: ['root'],
    lastModified: Date.now(),
    version: STATE_VERSION,
  }
}

/**
 * 从文档状态提取编辑器状态
 * @param filePath 文件路径
 * @param expandedNodeIds 展开的节点ID
 * @param nodePositions 节点位置
 * @returns 编辑器状态
 */
export function extractEditorState(
  filePath: string,
  expandedNodeIds: Set<string>,
  nodePositions: Record<string, NodePosition>
): EditorState {
  return {
    filePath,
    nodePositions,
    expandedNodeIds: Array.from(expandedNodeIds),
    lastModified: Date.now(),
    version: STATE_VERSION,
  }
}
