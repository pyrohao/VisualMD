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
import { devtools } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type {
  TreeNode,
  DocumentState,
  DocumentMetadata,
  DocumentMutation,
  DocumentMutationScope,
  DocumentMutationType,
} from '@/types/tree'
import { parseMarkdown } from '@/lib/markdown-parser'
import { generateFromState, generateMarkdown } from '@/lib/markdown-generator'
import { useHistoryStore, injectGetDocumentState } from './historyStore'
import { saveEditorState, loadEditorState, createEditorState } from '@/lib/editor-state-storage'
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
  /** 外部事务写回版本，用于同步本地编辑文本 */
  externalRevision: number
  /** 最近一次文档变更语义，供画布增量刷新使用 */
  lastMutation: DocumentMutation

  // ==================== 操作 ====================
  
  /**
   * 加载文档
   * @param content Markdown内容
   * @param fileName 文件名
   * @param fileId 文件ID（用于恢复编辑器状态）
   */
  loadDocument: (content: string, fileName?: string, fileId?: string) => void
  /**
   * 清空当前文档
   */
  clearDocument: () => void
  
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
   * 仅删除当前节点（子节点提升到当前层级）
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
  updateFromMarkdown: (markdown: string) => boolean
  applyExternalMarkdown: (markdown: string) => boolean

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
  getDocumentVersion: () => number

  /**
   * 撤销操作
   */
  undo: () => boolean

  /**
   * 重做操作
   */
  redo: () => boolean

  /**
   * 是否可以撤销
   */
  canUndo: () => boolean

  /**
   * 是否可以重做
   */
  canRedo: () => boolean
}

