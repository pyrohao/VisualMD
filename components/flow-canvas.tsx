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
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  type OnConnectStart,
  type OnConnectEnd,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { MarkdownNode } from './markdown-node'
import { CreateNodesDialog } from './create-nodes-dialog'
import {
  FLOW_HANDLE_IDS,
  treeToNodesAndEdges,
  type FlowNodeData,
} from '@/lib/flow-helpers'
import type { TreeLayoutMode } from '@/lib/layout-engine'
import { useDocumentStore } from '@/stores/documentStore'
import { useCanvasLayoutStore } from '@/stores/canvasLayoutStore'
import type { DocumentMutation, TreeNode } from '@/types/tree'
import { useThemeStore } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { toast } from '@/hooks/use-toast'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { syncActiveDocumentToActiveSource } from '@/lib/editor-persistence'

type ThemeConfig = ReturnType<ReturnType<typeof useThemeStore.getState>['getThemeConfig']>

function createNodeCallbacks(
  updateNode: (nodeId: string, updates: Partial<TreeNode>) => void,
  toggleNode: (nodeId: string) => void,
  selectNode: (nodeId: string | null) => void
) {
  return {
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
      const documentStore = useDocumentStore.getState()
      const beforeMarkdown = documentStore.getCurrentMarkdown()
      documentStore.moveNodeToPosition(id, position)
      const afterMarkdown = useDocumentStore.getState().getCurrentMarkdown()

      if (afterMarkdown !== beforeMarkdown) {
        syncActiveDocumentToActiveSource({ markSaved: false })
      }
    },
    onMetadataChange: (metadata: Record<string, string>) => {
      useDocumentStore.getState().updateMetadata(metadata)
    },
  }
}

function attachNodeCallbacks(
  nodes: Node<FlowNodeData>[],
  callbacks: ReturnType<typeof createNodeCallbacks>,
  selectedNodeId: string | null
): Node<FlowNodeData>[] {
  return nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId,
    data: {
      ...node.data,
      ...callbacks,
    },
  }))
}

function attachEdgeStyles(
  edges: Edge[],
  _themeConfig: ThemeConfig
): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    animated: false,
  }))
}

function toFlowNodeData(
  node: TreeNode,
  layoutMode: TreeLayoutMode,
  metadata?: Record<string, string>,
  orderIndex?: number,
  siblingsCount?: number
): Partial<FlowNodeData> {
  return {
    label: node.isVirtual ? 'Metadata' : node.title || '未命名',
    level: node.level,
    isCollapsed: node.isCollapsed || false,
    hasChildren: node.children.length > 0,
    layoutMode,
    content: node.content,
    childrenCount: node.children.length,
    isVirtual: node.isVirtual || false,
    orderIndex,
    siblingsCount,
    metadata: node.isVirtual ? metadata : undefined,
  }
}

function findNodeContext(
  root: TreeNode,
  nodeId: string
): { node: TreeNode; orderIndex?: number; siblingsCount?: number } | null {
  if (root.id === nodeId) {
    return { node: root, orderIndex: 1, siblingsCount: 1 }
  }

  const walkTree = (parent: TreeNode): { node: TreeNode; orderIndex?: number; siblingsCount?: number } | null => {
    const childCount = parent.children.length
    for (let index = 0; index < childCount; index += 1) {
      const child = parent.children[index]
      if (child.id === nodeId) {
        return {
          node: child,
          orderIndex: index + 1,
          siblingsCount: childCount,
        }
      }
      const nested = walkTree(child)
      if (nested) {
        return nested
      }
    }
    return null
  }
  return walkTree(root)
}

function rebuildFlowGraph(
  document: NonNullable<ReturnType<typeof useDocumentStore.getState>['document']>,
  layoutMode: TreeLayoutMode,
  selectedNodeId: string | null,
  themeConfig: ThemeConfig,
  callbacks: ReturnType<typeof createNodeCallbacks>
) {
  const { nodes, edges } = treeToNodesAndEdges(document.root, layoutMode)

  return {
    nodes: attachNodeCallbacks(nodes as Node<FlowNodeData>[], callbacks, selectedNodeId),
    edges: attachEdgeStyles(edges, themeConfig),
  }
}

