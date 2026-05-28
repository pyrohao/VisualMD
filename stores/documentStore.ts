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
import { useHistoryStore, injectGetDocumentState } from './historyStore'
import { saveEditorState, loadEditorState, createEditorState } from '@/lib/editor-state-storage'
import { findNodeInDetached } from '@/lib/flow-helpers'
import { useLanguageStore } from './languageStore'

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
   * @param fileId 文件ID（用于恢复编辑器状态）
   */
  loadDocument: (content: string, fileName?: string, fileId?: string) => void
  
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
   * 仅删除当前节点（子节点变为断开节点）
   * @param nodeId 节点ID
   */
  deleteNodeOnly: (nodeId: string) => void

  /**
   * 添加子节点
   * @param parentId 父节点ID
   * @param title 节点标题
   * @param insertIndex 插入位置（可选，默认添加到末尾）
   * @returns 新节点ID
   */
  addChildNode: (parentId: string, title: string, insertIndex?: number) => string | null

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
   * 移动节点顺序（上移/下移/最前/最后）
   * @param nodeId 要移动的节点ID
   * @param direction 移动方向：'up' | 'down' | 'first' | 'last'
   */
  moveNodeOrder: (nodeId: string, direction: 'up' | 'down' | 'first' | 'last') => void

  /**
   * 移动节点到指定位置
   * @param nodeId 要移动的节点ID
   * @param targetPosition 目标位置（1-based）
   */
  moveNodeToPosition: (nodeId: string, targetPosition: number) => void

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
   * 更新元数据（完全替换）
   * @param metadata 新的元数据
   */
  updateMetadata: (metadata: Record<string, string>) => void

  /**
   * 更新文件名
   * @param fileName 新的文件名
   */
  updateFileName: (fileName: string) => void

  /**
   * 从Markdown文本更新（用于文本编辑器）
   * @param markdown Markdown文本
   */
  updateFromMarkdown: (markdown: string) => void

  /**
   * Refresh structure near a node after node-panel edits.
   * Falls back from node -> parent -> full document rebuild.
   */
  refreshNodeStructure: (nodeId: string) => 'node' | 'parent' | 'document' | 'skipped'
  
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

  /**
   * 撤销操作
   */
  undo: () => void

  /**
   * 重做操作
   */
  redo: () => void

  /**
   * 是否可以撤销
   */
  canUndo: () => boolean

  /**
   * 是否可以重做
   */
  canRedo: () => boolean
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
 * 从树中删除节点（包括所有子节点）
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
 * 从树中删除节点，但保留其子节点（子节点提升到当前层级）
 * 返回 { root: 新的根节点, orphanedChildren: 被删除节点的子节点 }
 */
