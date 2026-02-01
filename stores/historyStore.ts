/**
 * 历史记录管理器 - 撤销/重做功能
 * 
 * 本模块提供全局历史记录管理，支持：
 * 1. 撤销/重做操作
 * 2. 历史记录限制（防止内存溢出）
 * 3. 批量操作合并
 * 4. 操作描述显示
 * 
 * 与 documentStore 配合使用
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { TreeNode, DocumentMetadata } from '@/types/tree'

/**
 * 历史记录条目类型
 */
export type HistoryActionType = 
  | 'updateNode' 
  | 'deleteNode' 
  | 'addChildNode' 
  | 'moveNode' 
  | 'moveNodeOrder'
  | 'updateMetadata' 
  | 'batch'
  | 'loadDocument'

/**
 * 历史记录条目
 */
export interface HistoryEntry {
  /** 操作类型 */
  type: HistoryActionType
  /** 操作描述（用于显示） */
  description: string
  /** 操作前的文档根节点状态 */
  previousRoot: TreeNode
  /** 操作前的元数据 */
  previousMetadata: DocumentMetadata
  /** 操作时间戳 */
  timestamp: number
}

/**
 * 历史记录状态接口
 */
interface HistoryStore {
  // ==================== 状态 ====================
  
  /** 撤销栈 */
  past: HistoryEntry[]
  /** 重做栈 */
  future: HistoryEntry[]
  /** 最大历史记录数 */
  maxHistorySize: number
  /** 是否正在撤销/重做中（防止循环触发） */
  isUndoing: boolean
  /** 批量操作模式 */
  isBatching: boolean
  /** 当前批量操作条目 */
  currentBatch: HistoryEntry | null
  
  // ==================== 操作 ====================
  
  /**
   * 添加历史记录
   * @param entry 历史记录条目（不含previousState，由store自动获取当前状态）
   */
  addHistory: (entry: Omit<HistoryEntry, 'previousRoot' | 'previousMetadata' | 'timestamp'>) => void
  
  /**
   * 开始批量操作
   * @param description 批量操作描述
   */
  startBatch: (description: string) => void
  
  /**
   * 结束批量操作
   */
  endBatch: () => void
  
  /**
   * 撤销
   * @returns 要恢复的状态，如果无法撤销则返回null
   */
  undo: () => { root: TreeNode; metadata: DocumentMetadata } | null
  
  /**
   * 重做
   * @returns 要恢复的状态，如果无法重做则返回null
   */
  redo: () => { root: TreeNode; metadata: DocumentMetadata } | null
  
  /**
   * 清空历史记录
   */
  clear: () => void
  
  /**
   * 设置最大历史记录数
   */
  setMaxHistorySize: (size: number) => void
  
  /**
   * 是否可以撤销
   */
  canUndo: () => boolean
  
  /**
   * 是否可以重做
   */
  canRedo: () => boolean
  
  /**
   * 获取当前操作描述（用于UI显示）
   */
  getCurrentDescription: () => string | null
}

/**
 * 外部获取当前文档状态的函数（由documentStore注入）
 */
let getCurrentDocumentState: (() => { root: TreeNode; metadata: DocumentMetadata } | null) | null = null

/**
 * 注入获取文档状态的函数
 * 在documentStore初始化时调用
 */
export function injectGetDocumentState(fn: () => { root: TreeNode; metadata: DocumentMetadata } | null) {
  getCurrentDocumentState = fn
}

/**
 * 深拷贝树节点（用于保存状态快照）
 */
function deepCloneTree(node: TreeNode): TreeNode {
  return {
    ...node,
    children: node.children.map(child => deepCloneTree(child)),
  }
}

/**
 * 创建历史记录Store
 */
