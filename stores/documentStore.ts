/**
 * 文档状态管理 - Zustand Store
 * 
 * 本模块提供全局文档状态管理，包括：
 * 1. 文档加载、保存
 * 2. 节点更新、移动、删除
 * 3. 节点选择、展开/收起
 * 4. 计算属性（currentMarkdown, isModified）
 * 
 * 对应技术文档第5章
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { TreeNode, DocumentState, DocumentMetadata } from '@/types/tree'
import { parseMarkdown } from '@/lib/markdown-parser'
import { generateFromState, generateMarkdown } from '@/lib/markdown-generator'

/**
 * 文档Store状态接口
 * 对应技术文档5.1节
 */
interface DocumentStore {
  // ==================== 状态 ====================
  
  /** 当前文档状态 */
  document: DocumentState | null
  /** 当前选中的节点ID */
  selectedNodeId: string | null
  /** 展开的节点ID集合 */
  expandedNodeIds: Set<string>
  /** 加载状态 */
  isLoading: boolean
  /** 错误信息 */
  error: string | null

  // ==================== 操作 ====================
  
  /**
   * 加载文档
   * @param content Markdown内容
   * @param fileName 文件名
   */
  loadDocument: (content: string, fileName?: string) => void
  
  /**
   * 保存文档（标记为未修改）
   */
  markAsSaved: () => void
  
  /**
   * 更新节点
   * @param nodeId 节点ID
   * @param updates 更新的字段
   */
  updateNode: (nodeId: string, updates: Partial<TreeNode>) => void
  
  /**
   * 移动节点
   * @param nodeId 要移动的节点ID
   * @param newParentId 新父节点ID
   * @param index 在新父节点中的位置
   */
  moveNode: (nodeId: string, newParentId: string, index: number) => void
  
  /**
   * 删除节点
   * @param nodeId 节点ID
   */
  deleteNode: (nodeId: string) => void

  /**
   * 添加子节点
   * @param parentId 父节点ID
   * @param title 节点标题
   * @returns 新节点ID
   */
  addChildNode: (parentId: string, title: string) => string | null

  /**
   * 断开节点连接
   * @param nodeId 要断开的节点ID
   */
  detachNode: (nodeId: string) => void

  /**
   * 连接节点到新的父节点
   * @param nodeId 要连接的节点ID
   * @param parentId 目标父节点ID
   */
  connectNode: (nodeId: string, parentId: string) => void

  /**
   * 选择节点
   * @param nodeId 节点ID
   */
  selectNode: (nodeId: string | null) => void
  
  /**
   * 切换节点展开/收起状态
   * @param nodeId 节点ID
   */
  toggleNode: (nodeId: string) => void
  
  /**
   * 展开所有节点
   */
  expandAll: () => void
  
  /**
   * 收起所有节点
   */
  collapseAll: () => void
  
  /**
   * 更新元数据
   * @param metadata 新的元数据
   */
  updateMetadata: (metadata: Partial<DocumentMetadata>) => void
  
  /**
   * 从Markdown文本更新（用于文本编辑器）
   * @param markdown Markdown文本
   */
  updateFromMarkdown: (markdown: string) => void
  
  /**
   * 设置错误信息
   * @param error 错误信息
   */
  setError: (error: string | null) => void
  
  /**
   * 清除错误
   */
  clearError: () => void

  // ==================== 计算属性 ====================
  
  /**
   * 获取当前Markdown文本
   */
  getCurrentMarkdown: () => string
  
  /**
   * 检查文档是否已修改
   */
  getIsModified: () => boolean
  
  /**
   * 获取选中的节点
   */
  getSelectedNode: () => TreeNode | null
  
  /**
   * 根据ID查找节点
   * @param nodeId 节点ID
   */
  findNodeById: (nodeId: string) => TreeNode | null
}

/**
 * 在树中查找节点
 */
function findNodeInTree(root: TreeNode, nodeId: string): TreeNode | null {
  if (root.id === nodeId) {
    return root
  }
  
  for (const child of root.children) {
    const found = findNodeInTree(child, nodeId)
    if (found) return found
  }
  
  return null
}

/**
 * 在树中查找父节点
 */