function deleteNodeOnlyFromTree(root: TreeNode, nodeId: string): { root: TreeNode; orphanedChildren: TreeNode[] } {
  let orphanedChildren: TreeNode[] = []

  function traverse(node: TreeNode): TreeNode {
    const newChildren: TreeNode[] = []

    for (const child of node.children) {
      if (child.id === nodeId) {
        // 找到要删除的节点，收集其子节点作为孤儿节点
        orphanedChildren = child.children.map(grandChild => ({
          ...grandChild,
          isDetached: true,
          detachedFrom: nodeId,
        }))
        // 不添加这个节点到新的 children 中（即删除它）
      } else {
        // 递归处理子节点
        newChildren.push(traverse(child))
      }
    }

    return {
      ...node,
      children: newChildren
    }
  }

  return { root: traverse(root), orphanedChildren }
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
 * @param insertIndex 插入位置（可选，默认添加到末尾）
 * @returns 更新后的根节点
 */
function addChildNodeInTree(root: TreeNode, parentId: string, newNode: TreeNode, insertIndex?: number): TreeNode {
  if (root.id === parentId) {
    const newChildren = [...root.children]
    // 如果指定了插入位置，在指定位置插入；否则添加到末尾
    if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= newChildren.length) {
      newChildren.splice(insertIndex, 0, newNode)
    } else {
      newChildren.push(newNode)
    }
    return {
      ...root,
      children: newChildren
    }
  }

  return {
    ...root,
    children: root.children.map(child => addChildNodeInTree(child, parentId, newNode, insertIndex))
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
 * 将断开的节点连接到新的父节点（保持原始层级，支持跨等级连接）
 * @param root 根节点
 * @param detachedNode 断开的节点
 * @param parentId 新的父节点ID
 * @returns 更新后的根节点
 */
function connectNodeToTreeWithOriginalLevel(root: TreeNode, detachedNode: TreeNode, parentId: string): TreeNode {
  // 找到目标父节点
  const parentNode = findNodeInTree(root, parentId)
  if (!parentNode) return root

  // 恢复节点状态，保持原始层级（不强制调整为 parent.level + 1）
  const connectedNode: TreeNode = {
    ...detachedNode,
    isDetached: false,
    detachedFrom: null,
    parentId: parentId,
    // 保持节点原始层级，支持跨等级连接
    level: detachedNode.level
  }

  // 不递归更新子节点层级，保持整个子树的原始层级结构
  const preserveChildrenLevel = (node: TreeNode): TreeNode => ({
    ...node,
    children: node.children.map(child => preserveChildrenLevel(child))
  })

  const finalNode = preserveChildrenLevel(connectedNode)

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
 * 深拷贝树节点
 * @param node 要拷贝的节点
 * @returns 新的节点副本
 */
function cloneTreeNode(node: TreeNode): TreeNode {
  return {
    ...node,
    children: node.children.map(child => cloneTreeNode(child)),
  }
}

type StructuralRefreshScope = 'node' | 'parent' | 'document' | 'skipped'

function extractHeadingLevels(content?: string): number[] {
  if (!content) {
    return []
  }

  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const levels: number[] = []
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(content)) !== null) {
    levels.push(match[1].length)
  }

  return levels
}

function findMatchingNodeIndex(
  parsedNode: TreeNode,
  existingNodes: TreeNode[],
  usedIndices: Set<number>,
  preferredStart: number
): number {
  const matchesNode = (candidate: TreeNode) =>
    candidate.title === parsedNode.title && candidate.level === parsedNode.level

  for (let index = preferredStart; index < existingNodes.length; index += 1) {
    if (!usedIndices.has(index) && matchesNode(existingNodes[index])) {
      return index
    }
  }

  for (let index = 0; index < preferredStart; index += 1) {
    if (!usedIndices.has(index) && matchesNode(existingNodes[index])) {
      return index
    }
  }

  return -1
}

function mergeParsedNode(
  parsedNode: TreeNode,
  existingNode: TreeNode | null,
  parentId: string | null
): TreeNode {
  const nextId = existingNode?.id ?? parsedNode.id

  return {
    ...parsedNode,
    id: nextId,
    parentId,
    isVirtual: existingNode?.isVirtual ?? parsedNode.isVirtual,
    isCollapsed: existingNode?.isCollapsed ?? parsedNode.isCollapsed ?? false,
    isDetached: existingNode?.isDetached ?? parsedNode.isDetached,
    detachedFrom: existingNode?.detachedFrom ?? parsedNode.detachedFrom,
    position: existingNode?.position ?? parsedNode.position,
    documentOrder: existingNode?.documentOrder ?? parsedNode.documentOrder,
    children: mergeParsedChildren(parsedNode.children, existingNode?.children ?? [], nextId),
  }
}

function mergeParsedChildren(
  parsedChildren: TreeNode[],
  existingChildren: TreeNode[],
  parentId: string | null
): TreeNode[] {
  const usedIndices = new Set<number>()

  return parsedChildren.map((parsedChild, index) => {
    const matchIndex = findMatchingNodeIndex(parsedChild, existingChildren, usedIndices, index)
    const existingChild = matchIndex === -1 ? null : existingChildren[matchIndex]

    if (matchIndex !== -1) {
      usedIndices.add(matchIndex)
    }

    return mergeParsedNode(parsedChild, existingChild, parentId)
  })
}

function replaceNodeWithNodes(
  root: TreeNode,
  targetNodeId: string,
  replacements: TreeNode[]
): TreeNode {
  const replaceChildren = (children: TreeNode[]): { children: TreeNode[]; replaced: boolean } => {
    let replaced = false
    const nextChildren: TreeNode[] = []

    for (const child of children) {
      if (child.id === targetNodeId) {
        nextChildren.push(...replacements)
        replaced = true
        continue
      }

      const nested = replaceChildren(child.children)
      if (nested.replaced) {
        nextChildren.push({
          ...child,
          children: nested.children,
        })
        replaced = true
      } else {
        nextChildren.push(child)
      }
    }

    return { children: nextChildren, replaced }
  }

  const result = replaceChildren(root.children)

  if (!result.replaced) {
    return root
  }

  return {
    ...root,
    children: result.children,
  }
}

function reparseNodeSubtree(node: TreeNode): TreeNode | null {
  const reparsedDocument = parseMarkdown(generateMarkdown(node))
  if (reparsedDocument.root.children.length !== 1) {
    return null
  }

  const reparsedNode = reparsedDocument.root.children[0]
  if (reparsedNode.level !== node.level) {
    return null
  }

  return mergeParsedNode(reparsedNode, node, node.parentId)
}

function reparseParentSubtree(parentNode: TreeNode): TreeNode[] | null {
  const reparsedDocument = parseMarkdown(generateMarkdown(parentNode))

  if (parentNode.isVirtual || parentNode.level === 0) {
    return mergeParsedChildren(reparsedDocument.root.children, parentNode.children, parentNode.id)
  }

  if (reparsedDocument.root.children.length === 0) {
    return null
  }

  return mergeParsedChildren(reparsedDocument.root.children, [parentNode], parentNode.parentId)
}

/**
 * 在断开节点列表中更新节点
 * @param detachedNodes 断开节点数组
 * @param nodeId 节点ID
 * @param updates 更新的字段
 * @returns 更新后的断开节点数组
 */
function updateNodeInDetached(
  detachedNodes: TreeNode[],
  nodeId: string,
  updates: Partial<TreeNode>
): TreeNode[] {
  return detachedNodes.map(node => {
    if (node.id === nodeId) {
      return { ...node, ...updates }
    }
    // 递归更新子节点
    if (node.children.length > 0) {
      return {
        ...node,
        children: updateNodeInDetached(node.children, nodeId, updates)
      }
    }
    return node
  })
}

/**
 * 从断开节点列表中分离节点
 * @param detachedNodes 断开节点数组
 * @param nodeId 要分离的节点ID
 * @returns 新的断开节点数组和分离出的节点
 */
function detachNodeFromDetached(
  detachedNodes: TreeNode[],
  nodeId: string
): { newDetachedNodes: TreeNode[]; extractedNode: TreeNode | null } {
  let extractedNode: TreeNode | null = null
  
  const processNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.map(node => {
      if (node.id === nodeId) {
        // 找到要分离的节点，标记为断开并清除父节点引用
        extractedNode = {
          ...node,
          isDetached: true,
          parentId: null,
          detachedFrom: node.parentId
        }
        // 从父节点的 children 中移除（通过不返回此节点实现）
        return null as unknown as TreeNode
      }
      
      // 递归处理子节点
      if (node.children.length > 0) {
        const newChildren = processNodes(node.children).filter(Boolean)
        return { ...node, children: newChildren }
      }
      
      return node
    }).filter(Boolean)
  }
  
  const newDetachedNodes = processNodes(detachedNodes)
  
  return { newDetachedNodes, extractedNode }
}

