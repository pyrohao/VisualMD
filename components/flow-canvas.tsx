'use client'

/**
 * Flow Canvas组件
 *
 * React Flow画布组件，用于可视化展示文档树结构
 * 支持横向布局、节点交互、画布控制、一键整理功能
 *
 * 对应技术文档6.1节
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  type OnConnectStart,
  type OnConnectEnd,
  type EdgeMouseHandler,
  BackgroundVariant,
  useReactFlow,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { LayoutGrid, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { MarkdownNode } from './markdown-node'
import { CreateNodesDialog } from './create-nodes-dialog'
import { treeToNodesAndEdges, type FlowNodeData, findNodeInDetached } from '@/lib/flow-helpers'
import { calculateTreeLayout } from '@/lib/layout-engine'
import { useDocumentStore } from '@/stores/documentStore'
import type { TreeNode } from '@/types/tree'
import { useThemeStore } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { toast } from '@/hooks/use-toast'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ui/context-menu'

// 注册自定义节点类型
const nodeTypes: NodeTypes = {
  headingNode: MarkdownNode as unknown as NodeTypes[string],
}

export function FlowCanvas() {
  // 从Store获取状态和操作
  const {
    document,
    selectedNodeId,
    selectNode,
    updateNode,
    toggleNode,
    detachNode,
    connectNode,
    error,
    clearError,
    markAsSaved,
  } = useDocumentStore()

  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  const { t } = useTranslation()

  // 启用键盘快捷键
  useKeyboardShortcuts({
    enableUndoRedo: true,
    enableSave: true,
    onSave: () => {
      markAsSaved()
      toast({
        title: '已保存',
        description: '文档已保存',
      })
    },
  })

  // 将树结构转换为React Flow节点和边
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!document) {
      return { nodes: [], edges: [] }
    }
    const detachedNodes = (document as any).detachedNodes || []
    return treeToNodesAndEdges(document.root, detachedNodes)
  }, [document?.root, (document as any)?.detachedNodes])

  // React Flow状态
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as Node<FlowNodeData>[])
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const { fitView, setNodes: setFlowNodes, screenToFlowPosition } = useReactFlow()

  // 用于跟踪拖拽状态
  const dragStartPositions = useRef<Map<string, { x: number; y: number }>>(new Map())

  // 用于跟踪连接起始节点
  const connectingNodeId = useRef<string | null>(null)
  const connectingHandleId = useRef<string | null>(null)
  const connectionSuccess = useRef<boolean>(false)
  // 用于存储连接结束时的鼠标位置（用于确定插入点）
  const connectEndPosition = useRef<{ x: number; y: number } | null>(null)

  // 创建子节点对话框状态
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [connectingParentNode, setConnectingParentNode] = useState<TreeNode | null>(null)

  // 选中的边状态
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  // 右键菜单状态
  const [contextMenuEdge, setContextMenuEdge] = useState<Edge | null>(null)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })

  // 当文档变化时更新节点和边
  useEffect(() => {
    if (!document) return

    console.log('[FlowCanvas] Document changed, regenerating nodes')

    const detachedNodes = (document as any).detachedNodes || []
    const { nodes: newNodes, edges: newEdges } = treeToNodesAndEdges(document.root, detachedNodes)

    console.log('[FlowCanvas] Generated', newNodes.length, 'nodes')

    // 添加回调函数到节点数据
    const nodesWithCallbacks = newNodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onChange: (id: string, title: string, content: string) => {
          updateNode(id, { title, content })
        },
        onToggleCollapse: (id: string) => {
          toggleNode(id)
        },
        onSelect: (id: string) => {
          selectNode(id)
        },
        onMoveToPosition: (id: string, position: number) => {
          useDocumentStore.getState().moveNodeToPosition(id, position)
        },
        onMetadataChange: (metadata: Record<string, string>) => {
          useDocumentStore.getState().updateMetadata(metadata)
        },
      },
    }))

    // 更新边的样式，支持选中状态
    const edgesWithStyle = newEdges.map(edge => ({
      ...edge,
      style: {
        stroke: selectedEdgeId === edge.id ? themeConfig.accent : themeConfig.muted,
        strokeWidth: selectedEdgeId === edge.id ? 3 : 2,
      },
      animated: selectedEdgeId === edge.id,
    }))

    setNodes(nodesWithCallbacks as Node<FlowNodeData>[])
    setEdges(edgesWithStyle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document])

  // 选中节点变化时更新节点样式
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      }))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId])



  // 获取节点的所有子节点ID（递归）- 从文档树和 edges 中查找
  const getAllChildNodeIds = useCallback((nodeId: string): string[] => {
    if (!document) return []

    const childIds: string[] = []
    const visited = new Set<string>()

    // 从文档树中查找子节点
    const findChildrenInTree = (root: TreeNode, targetId: string): boolean => {
      if (root.id === targetId) {
        const collectChildren = (node: TreeNode) => {
          for (const child of node.children) {
            if (!visited.has(child.id)) {
              childIds.push(child.id)
              visited.add(child.id)
              collectChildren(child)
            }
          }
        }
        collectChildren(root)
        return true
      }
      for (const child of root.children) {
        if (findChildrenInTree(child, targetId)) return true
      }
      return false
    }

    findChildrenInTree(document.root, nodeId)

    // 从 edges 中查找子节点（包括断开的节点）
    const findChildrenInEdges = (parentId: string) => {
      const directChildren = edges
        .filter((edge) => edge.source === parentId)
        .map((edge) => edge.target)

      for (const childId of directChildren) {
        if (!visited.has(childId)) {
          childIds.push(childId)
          visited.add(childId)
          // 递归查找子节点的子节点
          findChildrenInEdges(childId)
        }
      }
    }

    findChildrenInEdges(nodeId)

    return childIds
  }, [document, edges])

  // 自定义节点变化处理，支持拖拽时子节点跟随移动
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      // 处理位置变化
      const positionChanges = changes.filter(
        (change) => change.type === 'position' && change.position
      )

      if (positionChanges.length > 0) {
        // 检查是否是拖拽开始
        const dragStartChange = positionChanges.find(
          (change) => change.dragging === true && !dragStartPositions.current.has(change.id)
        )

        if (dragStartChange) {
          // 记录拖拽开始时的位置
          const node = nodes.find((n) => n.id === dragStartChange.id)
          if (node) {
            dragStartPositions.current.set(dragStartChange.id, {
              x: node.position.x,
              y: node.position.y,
            })
          }
        }

        // 检查是否是拖拽结束
        const dragEndChange = positionChanges.find(
          (change) => change.dragging === false && dragStartPositions.current.has(change.id)
        )

        if (dragEndChange) {
          // 清除拖拽开始位置记录
          dragStartPositions.current.delete(dragEndChange.id)
        }

        // 处理正在拖拽的节点及其子节点
        const draggingChange = positionChanges.find((change) => change.dragging === true)

        if (draggingChange) {
          const draggedNodeId = draggingChange.id
          const startPos = dragStartPositions.current.get(draggedNodeId)

          if (startPos) {
            // 计算位移
            const deltaX = draggingChange.position.x - startPos.x
            const deltaY = draggingChange.position.y - startPos.y

            // 获取所有子节点ID
            const childNodeIds = getAllChildNodeIds(draggedNodeId)

            if (childNodeIds.length > 0) {
              // 创建新的变化数组，包含子节点的位置变化
              const additionalChanges = childNodeIds
                .map((childId) => {
                  const childNode = nodes.find((n) => n.id === childId)
                  if (!childNode) return null

                  return {
                    type: 'position' as const,
                    id: childId,
                    position: {
                      x: childNode.position.x + deltaX,
                      y: childNode.position.y + deltaY,
                    },
                    dragging: false,
                  }
                })
                .filter(Boolean)

              // 合并所有变化
              changes = [...changes, ...additionalChanges]
            }

            // 更新拖拽开始位置为当前位置
            dragStartPositions.current.set(draggedNodeId, draggingChange.position)
          }
        }
      }

      // 调用原始的 onNodesChange
      onNodesChange(changes)
    },
    [nodes, onNodesChange, getAllChildNodeIds]
  )

  // 处理连接开始
  const onConnectStart: OnConnectStart = useCallback(
    (event, params) => {
      connectingNodeId.current = params.nodeId
      connectingHandleId.current = params.handleId
    },
    []
  )

  // 处理连接结束（拖拽释放时）
  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const sourceNodeId = connectingNodeId.current
      const sourceHandle = connectingHandleId.current

      // 检查是否是从右侧连接点拖拽的
      if (!sourceNodeId || sourceHandle !== 'right') {
        // 重置连接状态
        connectingNodeId.current = null
        connectingHandleId.current = null
        connectionSuccess.current = false
        connectEndPosition.current = null
        return
      }

      // 如果连接已经成功建立，不打开创建对话框
      if (connectionSuccess.current) {
        // 重置连接状态
        connectingNodeId.current = null
        connectingHandleId.current = null
        connectionSuccess.current = false
        connectEndPosition.current = null
        return
      }

      // 记录鼠标位置（用于确定插入点）
      if (event && 'clientX' in event) {
        const mouseEvent = event as MouseEvent
        const flowPosition = screenToFlowPosition({
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
        })
        connectEndPosition.current = flowPosition
      }

      // 查找父节点
      const parentNode = document?.root ?
        (() => {
          const findNode = (root: TreeNode, id: string): TreeNode | null => {
            if (root.id === id) return root
            for (const child of root.children) {
              const found = findNode(child, id)
              if (found) return found
            }
            return null
          }
          return findNode(document.root, sourceNodeId)
        })() : null

      if (!parentNode) {
        // 重置连接状态
        connectingNodeId.current = null
        connectingHandleId.current = null
        connectionSuccess.current = false
        connectEndPosition.current = null
        return
      }

      // 检查层级限制
      if (parentNode.level >= 6) {
        toast({
          title: '已达到最大层级限制',
          description: '无法继续添加子节点（最大6级）',
          variant: 'destructive',
        })
        // 重置连接状态
        connectingNodeId.current = null
        connectingHandleId.current = null
        connectionSuccess.current = false
        connectEndPosition.current = null
        return
      }

      // 打开创建子节点对话框
      setConnectingParentNode(parentNode)
      setIsCreateDialogOpen(true)
    },
    [document, screenToFlowPosition]
  )

  // 处理创建子节点确认
  const handleCreateNodesConfirm = useCallback((titles: string[]) => {
    if (!connectingParentNode) return

    // 根据Y轴位置确定插入点
    // 获取父节点的所有子节点的Y坐标
    const siblings = connectingParentNode.children
    let insertIndex: number | undefined = undefined

    if (connectEndPosition.current && siblings.length > 0) {
      // 将兄弟节点按Y坐标排序
      const siblingsWithY = siblings.map((sibling, index) => {
        const flowNode = nodes.find(n => n.id === sibling.id)
        return {
          node: sibling,
          index,
          y: flowNode?.position?.y ?? 0
        }
      }).sort((a, b) => a.y - b.y)

      // 找到应该插入的位置
      const endY = connectEndPosition.current.y
      for (let i = 0; i < siblingsWithY.length; i++) {
        if (endY < siblingsWithY[i].y) {
          insertIndex = siblingsWithY[i].index
          break
        }
      }
      // 如果Y坐标比所有兄弟节点都大，插入到最后
      if (insertIndex === undefined) {
        insertIndex = siblings.length
      }
    }

    // 批量创建子节点
    const createdNodeIds: string[] = []
    for (let i = 0; i < titles.length; i++) {
      const title = titles[i]
      const trimmedTitle = title.trim()
      if (trimmedTitle) {
        // 第一个节点使用计算出的插入位置，后续节点依次插入
        const currentInsertIndex = i === 0 ? insertIndex : (insertIndex !== undefined ? insertIndex + i : undefined)
        const newNodeId = useDocumentStore.getState().addChildNode(
          connectingParentNode.id,
          trimmedTitle,
          currentInsertIndex
        )
        if (newNodeId) {
          createdNodeIds.push(newNodeId)
        }
      }
    }

    // 关闭对话框并清理状态
    setIsCreateDialogOpen(false)
    setConnectingParentNode(null)
    connectEndPosition.current = null
    connectingNodeId.current = null
    connectingHandleId.current = null
    connectionSuccess.current = false

    // 如果有创建的节点，选中最后一个
    if (createdNodeIds.length > 0) {
      selectNode(createdNodeIds[createdNodeIds.length - 1])
    }
  }, [connectingParentNode, selectNode, nodes])

  // 处理创建子节点取消
  const handleCreateNodesCancel = useCallback(() => {
    setIsCreateDialogOpen(false)
    setConnectingParentNode(null)
  }, [])

  // 处理节点连接（用于连接断开的节点）
  const onConnect: OnConnect = useCallback(
    (connection) => {
      const { source, target } = connection

      if (!source || !target || !document) return

      // 标记连接成功
      connectionSuccess.current = true

      // 检查是否是断开节点的重新连接
      const detachedNodes = (document as any).detachedNodes || []
      const isSourceDetached = detachedNodes.some((n: TreeNode) => n.id === source)
      const isTargetDetached = detachedNodes.some((n: TreeNode) => n.id === target)

      // 获取两个节点的 level
      const getNodeLevel = (id: string): number => {
        // 先在树中查找
        const findInTree = (root: TreeNode): number | null => {
          if (root.id === id) return root.level
          for (const child of root.children) {
            const found = findInTree(child)
            if (found !== null) return found
          }
          return null
        }
        const levelInTree = findInTree(document.root)
        if (levelInTree !== null) return levelInTree

        // 在断开节点中查找
        const findInDetached = (nodes: TreeNode[]): number | null => {
          for (const node of nodes) {
            if (node.id === id) return node.level
            const found = findInDetached(node.children)
            if (found !== null) return found
          }
          return null
        }
        return findInDetached(detachedNodes) || 1
      }

      const sourceLevel = getNodeLevel(source)
      const targetLevel = getNodeLevel(target)

      // 智能连接：level 小的作为父节点，level 大的作为子节点
      // 如果 level 相同，保持拖拽方向（source 作为子节点）
      let childId: string, parentId: string
      if (sourceLevel < targetLevel) {
        // source (level小) 作为父节点，target (level大) 作为子节点
        childId = target
        parentId = source
      } else if (targetLevel < sourceLevel) {
        // target (level小) 作为父节点，source (level大) 作为子节点
        childId = source
        parentId = target
      } else {
        // level 相同，保持拖拽方向
        childId = source
        parentId = target
      }

      // 如果源节点是断开的，尝试连接到目标节点
      if (isSourceDetached) {
        connectNode(childId, parentId)
        return
      }

      // 如果目标节点是断开的，尝试将目标节点连接到源节点
      if (isTargetDetached) {
        connectNode(childId, parentId)
        return
      }

      // 如果都不是断开的节点，检查是否是合法的重新连接
      // 获取源节点和目标节点
      const findNode = (root: TreeNode, id: string): TreeNode | null => {
        if (root.id === id) return root
        for (const child of root.children) {
          const found = findNode(child, id)
          if (found) return found
        }
        return null
      }

      const sourceNode = findNode(document.root, source)
      const targetNode = findNode(document.root, target)

      if (!sourceNode || !targetNode) return

      // 检查层级关系：只能连接到大一级的节点
      const expectedLevel = sourceNode.level + 1
      if (targetNode.level !== expectedLevel) {
        toast({
          title: '层级不匹配',
          description: `H${targetNode.level} 节点不能连接到 H${sourceNode.level} 节点下。只能连接 H${expectedLevel} 节点。`,
          variant: 'destructive',
        })
        return
      }

      // 断开目标节点的现有连接，然后重新连接
      detachNode(target)
      // 使用 setTimeout 确保断开操作完成后再连接
      setTimeout(() => {
        connectNode(target, source)
      }, 0)
    },
    [document, detachNode, connectNode]
  )

  // 处理边的点击（选中边）
  const onEdgeClick: EdgeMouseHandler = useCallback((_, edge) => {
    setSelectedEdgeId(edge.id)
  }, [])

  // 处理边的右键点击（显示菜单）
  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault()
    setSelectedEdgeId(edge.id)
    setContextMenuEdge(edge)
    setContextMenuPosition({ x: event.clientX, y: event.clientY })
    setContextMenuOpen(true)
  }, [])

  // 处理删除选中的边
  const handleDeleteEdge = useCallback(() => {
    if (!contextMenuEdge || !document) return

    const targetId = contextMenuEdge.target

    // 查找目标节点（先在树中查找，再在断开节点中查找）
    const findNode = (root: TreeNode, id: string): TreeNode | null => {
      if (root.id === id) return root
      for (const child of root.children) {
        const found = findNode(child, id)
        if (found) return found
      }
      return null
    }

    let targetNode = findNode(document.root, targetId)
    let isDetachedEdge = false
    
    // 如果不在树中，在断开节点中查找
    if (!targetNode && document.detachedNodes) {
      targetNode = findNodeInDetached(document.detachedNodes, targetId)
      isDetachedEdge = true
    }
    
    if (!targetNode) {
      setContextMenuOpen(false)
      setContextMenuEdge(null)
      return
    }

    // 获取当前节点的位置，并计算偏移后的新位置
    const currentNode = nodes.find(n => n.id === targetId)
    const newPosition = currentNode?.position
      ? {
          x: currentNode.position.x + 200,
          y: currentNode.position.y + 150,
        }
      : undefined

    // 先更新节点位置（带偏移）
    if (newPosition) {
      updateNode(targetId, { position: newPosition })
    }

    // 断开节点
    detachNode(targetId)
    setSelectedEdgeId(null)
    setContextMenuOpen(false)
    setContextMenuEdge(null)
  }, [contextMenuEdge, document, detachNode, nodes, updateNode])

  // 处理画布点击（取消选择）
  const onPaneClick = useCallback(() => {
    selectNode(null)
    setSelectedEdgeId(null)
    setContextMenuOpen(false)
    setContextMenuEdge(null)
  }, [selectNode])

  // 处理节点点击
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectNode(node.id)
    setSelectedEdgeId(null)
  }, [selectNode])

  // 一键整理布局
  const handleLayout = useCallback(() => {
    const latestDocument = useDocumentStore.getState().document
    if (!latestDocument) return

    // 重新计算布局（包含断开的节点）
    const detachedNodes = (latestDocument as any).detachedNodes || []
    const positions = calculateTreeLayout(latestDocument.root, detachedNodes)

    // 更新节点位置
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        position: positions.get(node.id) || node.position,
      }))
    )

    // 适应视图
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 800 })
    }, 100)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 监听错误并自动清除
  useEffect(() => {
    if (error) {
      // 显示错误提示
      toast({
        title: '错误',
        description: error,
        variant: 'destructive',
      })
      // 清除错误
      clearError()
    }
  }, [error, clearError])

  // 注意：已取消自动整理功能
  // 用户需要手动点击"整理布局"按钮来整理节点位置
  // 这样可以保持用户手动调整的位置不变

  // 如果没有文档，显示空状态
  if (!document) {
    return (
      <div className="h-full w-full flex items-center justify-center" style={{ backgroundColor: themeConfig.background }}>
        <div className="text-center">
          <h3 className="text-lg font-semibold" style={{ color: themeConfig.heading }}>没有打开的文档</h3>
          <p className="mt-2 text-sm" style={{ color: themeConfig.muted }}>
            请导入或创建一个Markdown文档开始编辑
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full" style={{ backgroundColor: themeConfig.background }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgeClick={onEdgeClick}
        onEdgeContextMenu={onEdgeContextMenu}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.1,
          maxZoom: 1.5,
        }}
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: themeConfig.muted, strokeWidth: 2 },
          type: 'smoothstep',
        }}
        colorMode="light"
        proOptions={{ hideAttribution: true }}
      >
        {/* 自定义网格背景 - draw.io 风格 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, ${themeConfig.border}40 1px, transparent 1px),
              linear-gradient(to bottom, ${themeConfig.border}40 1px, transparent 1px),
              linear-gradient(to right, ${themeConfig.border}20 1px, transparent 1px),
              linear-gradient(to bottom, ${themeConfig.border}20 1px, transparent 1px)
            `,
            backgroundSize: '100px 100px, 100px 100px, 20px 20px, 20px 20px',
            backgroundPosition: '0 0, 0 0, 0 0, 0 0',
          }}
        />

        {/* 控制按钮 */}
        <Controls
          className="rounded-lg border shadow-lg custom-controls"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            '--controls-bg': themeConfig.card,
            '--controls-border': themeConfig.border,
            '--controls-color': themeConfig.text,
            '--controls-hover': themeConfig.hover,
          } as React.CSSProperties}
          showInteractive={false}
        />

        {/* 一键整理布局按钮 */}
        <Panel position="top-left" className="m-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLayout}
            className="gap-2 shadow-md hover:shadow-lg transition-shadow"
            style={{
              backgroundColor: themeConfig.card,
              borderColor: themeConfig.border,
              color: themeConfig.text,
            }}
          >
            <LayoutGrid className="h-4 w-4" />
            {t('canvas.layout')}
          </Button>
        </Panel>

        {/* 小地图 */}
        <MiniMap
          className="rounded-lg border shadow-lg"
          style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border }}
          nodeColor={(node) => {
            const level = (node.data?.level as number) ?? 0
            const colors = [
              '#3b82f6', // blue-500
              '#3b82f6', // blue-500
              '#10b981', // emerald-500
              '#f59e0b', // amber-500
              '#8b5cf6', // violet-500
              '#f97316', // orange-500
              '#6b7280', // gray-500
            ]
            return colors[level] ?? colors[0]
          }}
          maskColor={`${themeConfig.background}80`}
        />
      </ReactFlow>

      {/* 创建子节点对话框 */}
      <CreateNodesDialog
        isOpen={isCreateDialogOpen}
        parentTitle={connectingParentNode?.title || ''}
        parentLevel={connectingParentNode?.level || 0}
        childLevel={
          // 如果是虚拟根节点，根据当前子节点层级计算实际的子节点层级
          connectingParentNode?.id === 'root' && document?.root.children && document.root.children.length > 0
            ? document.root.children[0].level
            : undefined
        }
        onConfirm={handleCreateNodesConfirm}
        onCancel={handleCreateNodesCancel}
      />

      {/* 边的右键菜单 */}
      {contextMenuOpen && contextMenuEdge && (
        <div
          className="fixed z-50 rounded-md border shadow-lg py-1"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
        >
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:opacity-80 transition-opacity"
            style={{ color: themeConfig.danger }}
            onClick={handleDeleteEdge}
          >
            <Trash2 className="h-4 w-4" />
            删除连线
          </button>
        </div>
      )}

      {/* 点击其他地方关闭菜单 */}
      {contextMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setContextMenuOpen(false)
            setContextMenuEdge(null)
          }}
        />
      )}
    </div>
  )
}
