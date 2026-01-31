'use client'

/**
 * 树视图组件
 *
 * 左侧大纲视图，展示文档的树状结构
 * 使用浅色主题
 *
 * 对应技术文档6.1节
 */

import { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from './ui/scroll-area'
import { useDocumentStore } from '@/stores/documentStore'
import type { TreeNode } from '@/types/tree'

/**
 * 树节点组件
 */
interface TreeNodeItemProps {
  node: TreeNode
  depth: number
  isSelected: boolean
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}

function TreeNodeItem({
  node,
  depth,
  isSelected,
  expandedIds,
  onToggle,
  onSelect,
}: TreeNodeItemProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedIds.has(node.id)

  // 获取层级颜色
  const getLevelColor = (level: number) => {
    const colors = [
      'text-slate-900',
      'text-slate-800',
      'text-slate-700',
      'text-slate-600',
      'text-slate-500',
      'text-slate-500',
      'text-slate-500',
    ]
    return colors[level] || colors[0]
  }

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggle(node.id)
    },
    [node.id, onToggle]
  )

  const handleSelect = useCallback(() => {
    onSelect(node.id)
  }, [node.id, onSelect])

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1.5 px-2 cursor-pointer transition-colors',
          'hover:bg-slate-100',
          isSelected && 'bg-blue-50 hover:bg-blue-100'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleSelect}
      >
        {/* 展开/收起按钮 */}
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-slate-200"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* 文件图标 */}
        <FileText
          className={cn(
            'w-4 h-4 flex-shrink-0',
            isSelected ? 'text-blue-600' : 'text-slate-400'
          )}
        />

        {/* 节点标题 */}
        <span
          className={cn(
            'text-sm truncate flex-1',
            getLevelColor(node.level),
            isSelected && 'font-medium text-blue-700'
          )}
          title={node.title}
        >
          {node.title}
        </span>
      </div>

      {/* 子节点 */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              isSelected={isSelected}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 树视图组件
 */
export function TreeView() {
  const { document, selectedNodeId, expandedNodeIds, selectNode, toggleNode } =
    useDocumentStore()

  if (!document) {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex h-14 items-center border-b border-slate-200 px-4">
          <h2 className="text-lg font-semibold text-slate-800">大纲</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-slate-500">没有打开的文档</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* 头部 */}
      <div className="flex h-14 items-center border-b border-slate-200 px-4">
        <h2 className="text-lg font-semibold text-slate-800">大纲</h2>
        <span className="ml-2 text-xs text-slate-500">
          {document.fileName || '未命名'}
        </span>
      </div>

      {/* 树内容 */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          <TreeNodeItem
            node={document.root}
            depth={0}
            isSelected={selectedNodeId === document.root.id}
            expandedIds={expandedNodeIds}
            onToggle={toggleNode}
            onSelect={selectNode}
          />
        </div>
      </ScrollArea>
    </div>
  )
}

export default TreeView