/**
 * 创建文档Store
 */
export const useDocumentStore = create<DocumentStore>()(
  devtools(
    (set, get) => {
      // 注入获取文档状态的函数到historyStore
      injectGetDocumentState(() => {
        const { document } = get()
        if (!document) return null
        return {
          root: document.root,
          detachedNodes: (document as any).detachedNodes || [],
          metadata: document.metadata
        }
      })

      return {
        // ==================== 初始状态 ====================
        document: null,
        selectedNodeId: null,
        expandedNodeIds: new Set(['root']),
        isLoading: false,
        error: null,

        // ==================== 操作实现 ====================
        
        loadDocument: (content: string, fileName?: string, fileId?: string) => {
          try {
            const document = parseMarkdown(content, fileName)
            
            // 如果有 fileId，尝试恢复编辑器状态
            if (fileId) {
              document.fileId = fileId
              const savedState = loadEditorState(fileId)
              
              if (savedState) {
                // 恢复断开节点
                document.detachedNodes = savedState.detachedNodes || []
                
                // 恢复展开状态
                if (savedState.expandedNodeIds && savedState.expandedNodeIds.length > 0) {
                  set({ 
                    document, 
                    expandedNodeIds: new Set(savedState.expandedNodeIds),
                    selectedNodeId: null,
                    error: null 
                  })
                  // 清空历史记录
                  useHistoryStore.getState().clear()
                  return
                }
              }
            }
            
            // 默认展开所有节点
            const allIds = collectAllNodeIds(document.root)
            set({ 
              document, 
              expandedNodeIds: new Set(allIds),
              selectedNodeId: null,
              error: null 
            })
            // 清空历史记录
            useHistoryStore.getState().clear()
          } catch (error) {
            set({ 
              error: error instanceof Error ? error.message : 'Failed to load document' 
            })
          }
        },

        markAsSaved: () => {
          const { document, expandedNodeIds } = get()
          if (document) {
            // 保存编辑器状态（断开节点等）
            if (document.fileId) {
              const state = createEditorState(document.fileId)
              state.detachedNodes = document.detachedNodes || []
              state.expandedNodeIds = Array.from(expandedNodeIds)
              saveEditorState(state)
            }
            
            set({ 
              document: { ...document, isModified: false } 
            })
          }
        },

        updateNode: (nodeId: string, updates: Partial<TreeNode>) => {
          const { document } = get()
          if (!document) return

          // 先在树中查找节点
          let node = findNodeInTree(document.root, nodeId)
          let isDetached = false
          
          // 如果不在树中，在断开节点中查找
          if (!node && document.detachedNodes) {
            node = findNodeInDetached(document.detachedNodes, nodeId)
            isDetached = true
          }
          
          const description = updates.title 
            ? `修改标题: "${node?.title || ''}" → "${updates.title}"`
            : `更新节点: ${node?.title || nodeId}`
          
          // 添加历史记录
          useHistoryStore.getState().addHistory({
            type: 'updateNode',
            description,
          })
          
          if (isDetached) {
            // 更新断开节点
            const newDetachedNodes = updateNodeInDetached(document.detachedNodes || [], nodeId, updates)
            set({ 
              document: { 
                ...document, 
                detachedNodes: newDetachedNodes, 
                isModified: true 
              } 
            })
          } else {
            // 更新树中的节点
            const newRoot = updateNodeInTree(document.root, nodeId, updates)
            set({ 
              document: { 
                ...document, 
                root: newRoot, 
                isModified: true 
              } 
            })
          }
        },

        moveNode: (nodeId: string, newParentId: string, index: number) => {
          const { document } = get()
          if (!document) return
          
          try {
            // 添加历史记录
            const node = findNodeInTree(document.root, nodeId)
            const newParent = findNodeInTree(document.root, newParentId)
            useHistoryStore.getState().addHistory({
              type: 'moveNode',
              description: `移动节点: "${node?.title || nodeId}" → "${newParent?.title || newParentId}"`,
            })

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

          // 添加历史记录
          const node = findNodeInTree(document.root, nodeId)
          useHistoryStore.getState().addHistory({
            type: 'deleteNode',
            description: `删除节点: "${node?.title || nodeId}"`,
          })

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

        deleteNodeOnly: (nodeId: string) => {
          const { document, selectedNodeId, expandedNodeIds } = get()
          if (!document || nodeId === 'root') return

          // 添加历史记录
          const node = findNodeInTree(document.root, nodeId)
          useHistoryStore.getState().addHistory({
            type: 'deleteNode',
            description: `删除节点（保留子节点）: "${node?.title || nodeId}"`,
          })

          const { root: newRoot, orphanedChildren } = deleteNodeOnlyFromTree(document.root, nodeId)

          // 将孤儿节点添加到 detachedNodes
          const currentDetachedNodes = (document as any).detachedNodes || []
          const newDetachedNodes = [...currentDetachedNodes, ...orphanedChildren]

          set({
            document: {
              ...document,
              root: newRoot,
              detachedNodes: newDetachedNodes,
              isModified: true
            },
            selectedNodeId: selectedNodeId === nodeId ? null : selectedNodeId
          })

          // 自动保存编辑器状态
          if (document.fileId) {
            const state = createEditorState(document.fileId)
            state.detachedNodes = newDetachedNodes
            state.expandedNodeIds = Array.from(expandedNodeIds)
            saveEditorState(state)
          }
        },

        addChildNode: (parentId: string, title: string, insertIndex?: number) => {
          const { document } = get()
          if (!document) return null

          // 查找父节点
          const parentNode = findNodeInTree(document.root, parentId)
          if (!parentNode) return null

          // 检查层级限制（最大6级）
          if (parentNode.level >= 6) {
            const { t } = useLanguageStore.getState()
            set({ error: t('common.maxLevelReached') })
            return null
          }

          // 确定新节点的层级
          let newNodeLevel: number
          
          if (parentId === 'root') {
            // 特殊处理：在虚拟根节点下添加节点时，与现有子节点保持相同层级
            const rootChildrenLevels = document.root.children.map(child => child.level)
            if (rootChildrenLevels.length > 0) {
              // 已有子节点，使用相同的层级
              newNodeLevel = rootChildrenLevels[0]
            } else {
              // 没有子节点，默认使用层级 1
              newNodeLevel = 1
            }
          } else {
            // 非虚拟根节点：层级为父节点 + 1
            newNodeLevel = parentNode.level + 1
          }

          // 创建新节点
          const newNode: TreeNode = {
            id: nanoid(10),
            level: newNodeLevel,
            title: title || '新节点',
            children: [],
            parentId: parentId,
            isCollapsed: false,
          }

          // 添加历史记录
          useHistoryStore.getState().addHistory({
            type: 'addChildNode',
            description: `添加节点: "${newNode.title}" 到 "${parentNode.title}"`,
          })

          // 添加到树中（支持指定插入位置）
          const newRoot = addChildNodeInTree(document.root, parentId, newNode, insertIndex)

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
          const { document, expandedNodeIds } = get()
          if (!document || nodeId === 'root') return

          // 先在树中查找节点
          let node = findNodeInTree(document.root, nodeId)
          
          if (node) {
            // 断开树中的节点
            const { root: newRoot, detachedNode } = detachNodeFromTree(document.root, nodeId)
            
            if (!detachedNode) {
              const { t } = useLanguageStore.getState()
              set({ error: t('common.detachFailed') })
              return
            }

            // 将断开的节点存储在文档的 detachedNodes 中
            const detachedNodes = (document as any).detachedNodes || []
            const newDetachedNodes = [...detachedNodes, detachedNode]
            
            set({ 
              document: { 
                ...document, 
                root: newRoot,
                detachedNodes: newDetachedNodes,
                isModified: true 
              },
              error: null
            })

            // 自动保存编辑器状态
            if (document.fileId) {
              const state = createEditorState(document.fileId)
              state.detachedNodes = newDetachedNodes
              state.expandedNodeIds = Array.from(expandedNodeIds)
              saveEditorState(state)
            }
          } else {
            // 在断开节点中查找（处理断开节点内部的边删除）
            const detachedNode = findNodeInDetached(document.detachedNodes || [], nodeId)
            if (!detachedNode) {
              const { t } = useLanguageStore.getState()
              set({ error: t('common.nodeNotFound') })
              return
            }

            // 从断开节点中分离子节点
            const { newDetachedNodes, extractedNode } = detachNodeFromDetached(
              document.detachedNodes || [],
              nodeId
            )
            
            if (!extractedNode) {
              const { t } = useLanguageStore.getState()
              set({ error: t('common.detachFailed') })
              return
            }

            const finalDetachedNodes = [...newDetachedNodes, extractedNode]

            set({ 
              document: { 
                ...document, 
                detachedNodes: finalDetachedNodes,
                isModified: true 
              },
              error: null
            })

            // 自动保存编辑器状态
            if (document.fileId) {
              const state = createEditorState(document.fileId)
              state.detachedNodes = finalDetachedNodes
              state.expandedNodeIds = Array.from(expandedNodeIds)
              saveEditorState(state)
            }
          }
        },

        connectNode: (nodeId: string, parentId: string) => {
          const { document, expandedNodeIds } = get()
          if (!document) return

          // 从 detachedNodes 中找到要连接的节点
          const detachedNodes = (document as any).detachedNodes || []
          const nodeIndex = detachedNodes.findIndex((n: TreeNode) => n.id === nodeId)

          if (nodeIndex === -1) {
            const { t } = useLanguageStore.getState()
            set({ error: t('common.detachedNodeNotFound') })
            return
          }

          const detachedNode = detachedNodes[nodeIndex]

          // 查找目标父节点（先在树中查找，再在断开节点中查找）
          let parentNode = findNodeInTree(document.root, parentId)
          let parentInDetached: TreeNode | null = null
          let parentInDetachedIndex = -1
          
          if (!parentNode) {
            // 在断开节点中查找父节点
            parentInDetachedIndex = detachedNodes.findIndex((n: TreeNode) => n.id === parentId)
            if (parentInDetachedIndex !== -1) {
              parentNode = detachedNodes[parentInDetachedIndex]
              parentInDetached = parentNode
            }
          }

          if (!parentNode) {
            const { t } = useLanguageStore.getState()
            set({ error: t('common.parentNodeNotFound') })
            return
          }

          // 特殊处理：连接到虚拟根节点时的层级检查
          if (parentId === 'root') {
            // 获取当前虚拟根节点的所有子节点的层级
            const rootChildrenLevels = document.root.children.map(child => child.level)
            
            if (rootChildrenLevels.length > 0) {
              // 虚拟根节点已有子节点，检查层级是否匹配
              const expectedLevel = rootChildrenLevels[0]
              if (detachedNode.level !== expectedLevel) {
                const { t } = useLanguageStore.getState()
                set({ error: t('common.levelMismatchRoot').replace('{expected}', String(expectedLevel)).replace('{current}', String(detachedNode.level)) })
                return
              }
            }
            // 如果虚拟根节点没有子节点，允许连接任意层级的节点（成为新的基准层级）
          } else {
            // 非虚拟根节点：验证层级关系，父节点层级必须小于子节点层级
            if (parentNode.level >= detachedNode.level) {
              const { t } = useLanguageStore.getState()
              set({ error: t('common.levelMismatch').replace('{child}', String(detachedNode.level)).replace('{parent}', String(parentNode.level)) })
              return
            }
          }

          // 检查是否会导致循环引用
          if (parentInDetached) {
            // 父节点在断开节点中，检查断开节点内部的循环引用
            const checkCycleInDetached = (node: TreeNode, targetId: string): boolean => {
              if (node.id === targetId) return true
              for (const child of node.children) {
                if (checkCycleInDetached(child, targetId)) return true
              }
              return false
            }
            
            if (checkCycleInDetached(detachedNode, parentId)) {
              const { t } = useLanguageStore.getState()
              set({ error: t('common.cycleError') })
              return
            }
          } else {
            // 父节点在树中，检查树中的循环引用
            let currentParent = findParentInTree(document.root, parentId)
            while (currentParent) {
              if (currentParent.id === nodeId) {
                const { t } = useLanguageStore.getState()
                set({ error: t('common.cycleError') })
                return
              }
              currentParent = findParentInTree(document.root, currentParent.id)
            }
          }

          if (parentInDetached) {
            // 两个节点都在断开节点中，直接在 detachedNodes 中连接
            const updatedDetachedNodes = [...detachedNodes]
            
            // 将要连接的节点从 detachedNodes 中移除
            updatedDetachedNodes.splice(nodeIndex, 1)
            
            // 更新父节点在数组中的位置（因为可能改变了）
            const updatedParentIndex = updatedDetachedNodes.findIndex((n: TreeNode) => n.id === parentId)
            if (updatedParentIndex === -1) {
              const { t } = useLanguageStore.getState()
              set({ error: t('common.parentChanged') })
              return
            }
            
            // 获取父节点的位置，计算子节点的相对位置
            const parentNode = updatedDetachedNodes[updatedParentIndex]
            const parentPosition = parentNode.position || { x: 0, y: 0 }
            
            // 计算子节点的新位置：在父节点右侧，垂直方向根据现有子节点数量偏移
            const existingChildrenCount = parentNode.children.length
            let horizontalDirection = 1
            const resolveChildX = (nextChildX: number) => nextChildX + (horizontalDirection - 1) * 240
            const firstChildPosition = parentNode.children[0]?.position
            if (firstChildPosition) {
              horizontalDirection = firstChildPosition.x < parentPosition.x ? -1 : 1
            } else if (detachedNode.position) {
              horizontalDirection = detachedNode.position.x < parentPosition.x ? -1 : 1
            }
            const childX = parentPosition.x + 240 // 水平间距 240px
            const childY = parentPosition.y + existingChildrenCount * 100 // 垂直间距 100px
            
            // 将节点添加到父节点的 children 中，并设置相对位置
            const updatedParent = {
              ...parentNode,
              children: [...parentNode.children, {
                ...detachedNode,
                parentId: parentId,
                isDetached: false,
                position: { x: resolveChildX(childX), y: childY }
              }]
            }
            updatedDetachedNodes[updatedParentIndex] = updatedParent
            
            set({
              document: {
                ...document,
                detachedNodes: updatedDetachedNodes,
                isModified: true
              },
              error: null
            })

            // 自动保存编辑器状态
            if (document.fileId) {
              const state = createEditorState(document.fileId)
              state.detachedNodes = updatedDetachedNodes
              state.expandedNodeIds = Array.from(expandedNodeIds)
              saveEditorState(state)
            }
          } else {
            // 父节点在树中，将节点连接到树
            const newRoot = connectNodeToTreeWithOriginalLevel(document.root, detachedNode, parentId)

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

            // 自动保存编辑器状态
            if (document.fileId) {
              const state = createEditorState(document.fileId)
              state.detachedNodes = newDetachedNodes
              state.expandedNodeIds = Array.from(expandedNodeIds)
              saveEditorState(state)
            }
          }
        },

        moveNodeOrder: (nodeId: string, direction: 'up' | 'down' | 'first' | 'last') => {
          const { document } = get()
          if (!document || nodeId === 'root') return

          // 查找节点及其父节点
          const node = findNodeInTree(document.root, nodeId)
          if (!node) return

          const parentNode = findParentInTree(document.root, nodeId)
          if (!parentNode) return

          // 获取当前索引
          const currentIndex = parentNode.children.findIndex(child => child.id === nodeId)
          if (currentIndex === -1) return

          // 计算新索引
          let newIndex = currentIndex
          switch (direction) {
            case 'up':
              newIndex = Math.max(0, currentIndex - 1)
              break
            case 'down':
              newIndex = Math.min(parentNode.children.length - 1, currentIndex + 1)
              break
            case 'first':
              newIndex = 0
              break
            case 'last':
              newIndex = parentNode.children.length - 1
              break
          }

          // 如果位置没有变化，直接返回
          if (newIndex === currentIndex) return

          // 添加历史记录
          useHistoryStore.getState().addHistory({
            type: 'moveNodeOrder',
            description: `调整顺序: "${node.title}" ${direction === 'up' ? '上移' : direction === 'down' ? '下移' : direction === 'first' ? '置顶' : '置底'}`,
          })

          // 移动节点
          const newChildren = [...parentNode.children]
          const [movedNode] = newChildren.splice(currentIndex, 1)
          newChildren.splice(newIndex, 0, movedNode)

          // 更新父节点的 children
          parentNode.children = newChildren

          set({
            document: {
              ...document,
              isModified: true
            },
            error: null
          })
        },

        moveNodeToPosition: (nodeId: string, targetPosition: number) => {
          const { document } = get()
          if (!document || nodeId === 'root') return

          // 查找节点及其父节点
          const node = findNodeInTree(document.root, nodeId)
          if (!node) return

          const parentNode = findParentInTree(document.root, nodeId)
          if (!parentNode) return

          // 获取当前索引
          const currentIndex = parentNode.children.findIndex(child => child.id === nodeId)
          if (currentIndex === -1) return

          // 验证目标位置是否有效（1-based，转换为 0-based）
          const newIndex = targetPosition - 1
          const maxIndex = parentNode.children.length - 1

          if (newIndex < 0 || newIndex > maxIndex || newIndex === currentIndex) {
            return // 位置无效或没有变化
          }

          // 添加历史记录
          useHistoryStore.getState().addHistory({
            type: 'moveNodeOrder',
            description: `移动位置: "${node.title}" 到第 ${targetPosition} 位`,
          })

          // 移动节点
          const newChildren = [...parentNode.children]
          const [movedNode] = newChildren.splice(currentIndex, 1)
          newChildren.splice(newIndex, 0, movedNode)

          // 更新父节点的 children
          parentNode.children = newChildren

          // 强制创建新的 document 对象以触发重新渲染
          const newRoot = cloneTreeNode(document.root)

          set({
            document: {
              ...document,
              root: newRoot,
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

        updateMetadata: (metadata: Record<string, string>) => {
          const { document } = get()
          if (!document) return

          // 添加历史记录
          const changedKeys = Object.keys(metadata).join(', ')
          useHistoryStore.getState().addHistory({
            type: 'updateMetadata',
            description: `更新元数据: ${changedKeys}`,
          })

          // 完全替换元数据，而不是合并
          set({
            document: {
              ...document,
              metadata,
              isModified: true
            }
          })
        },

        updateFileName: (fileName: string) => {
          const { document } = get()
          if (!document) return

          // 添加历史记录
          useHistoryStore.getState().addHistory({
            type: 'updateMetadata',
            description: `更新文件名: ${fileName}`,
          })

          set({
            document: {
              ...document,
              fileName,
              isModified: true
            }
          })
        },

        updateFromMarkdown: (markdown: string) => {
          const { document } = get()
          if (!document) return
          
          try {
            const newDocument = parseMarkdown(markdown, document.fileName)
            // 保留 fileId 和断开节点状态
            newDocument.fileId = document.fileId
            newDocument.detachedNodes = document.detachedNodes || []
            
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

        refreshNodeStructure: (nodeId: string): StructuralRefreshScope => {
          const { document } = get()
          if (!document) {
            return 'skipped'
          }

          const node = findNodeInTree(document.root, nodeId)
          if (!node || node.isVirtual || node.level === 0 || node.isDetached) {
            return 'skipped'
          }

          const headingLevels = extractHeadingLevels(node.content)
          if (headingLevels.length === 0) {
            return 'node'
          }

          const minHeadingLevel = Math.min(...headingLevels)

          if (minHeadingLevel > node.level) {
            const refreshedNode = reparseNodeSubtree(node)
            if (refreshedNode) {
              const newRoot = replaceNodeWithNodes(document.root, nodeId, [refreshedNode])
              set({
                document: {
                  ...document,
                  root: newRoot,
                  isModified: true,
                },
                error: null,
              })
              return 'node'
            }
          }

          const parentNode = node.parentId ? findNodeInTree(document.root, node.parentId) : null
          if (parentNode && minHeadingLevel >= parentNode.level) {
            const refreshedParentNodes = reparseParentSubtree(parentNode)
            if (refreshedParentNodes) {
              const newRoot = parentNode.id === document.root.id
                ? {
                    ...document.root,
                    children: refreshedParentNodes,
                  }
                : replaceNodeWithNodes(document.root, parentNode.id, refreshedParentNodes)

              set({
                document: {
                  ...document,
                  root: newRoot,
                  isModified: true,
                },
                error: null,
              })
              return 'parent'
            }
          }

          get().updateFromMarkdown(generateFromState(document))
          return 'document'
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
        },

        undo: () => {
          const historyState = useHistoryStore.getState()
          const result = historyState.undo() as { root: TreeNode; detachedNodes: TreeNode[]; metadata: DocumentMetadata } | null
          
          if (result) {
            const { document } = get()
            if (document) {
              set({
                document: {
                  ...document,
                  root: result.root,
                  detachedNodes: result.detachedNodes,
                  metadata: result.metadata,
                  isModified: true
                }
              })
            }
          }
        },

        redo: () => {
          const historyState = useHistoryStore.getState()
          const result = historyState.redo() as { root: TreeNode; detachedNodes: TreeNode[]; metadata: DocumentMetadata } | null
          
          if (result) {
            const { document } = get()
            if (document) {
              set({
                document: {
                  ...document,
                  root: result.root,
                  detachedNodes: result.detachedNodes,
                  metadata: result.metadata,
                  isModified: true
                }
              })
            }
          }
        },

        canUndo: () => {
          return useHistoryStore.getState().canUndo()
        },

        canRedo: () => {
          return useHistoryStore.getState().canRedo()
        }
      }
    },
    {
      name: 'document-store'
    }
  )
)

export default useDocumentStore
