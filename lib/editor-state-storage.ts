/**
 * 编辑器状态存储服务（基于 localStorage）
 * 
 * 提供分离存储方案，将运行时状态（断开节点、节点位置等）
 * 与 Markdown 内容分开保存
 * 
 * 对应技术文档第5章 - 状态管理扩展
 */

import type { TreeNode } from '@/types/tree'

/**
 * 节点位置信息
 */
export interface NodePosition {
  x: number
  y: number
}

/**
 * 编辑器状态（保存到 localStorage）
 */
export interface EditorState {
  /** 关联的文件ID */
  fileId: string
  /** 断开的节点数组 */
  detachedNodes: TreeNode[]
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
 * 状态存储版本号
 */
const STATE_VERSION = 1

/**
 * localStorage 键名前缀
 */
const STORAGE_KEY_PREFIX = 'markdown-editor:state:'

/**
 * 生成存储键名
 * @param fileId 文件ID
 * @returns localStorage 键名
 */
function getStorageKey(fileId: string): string {
  return `${STORAGE_KEY_PREFIX}${fileId}`
}

/**
 * 保存编辑器状态
 * @param state 编辑器状态
 */
export function saveEditorState(state: EditorState): void {
  try {
    const key = getStorageKey(state.fileId)
    const data = JSON.stringify(state)
    localStorage.setItem(key, data)
  } catch (error) {
    console.error('Failed to save editor state:', error)
  }
}

/**
 * 加载编辑器状态
 * @param fileId 文件ID
 * @returns 编辑器状态或null
 */
export function loadEditorState(fileId: string): EditorState | null {
  try {
    const key = getStorageKey(fileId)
    const data = localStorage.getItem(key)
    
    if (!data) {
      return null
    }
    
    const state = JSON.parse(data) as EditorState
    
    // 版本兼容性检查
    if (!state.version) {
      state.version = 1
    }
    
    // 确保必要字段存在
    if (!state.detachedNodes) {
      state.detachedNodes = []
    }
    if (!state.nodePositions) {
      state.nodePositions = {}
    }
    if (!state.expandedNodeIds) {
      state.expandedNodeIds = []
    }
    
    return state
  } catch (error) {
    console.error('Failed to load editor state:', error)
    return null
  }
}

/**
 * 删除编辑器状态
 * @param fileId 文件ID
 */
export function deleteEditorState(fileId: string): void {
  try {
    const key = getStorageKey(fileId)
    localStorage.removeItem(key)
  } catch (error) {
    console.error('Failed to delete editor state:', error)
  }
}

/**
 * 创建新的编辑器状态
 * @param fileId 文件ID
 * @returns 新的编辑器状态
 */
export function createEditorState(fileId: string): EditorState {
  return {
    fileId,
    detachedNodes: [],
    nodePositions: {},
    expandedNodeIds: ['root'],
    lastModified: Date.now(),
    version: STATE_VERSION,
  }
}

/**
 * 清理过期的编辑器状态（可选，用于定期清理）
 * @param maxAge 最大保存时间（毫秒），默认30天
 */
export function cleanupExpiredStates(maxAge: number = 30 * 24 * 60 * 60 * 1000): void {
  try {
    const now = Date.now()
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        try {
          const data = localStorage.getItem(key)
          if (data) {
            const state = JSON.parse(data) as EditorState
            
            // 如果状态过期，删除它
            if (now - state.lastModified > maxAge) {
              localStorage.removeItem(key)
            }
          }
        } catch {
          // 解析失败，删除损坏的数据
          localStorage.removeItem(key)
        }
      }
    }
  } catch (error) {
    console.error('Failed to cleanup expired states:', error)
  }
}

/**
 * 获取所有保存的状态文件ID
 * @returns 文件ID数组
 */
export function getAllStoredFileIds(): string[] {
  const fileIds: string[] = []
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        const fileId = key.substring(STORAGE_KEY_PREFIX.length)
        fileIds.push(fileId)
      }
    }
  } catch (error) {
    console.error('Failed to get stored file IDs:', error)
  }
  
  return fileIds
}