function applyVisualMutationToNodes(
  currentNodes: Node<FlowNodeData>[],
  document: NonNullable<ReturnType<typeof useDocumentStore.getState>['document']>,
  mutation: DocumentMutation,
  layoutMode: TreeLayoutMode,
  selectedNodeId: string | null,
  callbacks: ReturnType<typeof createNodeCallbacks>
): Node<FlowNodeData>[] | null {
  if (!mutation.nodeId) {
    return null
  }

  const context = findNodeContext(document.root, mutation.nodeId)
  if (!context) {
    return null
  }

  return currentNodes.map((flowNode) => {
    if (flowNode.id !== mutation.nodeId) {
      return flowNode
    }

    const nextData = {
      ...flowNode.data,
      ...toFlowNodeData(
        context.node,
        layoutMode,
        document.metadata,
        context.orderIndex,
        context.siblingsCount
      ),
      ...callbacks,
    } satisfies FlowNodeData

    return {
      ...flowNode,
      position: context.node.position ?? flowNode.position,
      selected: flowNode.id === selectedNodeId,
      data: nextData,
    }
  })
}

// 注册自定义节点类型
const nodeTypes: NodeTypes = {
  headingNode: MarkdownNode as unknown as NodeTypes[string],
}

const CREATE_CHILD_HANDLE_IDS = new Set<string>([
  FLOW_HANDLE_IDS.sourceLeft,
  FLOW_HANDLE_IDS.sourceRight,
  FLOW_HANDLE_IDS.sourceBottom,
])