function findParentInTree(root: TreeNode, nodeId: string): TreeNode | null {
  for (const child of root.children) {
    if (child.id === nodeId) {
      return root
    }
    const found = findParentInTree(child, nodeId)
    if (found) return found
  }
  return null
}

/**
 * 更新树中的节点
 */
function updateNodeInTree(root: TreeNode, nodeId: string, updates: Partial<TreeNode>): TreeNode {
  if (root.id === nodeId) {
    return { ...root, ...updates }
  }
  
  return {
    ...root,
    children: root.children.map(child => updateNodeInTree(child, nodeId, updates))
  }
}

/**
 * 从树中删除节点
 */
function deleteNodeFromTree(root: TreeNode, nodeId: string): TreeNode {
  return {
    ...root,
    children: root.children
      .filter(child => child.id !== nodeId)
      .map(child => deleteNodeFromTree(child, nodeId))
  }
}

/**
 * 移动节点
 */
function moveNodeInTree(
  root: TreeNode,
  nodeId: string,
  newParentId: string,
  index: number
): TreeNode {
  // 找到要移动的节点
  const nodeToMove = findNodeInTree(root, nodeId)
  if (!nodeToMove) return root
  
  // 检查是否会导致循环引用
  let currentParent = findParentInTree(root, newParentId)
  while (currentParent) {
    if (currentParent.id === nodeId) {
      throw new Error('Cannot move node to its own descendant')
    }
    currentParent = findParentInTree(root, currentParent.id)
  }
  
  // 从原位置删除
  let newRoot = deleteNodeFromTree(root, nodeId)
  
  // 找到新父节点
  const newParent = findNodeInTree(newRoot, newParentId)
  if (!newParent) return root
  
  // 插入到新位置
  const updatedChildren = [...newParent.children]
  updatedChildren.splice(index, 0, { ...nodeToMove, parentId: newParentId })
  
  // 更新新父节点
  newRoot = updateNodeInTree(newRoot, newParentId, { children: updatedChildren })
  
  return newRoot
}

/**
 * 收集所有节点ID
 */
function collectAllNodeIds(root: TreeNode): string[] {
  const ids = [root.id]
  for (const child of root.children) {
    ids.push(...collectAllNodeIds(child))
  }
  return ids
}

/**
 * 在树中添加子节点
 * @param root 根节点
 * @param parentId 父节点ID
 * @param newNode 新节点
 * @returns 更新后的根节点
 */
function addChildNodeInTree(root: TreeNode, parentId: string, newNode: TreeNode): TreeNode {
  if (root.id === parentId) {
    return {
      ...root,
      children: [...root.children, newNode]
    }
  }

  return {
    ...root,
    children: root.children.map(child => addChildNodeInTree(child, parentId, newNode))
  }
}

/**
 * 从树中分离节点（保留节点但移除父子关系）
 * @param root 根节点
 * @param nodeId 要分离的节点ID
 * @returns 更新后的根节点和分离的节点
 */
function detachNodeFromTree(root: TreeNode, nodeId: string): { root: TreeNode; detachedNode: TreeNode | null } {
  const nodeToDetach = findNodeInTree(root, nodeId)
  if (!nodeToDetach) return { root, detachedNode: null }

  // 从原父节点中移除
  const newRoot = deleteNodeFromTree(root, nodeId)

  // 标记为断开状态
  const detachedNode: TreeNode = {
    ...nodeToDetach,
    isDetached: true,
    detachedFrom: nodeToDetach.parentId,
    parentId: null
  }

  return { root: newRoot, detachedNode }
}

/**
 * 将断开的节点连接到新的父节点
 * @param root 根节点
 * @param detachedNode 断开的节点
 * @param parentId 新的父节点ID
 * @returns 更新后的根节点
 */
function connectNodeToTree(root: TreeNode, detachedNode: TreeNode, parentId: string): TreeNode {
  // 找到目标父节点
  const parentNode = findNodeInTree(root, parentId)
  if (!parentNode) return root

  // 恢复节点状态
  const connectedNode: TreeNode = {
    ...detachedNode,
    isDetached: false,
    detachedFrom: null,
    parentId: parentId,
    level: parentNode.level + 1
  }

  // 递归更新所有子节点的层级
  const updateChildrenLevel = (node: TreeNode): TreeNode => ({
    ...node,
    children: node.children.map(child => ({
      ...updateChildrenLevel(child),
      level: node.level + 1
    }))
  })

  const finalNode = updateChildrenLevel(connectedNode)

  // 添加到新父节点
  return addChildNodeInTree(root, parentId, finalNode)
}

