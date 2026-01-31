'use client'

/**
 * Markdown节点组件
 *
 * React Flow自定义节点组件，用于显示标题节点
 * 支持横向布局，连接点在左右两侧
 * 点击节点打开右侧编辑面板
 *
 * 对应技术文档6.1节
 */

import { memo, useState, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getLevelColor, getLevelBgColor, type FlowNodeData } from '@/lib/flow-helpers'
import { useThemeStore } from '@/stores/themeStore'

/**
 * Markdown节点组件属性
 */
interface MarkdownNodeProps {
  id: string
  data: FlowNodeData
  selected?: boolean
}

/**
 * Markdown节点组件
 *
 * 功能：
 * 1. 显示节点标题和层级
 * 2. 点击打开编辑面板
 * 3. 展开/收起子节点按钮
 * 4. 左右连接点支持横向布局
 */
function MarkdownNodeComponent(props: MarkdownNodeProps) {
  const { id, data, selected } = props
  const [isHovered, setIsHovered] = useState(false)
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

  const {
    label,
    level,
    isCollapsed,
    hasChildren,
    childrenCount,
    onToggleCollapse,
    onSelect,
    isDetached,
  } = data

  // 处理展开/收起
  const handleToggleCollapse = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggleCollapse?.(id)
    },
    [id, onToggleCollapse]
  )

  // 处理点击选择
  const handleClick = useCallback(() => {
    onSelect?.(id)
  }, [id, onSelect])

  // 获取层级颜色
  const borderColor = isDetached ? '#9ca3af' : getLevelColor(level)
  const bgColor = isDetached ? '#f3f4f6' : getLevelBgColor(level)

  return (
    <div
      className={cn(
        'group relative min-w-[180px] max-w-[300px] rounded-lg border-2 transition-all duration-200',
        'shadow-sm hover:shadow-md cursor-pointer'
      )}
      style={{
        backgroundColor: selected ? themeConfig.card : bgColor,
        borderColor: selected ? themeConfig.accent : borderColor,
        borderLeftWidth: '6px',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* 左侧输入连接点 - 用于接收父节点连接 */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-3 !h-3 !border-2 !border-white"
        style={{ backgroundColor: borderColor }}
      />

      {/* 节点内容 */}
      <div className="px-4 py-3">
        {/* 标题行 */}
        <div className="flex items-center gap-2">
          {/* 展开/收起按钮 */}
          {hasChildren && (
            <button
              onClick={handleToggleCollapse}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-black/10 transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" style={{ color: themeConfig.muted }} />
              ) : (
                <ChevronDown className="w-4 h-4" style={{ color: themeConfig.muted }} />
              )}
            </button>
          )}

          {/* 标题文本 */}
          <h3
            className={cn(
              'font-semibold truncate flex-1',
              level === 0 && 'text-lg',
              level === 1 && 'text-base',
              level >= 2 && 'text-sm'
            )}
            style={{ color: themeConfig.heading }}
            title={label}
          >
            {label || '未命名'}
          </h3>
        </div>

        {/* 子节点数量指示器 */}
        {hasChildren && isCollapsed && (
          <div className="mt-1 text-xs pl-7" style={{ color: themeConfig.muted }}>
            {childrenCount} 个子节点
          </div>
        )}

        {/* 内容预览（仅显示前50个字符） */}
        {data.content && (
          <div className="mt-2 text-xs line-clamp-2 pl-7" style={{ color: themeConfig.text }}>
            {data.content.slice(0, 50)}
            {data.content.length > 50 ? '...' : ''}
          </div>
        )}
      </div>

      {/* 右侧输出连接点 - 用于连接子节点 */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-3 !h-3 !border-2 !border-white"
        style={{ backgroundColor: borderColor }}
      />

      {/* 选中指示器 */}
      {selected && (
        <div
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white"
          style={{ backgroundColor: themeConfig.accent }}
        />
      )}

      {/* 断开状态指示器 */}
      {isDetached && (
        <div
          className="absolute -top-2 -left-2 px-2 py-0.5 text-xs font-medium rounded-full border-2 border-white"
          style={{ backgroundColor: '#9ca3af', color: '#ffffff' }}
        >
          已断开
        </div>
      )}
    </div>
  )
}

export const MarkdownNode = memo(MarkdownNodeComponent)

export default MarkdownNode