export function FlowCanvas() {
  // 从Store获取状态和操作
  const {
    document,
    selectedNodeId,
    selectNode,
    updateNode,
    toggleNode,
    error,
    clearError,
    markAsSaved,
    lastMutation,
  } = useDocumentStore()

  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  const { t } = useTranslation()
  const { mode: layoutMode } = useCanvasLayoutStore()
  const nodeCallbacks = useMemo(
    () =>
      createNodeCallbacks(updateNode, toggleNode, (nodeId) => {
        selectNode(nodeId)
      }),
    [selectNode, toggleNode, updateNode]
  )

  // 启用键盘快捷键
  useKeyboardShortcuts({
    enableUndoRedo: true,
    enableSave: true,
    onSave: () => {
      markAsSaved()
      toast({
        title: t('toast.saved'),
      })
    },
  })

  // 将树结构转换为React Flow节点和边

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!document) {
      return { nodes: [], edges: [] }
    }
    return rebuildFlowGraph(
      document,
      layoutMode,
      selectedNodeId,
      themeConfig,
      nodeCallbacks
    )
  }, [document, layoutMode, nodeCallbacks, selectedNodeId, themeConfig])

  // React Flow??

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as Node<FlowNodeData>[])
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const { fitView, screenToFlowPosition } = useReactFlow()

  // ??????????

  const connectingNodeId = useRef<string | null>(null)
  const connectingHandleId = useRef<string | null>(null)
  const connectionSuccess = useRef<boolean>(false)
  // ???????????????????????
  const connectEndPosition = useRef<{ x: number; y: number } | null>(null)

  // ??????????

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [connectingParentNode, setConnectingParentNode] = useState<TreeNode | null>(null)
  const lastAppliedMutationId = useRef<number>(0)
  const lastGraphContextRef = useRef<{
    documentVersion: number
    layoutMode: string
    themeKey: string
  }>({
    documentVersion: -1,
    layoutMode: '',
    themeKey: '',
  })

  // ????????????
  useEffect(() => {
    if (!document) {
      lastAppliedMutationId.current = 0
      lastGraphContextRef.current = {
        documentVersion: -1,
        layoutMode: '',
        themeKey: '',
      }
      setNodes([])
      setEdges([])
      return
    }

    const themeKey = [
      themeConfig.background,
      themeConfig.card,
      themeConfig.text,
      themeConfig.border,
      themeConfig.primary,
      themeConfig.accent,
    ].join('|')

    const graphContextChanged =
      lastGraphContextRef.current.documentVersion !== document.version ||
      lastGraphContextRef.current.layoutMode !== layoutMode ||
      lastGraphContextRef.current.themeKey !== themeKey
    const mutationChanged = lastMutation.id !== lastAppliedMutationId.current

    if (!mutationChanged && !graphContextChanged) {
      return
    }

    if (mutationChanged && !graphContextChanged && lastMutation.scope === 'visual') {
      const patchedNodes = applyVisualMutationToNodes(
        nodes,
        document,
        lastMutation,
        layoutMode,
        selectedNodeId,
        nodeCallbacks
      )

      if (patchedNodes) {
        setNodes(patchedNodes)

        if (lastMutation.type === 'update-node' && lastMutation.nodeId) {
          setEdges((currentEdges) => attachEdgeStyles(currentEdges, themeConfig))
        }

        lastAppliedMutationId.current = lastMutation.id
        lastGraphContextRef.current = {
          documentVersion: document.version,
          layoutMode,
          themeKey,
        }
        return
      }
    }

    const nextGraph = rebuildFlowGraph(
      document,
      layoutMode,
      selectedNodeId,
      themeConfig,
      nodeCallbacks
    )
    setNodes(nextGraph.nodes)
    setEdges(nextGraph.edges)
    lastAppliedMutationId.current = lastMutation.id
    lastGraphContextRef.current = {
      documentVersion: document.version,
      layoutMode,
      themeKey,
    }
  }, [document, lastMutation, layoutMode, nodeCallbacks, nodes, selectedNodeId, setEdges, setNodes, themeConfig])

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
  // 处理连接开始

  const onConnectStart: OnConnectStart = useCallback(
    (_event, params) => {
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

      if (!sourceNodeId || !sourceHandle || !CREATE_CHILD_HANDLE_IDS.has(sourceHandle)) {
        connectingNodeId.current = null
        connectingHandleId.current = null
        connectionSuccess.current = false
        connectEndPosition.current = null
        return
      }

      if (connectionSuccess.current) {
        connectingNodeId.current = null
        connectingHandleId.current = null
        connectionSuccess.current = false
        connectEndPosition.current = null
        return
      }

      if (event && 'clientX' in event) {
        const mouseEvent = event as MouseEvent
        const flowPosition = screenToFlowPosition({
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
        })
        connectEndPosition.current = flowPosition
      }

      const parentNode = document?.root
        ? (() => {
            const findNode = (root: TreeNode, id: string): TreeNode | null => {
              if (root.id === id) return root
              for (const child of root.children) {
                const found = findNode(child, id)
                if (found) return found
              }
              return null
            }
            return findNode(document.root, sourceNodeId)
          })()
        : null

      if (!parentNode) {
        connectingNodeId.current = null
        connectingHandleId.current = null
        connectionSuccess.current = false
        connectEndPosition.current = null
        return
      }

      if (parentNode.level >= 6) {
        toast({
          title: t('common.maxLevelReached'),
          variant: 'destructive',
        })
        connectingNodeId.current = null
        connectingHandleId.current = null
        connectionSuccess.current = false
        connectEndPosition.current = null
        return
      }

      setConnectingParentNode(parentNode)
      setIsCreateDialogOpen(true)
    },
    [document, screenToFlowPosition, t]
  )

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

  // 节点间拖拽连线不再执行重挂接，仅用于阻止“松手后创建子节点”的误判

  const onConnect: OnConnect = useCallback(
    () => {
      connectionSuccess.current = true
    },
    []
  )

  // 处理画布点击（取消选择）

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 600 })
    }, 100)
    return () => clearTimeout(timer)
  }, [fitView, layoutMode])

  // 监听错误并自动清除
  useEffect(() => {
    if (error) {
      // 显示错误提示
      toast({
        title: t('common.error'),
        description: error,
        variant: 'destructive',
      })
      // 清除错误
      clearError()
    }
  }, [clearError, error, t])

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
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.1,
          maxZoom: 1.5,
        }}
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{
          animated: false,
          style: { stroke: themeConfig.muted, strokeWidth: 2 },
          type: 'default',
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
    </div>
  )
}