/**
 * 收集所有断开的节点
 * @param root 根节点
 * @returns 断开的节点数组
 */
function collectDetachedNodes(root: TreeNode): TreeNode[] {
  const detached: TreeNode[] = []

  function traverse(node: TreeNode) {
    if (node.isDetached) {
      detached.push(node)
    }
    for (const child of node.children) {
      traverse(child)
    }
  }

  traverse(root)
  return detached
}

/**
 * 创建文档Store
 */
export const useDocumentStore = create<DocumentStore>()(
  devtools(
    (set, get) => ({
      // ==================== 初始状态 ====================
      document: null,
      selectedNodeId: null,
      expandedNodeIds: new Set(['root']),
      isLoading: false,
      error: null,

      // ==================== 操作实现 ====================
      
      loadDocument: (content: string, fileName?: string) => {
        try {
          const document = parseMarkdown(content, fileName)
          // 默认展开所有节点
          const allIds = collectAllNodeIds(document.root)
          set({ 
            document, 
            expandedNodeIds: new Set(allIds),
            selectedNodeId: null,
            error: null 
          })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to load document' 
          })
        }
      },

      markAsSaved: () => {
        const { document } = get()
        if (document) {
          set({ 
            document: { ...document, isModified: false } 
          })
        }
      },

      updateNode: (nodeId: string, updates: Partial<TreeNode>) => {
        const { document } = get()
        if (!document) return
        
        const newRoot = updateNodeInTree(document.root, nodeId, updates)
        set({ 
          document: { 
            ...document, 
            root: newRoot, 
            isModified: true 
          } 
        })
      },

      moveNode: (nodeId: string, newParentId: string, index: number) => {
        const { document } = get()
        if (!document) return
        
        try {
          const newRoot = moveNodeInTree(document.root, nodeId, newParentId, index)
          set({ 
            document: { 
              ...document, 
              root: newRoot, 
              isModified: true 
            } 
          })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to move node' 
          })
        }
      },

      deleteNode: (nodeId: string) => {
        const { document, selectedNodeId } = get()
        if (!document || nodeId === 'root') return
        
        const newRoot = deleteNodeFromTree(document.root, nodeId)
        set({ 
          document: { 
            ...document, 
            root: newRoot, 
            isModified: true 
          },
          selectedNodeId: selectedNodeId === nodeId ? null : selectedNodeId
        })
      },

      addChildNode: (parentId: string, title: string) => {
        const { document } = get()
        if (!document) return null

        // 查找父节点
        const parentNode = findNodeInTree(document.root, parentId)
        if (!parentNode) return null

        // 检查层级限制（最大6级）
        if (parentNode.level >= 6) {
          set({ error: '已达到最大层级限制（6级），无法继续添加子节点' })
          return null
        }

        // 创建新节点
        const newNode: TreeNode = {
          id: nanoid(10),
          level: parentNode.level + 1,
          title: title || '新节点',
          children: [],
          parentId: parentId,
          isCollapsed: false,
        }

        // 添加到树中
        const newRoot = addChildNodeInTree(document.root, parentId, newNode)
        
        // 自动展开父节点
        const { expandedNodeIds } = get()
        const newExpanded = new Set(expandedNodeIds)
        newExpanded.add(parentId)

        set({ 
          document: { 
            ...document, 
            root: newRoot, 
            isModified: true 
          },
          expandedNodeIds: newExpanded,
          error: null
        })

        return newNode.id
      },

      detachNode: (nodeId: string) => {
        const { document } = get()
        if (!document || nodeId === 'root') return

        // 查找节点
        const node = findNodeInTree(document.root, nodeId)
        if (!node) return

        // 检查是否是虚拟根节点的直接子节点（一级节点）
        if (node.parentId === 'root') {
          set({ error: '一级节点不能断开连接，它是文档的根结构' })
          return
        }

        // 断开节点
        const { root: newRoot, detachedNode } = detachNodeFromTree(document.root, nodeId)
        
        if (!detachedNode) {
          set({ error: '断开节点失败' })
          return
        }

        // 将断开的节点存储在文档的 detachedNodes 中
        const detachedNodes = (document as any).detachedNodes || []
        
        set({ 
          document: { 
            ...document, 
            root: newRoot,
            detachedNodes: [...detachedNodes, detachedNode],
            isModified: true 
          },
          error: null
        })
      },

      connectNode: (nodeId: string, parentId: string) => {
        const { document } = get()
        if (!document) return

        // 从 detachedNodes 中找到断开的节点
        const detachedNodes = (document as any).detachedNodes || []
        const detachedNode = detachedNodes.find((n: TreeNode) => n.id === nodeId)
        
        if (!detachedNode) {
          set({ error: '找不到断开的节点' })
          return
        }

        // 查找目标父节点
        const parentNode = findNodeInTree(document.root, parentId)
        if (!parentNode) {
          set({ error: '找不到目标父节点' })
          return
        }

        // 验证层级关系：只能连接到大一级的节点
        const expectedLevel = parentNode.level + 1
        if (detachedNode.level !== expectedLevel) {
          if (detachedNode.level < expectedLevel) {
            set({ error: `不能将 H${detachedNode.level} 节点连接到 H${parentNode.level} 节点下，目标父节点层级太高` })
          } else {
            set({ error: `不能将 H${detachedNode.level} 节点连接到 H${parentNode.level} 节点下，目标父节点层级太低` })
          }
          return
        }

        // 检查是否会导致循环引用
        let currentParent = findParentInTree(document.root, parentId)
        while (currentParent) {
          if (currentParent.id === nodeId) {
            set({ error: '不能将节点连接到其自身的后代节点下' })
            return
          }
          currentParent = findParentInTree(document.root, currentParent.id)
        }

        // 连接节点
        const newRoot = connectNodeToTree(document.root, detachedNode, parentId)
        
        // 从 detachedNodes 中移除
        const newDetachedNodes = detachedNodes.filter((n: TreeNode) => n.id !== nodeId)

        set({ 
          document: { 
            ...document, 
            root: newRoot,
            detachedNodes: newDetachedNodes,
            isModified: true 
          },
          error: null
        })
      },

      selectNode: (nodeId: string | null) => {
        set({ selectedNodeId: nodeId })
      },

      toggleNode: (nodeId: string) => {
        const { expandedNodeIds } = get()
        const newExpanded = new Set(expandedNodeIds)
        if (newExpanded.has(nodeId)) {
          newExpanded.delete(nodeId)
        } else {
          newExpanded.add(nodeId)
        }
        set({ expandedNodeIds: newExpanded })
      },

      expandAll: () => {
        const { document } = get()
        if (!document) return
        
        const allIds = collectAllNodeIds(document.root)
        set({ expandedNodeIds: new Set(allIds) })
      },

      collapseAll: () => {
        set({ expandedNodeIds: new Set(['root']) })
      },

      updateMetadata: (metadata: Partial<DocumentMetadata>) => {
        const { document } = get()
        if (!document) return
        
        set({ 
          document: { 
            ...document, 
            metadata: { ...document.metadata, ...metadata },
            isModified: true 
          } 
        })
      },

      updateFromMarkdown: (markdown: string) => {
        const { document } = get()
        if (!document) return
        
        try {
          const newDocument = parseMarkdown(markdown, document.fileName)
          set({ 
            document: { ...newDocument, isModified: true },
            error: null 
          })
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Failed to parse markdown' 
          })
        }
      },

      setError: (error: string | null) => {
        set({ error })
      },

      clearError: () => {
        set({ error: null })
      },

      // ==================== 计算属性实现 ====================
      
      getCurrentMarkdown: () => {
        const { document } = get()
        if (!document) return ''
        return generateFromState(document)
      },

      getIsModified: () => {
        const { document } = get()
        return document?.isModified ?? false
      },

      getSelectedNode: () => {
        const { document, selectedNodeId } = get()
        if (!document || !selectedNodeId) return null
        return findNodeInTree(document.root, selectedNodeId)
      },

      findNodeById: (nodeId: string) => {
        const { document } = get()
        if (!document) return null
        return findNodeInTree(document.root, nodeId)
      }
    }),
    {
      name: 'document-store'
    }
  )
)

export default useDocumentStore
