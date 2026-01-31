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
import { LayoutGrid } from 'lucide-react'
import { Button } from './ui/button'
import { MarkdownNode } from './markdown-node'
import { CreateNodesDialog } from './create-nodes-dialog'
import { treeToNodesAndEdges, type FlowNodeData } from '@/lib/flow-helpers'
import { calculateTreeLayout } from '@/lib/layout-engine'
import { useDocumentStore } from '@/stores/documentStore'
import type { TreeNode } from '@/types/tree'
import { useThemeStore } from '@/stores/themeStore'

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
  } = useDocumentStore()

  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

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

  // 用于跟踪连接起始节点
  const connectingNodeId = useRef<string | null>(null)
  const connectingHandleId = useRef<string | null>(null)
  const connectionSuccess = useRef<boolean>(false)

  // 创建子节点对话框状态
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [connectingParentNode, setConnectingParentNode] = useState<TreeNode | null>(null)

  // 当树结构变化时更新节点和边
  useEffect(() => {
    if (!document) return

    const detachedNodes = (document as any).detachedNodes || []
    const { nodes: newNodes, edges: newEdges } = treeToNodesAndEdges(document.root, detachedNodes)

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
      },
    }))

    setNodes(nodesWithCallbacks as Node<FlowNodeData>[])
    setEdges(newEdges)
  }, [document?.root, (document as any)?.detachedNodes, setNodes, setEdges, updateNode, toggleNode, selectNode])

  // 选中节点变化时更新节点样式
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      }))
    )
  }, [selectedNodeId, setNodes])

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
        return
      }

      // 如果连接已经成功建立，不打开创建对话框
      if (connectionSuccess.current) {
        // 重置连接状态
        connectingNodeId.current = null
        connectingHandleId.current = null
        connectionSuccess.current = false
        return
      }

      // 重置连接状态
      connectingNodeId.current = null
      connectingHandleId.current = null
      connectionSuccess.current = false

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

      if (!parentNode) return

      // 检查层级限制
      if (parentNode.level >= 6) {
        alert('已达到最大层级限制（6级），无法继续添加子节点')
        return
      }

      // 打开创建子节点对话框
      setConnectingParentNode(parentNode)
      setIsCreateDialogOpen(true)
    },
    [document]
  )

  // 处理创建子节点确认
  const handleCreateNodesConfirm = useCallback((titles: string[]) => {
    if (!connectingParentNode) return

    // 批量创建子节点
    const createdNodeIds: string[] = []
    for (const title of titles) {
      const trimmedTitle = title.trim()
      if (trimmedTitle) {
        const newNodeId = useDocumentStore.getState().addChildNode(
          connectingParentNode.id,
          trimmedTitle
        )
        if (newNodeId) {
          createdNodeIds.push(newNodeId)
        }
      }
    }

    // 关闭对话框
    setIsCreateDialogOpen(false)
    setConnectingParentNode(null)

    // 如果有创建的节点，选中最后一个
    if (createdNodeIds.length > 0) {
      selectNode(createdNodeIds[createdNodeIds.length - 1])
    }
  }, [connectingParentNode, selectNode])

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

      // 如果源节点是断开的，尝试连接到目标节点
      if (isSourceDetached) {
        connectNode(source, target)
        return
      }

      // 如果目标节点是断开的，尝试将目标节点连接到源节点
      if (isTargetDetached) {
        connectNode(target, source)
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
        alert(`层级不匹配：H${targetNode.level} 节点不能连接到 H${sourceNode.level} 节点下。只能连接 H${expectedLevel} 节点。`)
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

  // 处理边的点击（删除连接）
  const onEdgeClick: EdgeMouseHandler = useCallback((_, edge) => {
    if (!document) return

    // 获取边的目标节点ID
    const targetId = edge.target

    // 查找目标节点
    const findNode = (root: TreeNode, id: string): TreeNode | null => {
      if (root.id === id) return root
      for (const child of root.children) {
        const found = findNode(child, id)
        if (found) return found
      }
      return null
    }

    const targetNode = findNode(document.root, targetId)
    if (!targetNode) return

    // 确认是否断开连接
    if (confirm(`确定要断开「${targetNode.title}」的连接吗？\n\n断开后该节点及其子节点将不会显示在导出的 Markdown 中，但节点数据会被保留。`)) {
      // 获取当前节点的位置并保存
      const currentNode = nodes.find(n => n.id === targetId)
      if (currentNode?.position) {
        // 先更新节点的位置信息
        updateNode(targetId, { position: currentNode.position })
      }
      // 然后断开节点
      setTimeout(() => {
        detachNode(targetId)
      }, 0)
    }
  }, [document, detachNode, nodes, updateNode])

  // 处理节点点击
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    selectNode(node.id)
  }, [selectNode])

  // 处理画布点击（取消选择）
  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  // 一键整理布局
  const handleLayout = useCallback(() => {
    if (!document) return

    // 重新计算布局（包含断开的节点）
    const detachedNodes = (document as any).detachedNodes || []
    const positions = calculateTreeLayout(document.root, detachedNodes)

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
  }, [document, setNodes, fitView])

  // 监听错误并自动清除
  useEffect(() => {
    if (error) {
      // 显示错误提示（使用 alert 或 toast）
      alert(error)
      // 清除错误
      clearError()
    }
  }, [error, clearError])

  // 连接成功后自动整理布局
  useEffect(() => {
    if (!document) return
    
    // 监听连接操作后的布局更新
    const handleConnectAndLayout = () => {
      handleLayout()
    }

    // 这里使用 setTimeout 确保状态更新后再整理布局
    const timer = setTimeout(() => {
      handleLayout()
    }, 100)

    return () => clearTimeout(timer)
  }, [document?.root, (document as any)?.detachedNodes, handleLayout])

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
        onEdgeClick={onEdgeClick}
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
        }}
        colorMode="light"
        proOptions={{ hideAttribution: true }}
      >
        {/* 网格背景 */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={themeConfig.border}
        />

        {/* 控制按钮 */}
        <Controls
          className="rounded-lg border shadow-lg"
          style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border }}
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
            整理布局
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
        onConfirm={handleCreateNodesConfirm}
        onCancel={handleCreateNodesCancel}
      />
    </div>
  )
}
