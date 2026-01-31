'use client'

/**
 * 树视图组件
 *
 * 左侧大纲视图，展示文档的树状结构
 * 支持主题切换
 *
 * 对应技术文档6.1节
 */

import { useCallback } from 'react'
import { ChevronRight, ChevronDown, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from './ui/scroll-area'
import { useDocumentStore } from '@/stores/documentStore'
import { useThemeStore } from '@/stores/themeStore'
import type { TreeNode } from '@/types/tree'

/**
 * 树节点组件
 */
interface TreeNodeItemProps {
  node: TreeNode
  depth: number
  isSelected: boolean
  expandedIds: Set<string>
  selectedNodeId: string | null
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}

function TreeNodeItem({
  node,
  depth,
  isSelected,
  expandedIds,
  selectedNodeId,
  onToggle,
  onSelect,
}: TreeNodeItemProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedIds.has(node.id)

  // 获取主题配置
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

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
          'flex items-center gap-1 py-1.5 px-2 cursor-pointer transition-colors'
        )}
        style={{
          paddingLeft: `${depth * 12 + 8}px`,
          backgroundColor: isSelected ? `${themeConfig.accent}15` : 'transparent',
        }}
        onClick={handleSelect}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'transparent'
          }
        }}
      >
        {/* 展开/收起按钮 */}
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded"
            style={{
              color: themeConfig.muted,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeConfig.hover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* 文件图标 */}
        <FileText
          className="w-4 h-4 flex-shrink-0"
          style={{
            color: isSelected ? themeConfig.accent : themeConfig.muted,
          }}
        />

        {/* 节点标题 */}
        <span
          className="text-sm truncate flex-1"
          style={{
            color: isSelected ? themeConfig.accent : themeConfig.text,
            fontWeight: isSelected ? 500 : 400,
          }}
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
              isSelected={selectedNodeId === child.id}
              expandedIds={expandedIds}
              selectedNodeId={selectedNodeId}
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

  // 获取主题配置
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

  if (!document) {
    return (
      <div
        className="flex h-full flex-col"
        style={{ backgroundColor: themeConfig.card }}
      >
        <div
          className="flex h-14 items-center border-b px-4"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
          }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: themeConfig.heading }}
          >
            大纲
          </h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p style={{ color: themeConfig.muted }}>没有打开的文档</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: themeConfig.card }}
    >
      {/* 头部 */}
      <div
        className="flex h-14 items-center border-b px-4"
        style={{
          backgroundColor: themeConfig.card,
          borderColor: themeConfig.border,
        }}
      >
        <h2
          className="text-lg font-semibold"
          style={{ color: themeConfig.heading }}
        >
          大纲
        </h2>
        <span
          className="ml-2 text-xs"
          style={{ color: themeConfig.muted }}
        >
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
            selectedNodeId={selectedNodeId}
            onToggle={toggleNode}
            onSelect={selectNode}
          />
        </div>
      </ScrollArea>
    </div>
  )
}

export default TreeView
