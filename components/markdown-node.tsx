'use client'

/**
 * Markdown节点组件
 *
 * React Flow自定义节点组件，用于显示标题节点
 * 支持横向布局，连接点在左右两侧
 * 点击节点打开右侧编辑面板
 * 点击序号可修改节点顺序
 *
 * 对应技术文档6.1节
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import { ChevronRight, ChevronDown, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getLevelColor, type FlowNodeData } from '@/lib/flow-helpers'
import { useThemeStore } from '@/stores/themeStore'
import { useDocumentStore } from '@/stores/documentStore'
import type { DocumentMetadata } from '@/types/tree'

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
 * 5. 点击序号可修改节点顺序
 */
function MarkdownNodeComponent(props: MarkdownNodeProps) {
  const { id, data, selected } = props
  const [isHovered, setIsHovered] = useState(false)
  const [isEditingOrder, setIsEditingOrder] = useState(false)
  const [orderInputValue, setOrderInputValue] = useState('')
  const [isContentExpanded, setIsContentExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
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
    isVirtual,
    orderIndex,
    siblingsCount,
    onMoveToPosition,
  } = data

  // 获取文档元数据（用于虚拟根节点）
  const { document } = useDocumentStore()
  const metadata: DocumentMetadata = document?.metadata || {}

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

  // 处理点击序号开始编辑
  const handleOrderClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    // 只要有兄弟节点数量信息（包括只有1个节点的情况），就允许编辑
    if (siblingsCount !== undefined && siblingsCount >= 1) {
      setOrderInputValue(orderIndex?.toString() || '1')
      setIsEditingOrder(true)
    }
  }, [orderIndex, siblingsCount])

  // 处理输入框失焦
  const handleInputBlur = useCallback(() => {
    if (isEditingOrder) {
      let newPosition = parseInt(orderInputValue, 10)
      const maxPosition = siblingsCount || 1

      // 如果输入无效或超出范围，自动调整到边界值
      if (isNaN(newPosition) || newPosition < 1) {
        newPosition = 1
      } else if (newPosition > maxPosition) {
        newPosition = maxPosition
      }

      onMoveToPosition?.(id, newPosition)
      setIsEditingOrder(false)
    }
  }, [isEditingOrder, orderInputValue, siblingsCount, id, onMoveToPosition])

  // 处理输入框按键
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      let newPosition = parseInt(orderInputValue, 10)
      const maxPosition = siblingsCount || 1

      // 如果输入无效或超出范围，自动调整到边界值
      if (isNaN(newPosition) || newPosition < 1) {
        newPosition = 1
      } else if (newPosition > maxPosition) {
        newPosition = maxPosition
      }

      onMoveToPosition?.(id, newPosition)
      setIsEditingOrder(false)
    } else if (e.key === 'Escape') {
      setIsEditingOrder(false)
    }
  }, [orderInputValue, siblingsCount, id, onMoveToPosition])

  // 自动聚焦输入框
  useEffect(() => {
    if (isEditingOrder && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditingOrder])

  // 获取层级颜色
  const borderColor = isDetached ? '#9ca3af' : (isVirtual ? '#8b5cf6' : getLevelColor(level))
  // 根据主题使用不同的背景色 - 黑暗主题使用深色背景
  const bgColor = isDetached
    ? (themeConfig.card === '#161b22' ? '#21262d' : '#f3f4f6')
    : isVirtual
      ? (themeConfig.card === '#161b22' ? '#2d1f4c' : '#f5f3ff')
      : (themeConfig.card === '#161b22'
          ? [`#1c3a5f`, `#1c3a5f`, `#064e3b`, `#78350f`, `#4c1d95`, `#7c2d12`, `#374151`][level] || '#1c3a5f'
          : [`#eff6ff`, `#eff6ff`, `#ecfdf5`, `#fffbeb`, `#f5f3ff`, `#fff7ed`, `#f9fafb`][level] || '#eff6ff')

  // 统一节点宽度
  const nodeWidth = 'w-[180px]'

  return (
    <div
      className={cn(
        'group relative rounded-lg border-2 transition-all duration-200',
        'shadow-sm hover:shadow-md cursor-pointer',
        nodeWidth
      )}
      style={{
        backgroundColor: selected ? themeConfig.card : bgColor,
        borderColor: selected ? themeConfig.accent : borderColor,
        borderLeftWidth: '5px',
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
      <div className="px-3 py-2.5">
        {/* 标题行 */}
        <div className="flex items-center gap-2">
          {/* 虚拟根节点显示文档图标和折叠按钮 */}
          {isVirtual ? (
            <>
              <div 
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full"
                style={{ backgroundColor: borderColor }}
              >
                <FileText className="w-3 h-3 text-white" />
              </div>
              {/* 虚拟根节点也添加折叠按钮 */}
              {Object.keys(metadata).length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsContentExpanded(!isContentExpanded)
                  }}
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-black/10 transition-colors"
                  title={isContentExpanded ? '收起内容' : '展开内容'}
                >
                  {isContentExpanded ? (
                    <ChevronDown className="w-4 h-4" style={{ color: themeConfig.muted }} />
                  ) : (
                    <ChevronRight className="w-4 h-4" style={{ color: themeConfig.muted }} />
                  )}
                </button>
              )}
            </>
          ) : (
            <>
              {/* 序号指示器 - 可点击编辑 */}
              {orderIndex !== undefined && (
                <div className="relative">
                  {isEditingOrder ? (
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={orderInputValue}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '')
                        setOrderInputValue(val)
                      }}
                      onBlur={handleInputBlur}
                      onKeyDown={handleInputKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      className="w-8 h-6 text-xs font-bold text-center rounded border outline-none"
                      style={{
                        borderColor: borderColor,
                        color: themeConfig.text,
                        backgroundColor: themeConfig.card,
                      }}
                    />
                  ) : (
                    <button
                      onClick={handleOrderClick}
                      disabled={siblingsCount === undefined || siblingsCount < 1}
                      className={cn(
                        'flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs font-bold rounded-full transition-all',
                        siblingsCount !== undefined && siblingsCount >= 1
                          ? 'cursor-pointer hover:scale-110 hover:shadow-md'
                          : 'cursor-default opacity-80'
                      )}
                      style={{
                        backgroundColor: borderColor,
                        color: '#ffffff',
                      }}
                      title={siblingsCount !== undefined && siblingsCount >= 1 ? `点击修改顺序 (1-${siblingsCount})` : undefined}
                    >
                      {orderIndex}
                    </button>
                  )}
                </div>
              )}
              {/* 内容展开/收起按钮 - 只在有内容时显示 */}
              {data.content && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsContentExpanded(!isContentExpanded)
                  }}
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-black/10 transition-colors"
                  title={isContentExpanded ? '收起内容' : '展开内容'}
                >
                  {isContentExpanded ? (
                    <ChevronDown className="w-4 h-4" style={{ color: themeConfig.muted }} />
                  ) : (
                    <ChevronRight className="w-4 h-4" style={{ color: themeConfig.muted }} />
                  )}
                </button>
              )}
            </>
          )}
          {/* 标题文本 */}
          <h3
            className="font-semibold flex-1 truncate text-lg"
            style={{ color: themeConfig.heading }}
            title={label}
          >
            {label 
              ? (label.length > 8 ? label.slice(0, 8) + '...' : label)
              : '未命名'}
          </h3>
        </div>

        {/* 虚拟根节点显示 YAML 元数据 - 根据展开状态显示，每行一对，最多两行 */}
        {isVirtual && isContentExpanded && Object.keys(metadata).length > 0 && (
          <div className="mt-1.5 text-xs" style={{ color: themeConfig.text }}>
            {Object.entries(metadata).slice(0, 2).map(([key, value]) => (
              <div key={key} className="truncate">
                <span style={{ color: themeConfig.muted }}>{key}:</span>{' '}
                {String(value).length > 25 
                  ? String(value).slice(0, 25) + '...' 
                  : String(value)}
              </div>
            ))}
            {Object.keys(metadata).length > 2 && (
              <div style={{ color: themeConfig.muted }}>+{Object.keys(metadata).length - 2} more</div>
            )}
          </div>
        )}

        {/* 内容展示 - 根据展开状态显示，最多两行 */}
        {!isVirtual && data.content && isContentExpanded && (
          <div 
            className="mt-1.5 text-xs line-clamp-2 break-words" 
            style={{ color: themeConfig.text }}
          >
            {data.content}
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