export const useHistoryStore = create<HistoryStore>()(
  devtools(
    (set, get) => ({
      // ==================== 初始状态 ====================
      past: [],
      future: [],
      maxHistorySize: 50,
      isUndoing: false,
      isBatching: false,
      currentBatch: null,

      // ==================== 操作实现 ====================
      
      addHistory: (entry) => {
        const { past, maxHistorySize, isUndoing, isBatching, currentBatch } = get()
        
        // 如果正在撤销/重做中，不添加历史记录
        if (isUndoing) return
        
        // 获取当前文档状态
        const currentState = getCurrentDocumentState?.()
        if (!currentState) return
        
        const historyEntry: HistoryEntry = {
          ...entry,
          previousRoot: deepCloneTree(currentState.root),
          previousMetadata: { ...currentState.metadata },
          timestamp: Date.now(),
        }
        
        // 批量操作模式
        if (isBatching && currentBatch) {
          // 更新批量操作条目的previousState（保持最早的state）
          // 但更新type和description
          set({
            currentBatch: {
              ...currentBatch,
              type: entry.type,
              description: entry.description,
            }
          })
          return
        }
        
        // 正常添加历史记录
        const newPast = [...past, historyEntry]
        
        // 限制历史记录数量
        if (newPast.length > maxHistorySize) {
          newPast.shift()
        }
        
        set({ 
          past: newPast,
          future: [], // 清空重做栈
        })
      },

      startBatch: (description) => {
        const currentState = getCurrentDocumentState?.()
        if (!currentState) return
        
        set({
          isBatching: true,
          currentBatch: {
            type: 'batch',
            description,
            previousRoot: deepCloneTree(currentState.root),
            previousMetadata: { ...currentState.metadata },
            timestamp: Date.now(),
          }
        })
      },

      endBatch: () => {
        const { past, currentBatch, maxHistorySize } = get()
        
        if (currentBatch) {
          const newPast = [...past, currentBatch]
          
          // 限制历史记录数量
          if (newPast.length > maxHistorySize) {
            newPast.shift()
          }
          
          set({
            past: newPast,
            future: [],
            isBatching: false,
            currentBatch: null,
          })
        } else {
          set({
            isBatching: false,
            currentBatch: null,
          })
        }
      },

      undo: () => {
        const { past, future } = get()
        
        if (past.length === 0) return null
        
        set({ isUndoing: true })
        
        // 获取当前状态用于重做
        const currentState = getCurrentDocumentState?.()
        if (!currentState) {
          set({ isUndoing: false })
          return null
        }
        
        // 取出最后一条历史记录
        const previousEntry = past[past.length - 1]
        const newPast = past.slice(0, -1)
        
        // 创建重做条目
        const redoEntry: HistoryEntry = {
          type: previousEntry.type,
          description: previousEntry.description,
          previousRoot: deepCloneTree(currentState.root),
          previousMetadata: { ...currentState.metadata },
          timestamp: Date.now(),
        }
        
        set({
          past: newPast,
          future: [...future, redoEntry],
          isUndoing: false,
        })
        
        // 返回要恢复的状态
        return {
          root: previousEntry.previousRoot,
          metadata: previousEntry.previousMetadata,
        }
      },

      redo: () => {
        const { past, future } = get()
        
        if (future.length === 0) return null
        
        set({ isUndoing: true })
        
        // 获取当前状态
        const currentState = getCurrentDocumentState?.()
        if (!currentState) {
          set({ isUndoing: false })
          return null
        }
        
        // 取出最后一条重做记录
        const nextEntry = future[future.length - 1]
        const newFuture = future.slice(0, -1)
        
        // 创建撤销条目
        const undoEntry: HistoryEntry = {
          type: nextEntry.type,
          description: nextEntry.description,
          previousRoot: deepCloneTree(currentState.root),
          previousMetadata: { ...currentState.metadata },
          timestamp: Date.now(),
        }
        
        set({
          past: [...past, undoEntry],
          future: newFuture,
          isUndoing: false,
        })
        
        // 返回要恢复的状态
        return {
          root: nextEntry.previousRoot,
          metadata: nextEntry.previousMetadata,
        }
      },

      clear: () => {
        set({
          past: [],
          future: [],
          isBatching: false,
          currentBatch: null,
        })
      },

      setMaxHistorySize: (size) => {
        set({ maxHistorySize: size })
      },

      canUndo: () => {
        return get().past.length > 0
      },

      canRedo: () => {
        return get().future.length > 0
      },

      getCurrentDescription: () => {
        const { past } = get()
        if (past.length === 0) return null
        return past[past.length - 1].description
      },
    }),
    {
      name: 'history-store'
    }
  )
)

export default useHistoryStore