function createMutation(
  type: DocumentMutationType,
  scope: DocumentMutationScope,
  options: Omit<DocumentMutation, 'id' | 'type' | 'scope'> = {}
): Omit<DocumentMutation, 'id'> {
  return {
    type,
    scope,
    ...options,
  }
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
 */
function deleteNodeOnlyFromTree(root: TreeNode, nodeId: string): TreeNode {
  function traverse(node: TreeNode): TreeNode {
    const newChildren: TreeNode[] = []

    for (const child of node.children) {
      if (child.id === nodeId) {
        newChildren.push(
          ...child.children.map((grandChild) => ({
            ...grandChild,
            parentId: node.id,
          }))
        )
      } else {
        newChildren.push(traverse(child))
      }
    }

    return {
      ...node,
      children: newChildren,
    }
  }

  return traverse(root)
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

function bumpDocumentVersion(document: DocumentState): number {
  return (document.version || 1) + 1
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

function setNodeCollapsedInTree(root: TreeNode, nodeId: string, isCollapsed: boolean): TreeNode {
  if (root.id === nodeId) {
    return { ...root, isCollapsed }
  }

  return {
    ...root,
    children: root.children.map((child) => setNodeCollapsedInTree(child, nodeId, isCollapsed)),
  }
}

function syncCollapseStateInTree(root: TreeNode, expandedNodeIds: Set<string>): TreeNode {
  const isCollapsed = root.children.length > 0 ? !expandedNodeIds.has(root.id) : false

  return {
    ...root,
    isCollapsed,
    children: root.children.map((child) => syncCollapseStateInTree(child, expandedNodeIds)),
  }
}

function resolveExpandedNodeIdsForDocument(
  root: TreeNode,
  preferredExpandedNodeIds?: Iterable<string> | null
): Set<string> {
  const allIds = new Set(collectAllNodeIds(root))

  if (!preferredExpandedNodeIds) {
    return allIds
  }

  const resolved = new Set<string>()
  for (const id of preferredExpandedNodeIds) {
    if (allIds.has(id)) {
      resolved.add(id)
    }
  }

  if (resolved.size <= 1 && allIds.size > 1) {
    return allIds
  }

  resolved.add('root')
  return resolved
}

/**
 * 创建文档Store
 */
export const useDocumentStore = create<DocumentStore>()(
  devtools(
    (set, get) => {
      let mutationId = 0
      let activeLoadRevision = 0
      const nextMutation = (
        type: DocumentMutationType,
        scope: DocumentMutationScope,
        options: Omit<DocumentMutation, 'id' | 'type' | 'scope'> = {}
      ): DocumentMutation => ({
        id: ++mutationId,
        ...createMutation(type, scope, options),
      })

      // 注入获取文档状态的函数到historyStore
      injectGetDocumentState(() => {
        const { document } = get()
        if (!document) return null
        return {
          root: document.root,
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
        externalRevision: 0,
        lastMutation: {
          id: 0,
          type: 'load-document',
          scope: 'full',
        },

        // ==================== 操作实现 ====================
        
        loadDocument: (content: string, fileName?: string, fileId?: string) => {
          try {
            const document = parseMarkdown(content, fileName)
            const loadRevision = ++activeLoadRevision
            
            // 如果有 fileId，尝试恢复编辑器状态
            if (fileId) {
              document.fileId = fileId
              void loadEditorState(fileId).then((savedState) => {
                if (!savedState) {
                  return
                }

                const currentDocument = get().document
                if (
                  loadRevision !== activeLoadRevision ||
                  !currentDocument ||
                  currentDocument.fileId !== fileId
                ) {
                  return
                }

                const nextExpandedNodeIds = resolveExpandedNodeIdsForDocument(
                  currentDocument.root,
                  savedState.expandedNodeIds && savedState.expandedNodeIds.length > 0
                    ? savedState.expandedNodeIds
                    : undefined
                )

                set({
                  document: {
                    ...currentDocument,
                    root: syncCollapseStateInTree(currentDocument.root, nextExpandedNodeIds),
                  },
                  expandedNodeIds: nextExpandedNodeIds,
                  selectedNodeId: null,
                  error: null,
                  lastMutation: nextMutation('load-document', 'full'),
                })
                useHistoryStore.getState().clear()
              }).catch((error) => {
                console.error('Failed to hydrate editor state:', error)
              })
            }
            
            // 默认展开所有节点
            const expandedNodeIds = resolveExpandedNodeIdsForDocument(
              document.root
            )
            set({ 
              document: {
                ...document,
                root: syncCollapseStateInTree(document.root, expandedNodeIds),
              }, 
              expandedNodeIds,
              selectedNodeId: null,
              error: null,
              lastMutation: nextMutation('load-document', 'full'),
            })
            // 清空历史记录
            useHistoryStore.getState().clear()
          } catch (error) {
            set({ 
              error: error instanceof Error ? error.message : 'Failed to load document' 
            })
          }
        },

        clearDocument: () => {
          activeLoadRevision += 1
          set({
            document: null,
            selectedNodeId: null,
            expandedNodeIds: new Set(['root']),
            error: null,
            lastMutation: nextMutation('load-document', 'full'),
          })
          useHistoryStore.getState().clear()
        },

        markAsSaved: () => {
          const { document, expandedNodeIds } = get()
          if (document) {
            // 保存编辑器状态
            if (document.fileId) {
              const state = createEditorState(document.fileId)
              state.expandedNodeIds = Array.from(expandedNodeIds)
              saveEditorState(state)
            }
            
            set({ 
              document: { ...document, isModified: false },
              lastMutation: nextMutation('mark-saved', 'none'),
            })
          }
        },

        updateNode: (nodeId: string, updates: Partial<TreeNode>) => {
          const { document } = get()
          if (!document) return

          const node = findNodeInTree(document.root, nodeId)
          if (!node) return
          
          const description = updates.title 
            ? `修改标题: "${node?.title || ''}" → "${updates.title}"`
            : `更新节点: ${node?.title || nodeId}`
          const fields = Object.keys(updates)
          const isVisualOnly =
            fields.length > 0 &&
            fields.every((field) => field === 'title' || field === 'content' || field === 'position')
          
          // 添加历史记录
          useHistoryStore.getState().addHistory({
            type: 'updateNode',
            description,
          })

          const newRoot = updateNodeInTree(document.root, nodeId, updates)
          set({ 
            document: { 
              ...document, 
              root: newRoot, 
              version: bumpDocumentVersion(document),
              isModified: true 
            },
            lastMutation: nextMutation('update-node', isVisualOnly ? 'visual' : 'full', {
              nodeId,
              fields,
            }),
          })
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
                version: bumpDocumentVersion(document),
                isModified: true 
              },
              lastMutation: nextMutation('structure-change', 'full', { nodeId }),
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
              version: bumpDocumentVersion(document),
              isModified: true
            },
            selectedNodeId: selectedNodeId === nodeId ? null : selectedNodeId,
            lastMutation: nextMutation('structure-change', 'full', { nodeId }),
          })
        },

        deleteNodeOnly: (nodeId: string) => {
          const { document, selectedNodeId } = get()
          if (!document || nodeId === 'root') return

          // 添加历史记录
          const node = findNodeInTree(document.root, nodeId)
          useHistoryStore.getState().addHistory({
            type: 'deleteNode',
            description: `删除节点（保留子节点）: "${node?.title || nodeId}"`,
          })

          const newRoot = deleteNodeOnlyFromTree(document.root, nodeId)

          set({
            document: {
              ...document,
              root: newRoot,
              version: bumpDocumentVersion(document),
              isModified: true
            },
            selectedNodeId: selectedNodeId === nodeId ? null : selectedNodeId,
            lastMutation: nextMutation('structure-change', 'full', { nodeId }),
          })
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
              version: bumpDocumentVersion(document),
              isModified: true
            },
            expandedNodeIds: newExpanded,
            error: null,
            lastMutation: nextMutation('structure-change', 'full', { nodeId: newNode.id }),
          })

          return newNode.id
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
              version: bumpDocumentVersion(document),
              isModified: true
            },
            error: null,
            lastMutation: nextMutation('structure-change', 'full', { nodeId }),
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
              version: bumpDocumentVersion(document),
              isModified: true
            },
            error: null,
            lastMutation: nextMutation('structure-change', 'full', { nodeId }),
          })
        },

        selectNode: (nodeId: string | null) => {
          set({ selectedNodeId: nodeId })
        },

        toggleNode: (nodeId: string) => {
          const { document, expandedNodeIds } = get()
          if (!document) return

          const newExpanded = new Set(expandedNodeIds)
          if (newExpanded.has(nodeId)) {
            newExpanded.delete(nodeId)
          } else {
            newExpanded.add(nodeId)
          }

          const isCollapsed = !newExpanded.has(nodeId)

          set({
            document: {
              ...document,
              root: setNodeCollapsedInTree(document.root, nodeId, isCollapsed),
              version: bumpDocumentVersion(document),
              isModified: true,
            },
            expandedNodeIds: newExpanded,
            lastMutation: nextMutation('toggle-node', 'full', { nodeId }),
          })
        },

        expandAll: () => {
          const { document } = get()
          if (!document) return
          
          const allIds = collectAllNodeIds(document.root)
          const expandedNodeIds = new Set(allIds)
          set({
            document: {
              ...document,
              root: syncCollapseStateInTree(document.root, expandedNodeIds),
              version: bumpDocumentVersion(document),
              isModified: true,
            },
            expandedNodeIds,
            lastMutation: nextMutation('expand-all', 'full'),
          })
        },

        collapseAll: () => {
          const { document } = get()
          if (!document) return

          const expandedNodeIds = new Set(['root'])
          set({
            document: {
              ...document,
              root: syncCollapseStateInTree(document.root, expandedNodeIds),
              version: bumpDocumentVersion(document),
              isModified: true,
            },
            expandedNodeIds,
            lastMutation: nextMutation('collapse-all', 'full'),
          })
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
              version: bumpDocumentVersion(document),
              isModified: true
            },
            lastMutation: nextMutation('update-metadata', 'visual', {
              nodeId: 'root',
              fields: Object.keys(metadata),
            }),
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
              version: bumpDocumentVersion(document),
              isModified: true
            },
            lastMutation: nextMutation('update-file-name', 'visual'),
          })
        },

        updateFromMarkdown: (markdown: string) => {
          const { document } = get()
          if (!document) return false

          const currentMarkdown = get().getCurrentMarkdown()
          if (markdown === currentMarkdown && !document.isModified) {
            return true
          }
          
          try {
            const newDocument = parseMarkdown(markdown, document.fileName)
            // 保留 fileId
            newDocument.fileId = document.fileId
            newDocument.version = bumpDocumentVersion(document)
            const expandedNodeIds = resolveExpandedNodeIdsForDocument(
              newDocument.root,
              get().expandedNodeIds
            )
            
            set({ 
              document: {
                ...newDocument,
                root: syncCollapseStateInTree(newDocument.root, expandedNodeIds),
                isModified: true,
              },
              expandedNodeIds,
              error: null,
              lastMutation: nextMutation('markdown-sync', 'full'),
            })
            return true
          } catch (error) {
            set({ 
              error: error instanceof Error ? error.message : 'Failed to parse markdown' 
            })
            return false
          }
        },

        applyExternalMarkdown: (markdown: string) => {
          const applied = get().updateFromMarkdown(markdown)
          if (!applied) {
            return false
          }
          set((state) => ({
            externalRevision: state.externalRevision + 1,
            lastMutation: nextMutation('external-markdown', 'full'),
          }))
          return true
        },

        refreshNodeStructure: (nodeId: string): StructuralRefreshScope => {
          const { document } = get()
          if (!document) {
            return 'skipped'
          }

          const node = findNodeInTree(document.root, nodeId)
          if (!node || node.isVirtual || node.level === 0) {
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
                  version: bumpDocumentVersion(document),
                  isModified: true,
                },
                error: null,
                lastMutation: nextMutation('structure-change', 'full', { nodeId }),
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
                  version: bumpDocumentVersion(document),
                  isModified: true,
                },
                error: null,
                lastMutation: nextMutation('structure-change', 'full', { nodeId: parentNode.id }),
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

        getDocumentVersion: () => {
          const { document } = get()
          return document?.version || 0
        },

        undo: () => {
          const historyState = useHistoryStore.getState()
          const result = historyState.undo() as { root: TreeNode; metadata: DocumentMetadata } | null
          
          if (result) {
            const { document } = get()
            if (document) {
              set({
                document: {
                  ...document,
                  root: result.root,
                  metadata: result.metadata,
                  version: bumpDocumentVersion(document),
                  isModified: true
                },
                externalRevision: get().externalRevision + 1,
                lastMutation: nextMutation('history-change', 'full'),
              })
              return true
            }
          }
          return false
        },

        redo: () => {
          const historyState = useHistoryStore.getState()
          const result = historyState.redo() as { root: TreeNode; metadata: DocumentMetadata } | null
          
          if (result) {
            const { document } = get()
            if (document) {
              set({
                document: {
                  ...document,
                  root: result.root,
                  metadata: result.metadata,
                  version: bumpDocumentVersion(document),
                  isModified: true
                },
                externalRevision: get().externalRevision + 1,
                lastMutation: nextMutation('history-change', 'full'),
              })
              return true
            }
          }
          return false
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
      name: 'DocumentStore'
    }
  )
)

export default useDocumentStore
