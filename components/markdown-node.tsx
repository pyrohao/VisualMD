'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FLOW_HANDLE_IDS,
  getLevelColor,
  type FlowNodeData,
} from '@/lib/flow-helpers'
import { useThemeStore } from '@/stores/themeStore'
import { useDocumentStore } from '@/stores/documentStore'
import type { DocumentMetadata } from '@/types/tree'

interface MarkdownNodeProps {
  id: string
  data: FlowNodeData
  selected?: boolean
}

function MarkdownNodeComponent({ id, data, selected }: MarkdownNodeProps) {
  const [isEditingOrder, setIsEditingOrder] = useState(false)
  const [orderInputValue, setOrderInputValue] = useState('')
  const [isContentExpanded, setIsContentExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

  const {
    label,
    level,
    onSelect,
    isDetached,
    isVirtual,
    branchDirection,
    orderIndex,
    siblingsCount,
    onMoveToPosition,
  } = data

  const { document } = useDocumentStore()
  const metadata: DocumentMetadata = document?.metadata || {}

  const handleClick = useCallback(() => {
    onSelect?.(id)
  }, [id, onSelect])

  const handleOrderClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (siblingsCount !== undefined && siblingsCount >= 1) {
        setOrderInputValue(orderIndex?.toString() || '1')
        setIsEditingOrder(true)
      }
    },
    [orderIndex, siblingsCount]
  )

  const commitOrderInput = useCallback(() => {
    let newPosition = parseInt(orderInputValue, 10)
    const maxPosition = siblingsCount || 1

    if (Number.isNaN(newPosition) || newPosition < 1) {
      newPosition = 1
    } else if (newPosition > maxPosition) {
      newPosition = maxPosition
    }

    onMoveToPosition?.(id, newPosition)
    setIsEditingOrder(false)
  }, [id, onMoveToPosition, orderInputValue, siblingsCount])

  const handleInputBlur = useCallback(() => {
    if (isEditingOrder) {
      commitOrderInput()
    }
  }, [commitOrderInput, isEditingOrder])

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitOrderInput()
      } else if (e.key === 'Escape') {
        setIsEditingOrder(false)
      }
    },
    [commitOrderInput]
  )

  useEffect(() => {
    if (isEditingOrder && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditingOrder])

  const borderColor = isDetached ? '#9ca3af' : isVirtual ? '#8b5cf6' : getLevelColor(level)
  const bgColor = isDetached
    ? themeConfig.card === '#161b22'
      ? '#21262d'
      : '#f3f4f6'
    : isVirtual
      ? themeConfig.card === '#161b22'
        ? '#2d1f4c'
        : '#f5f3ff'
      : themeConfig.card === '#161b22'
        ? ['#1c3a5f', '#1c3a5f', '#064e3b', '#78350f', '#4c1d95', '#7c2d12', '#374151'][level] ||
          '#1c3a5f'
        : ['#eff6ff', '#eff6ff', '#ecfdf5', '#fffbeb', '#f5f3ff', '#fff7ed', '#f9fafb'][level] ||
          '#eff6ff'

  const leftAccentWidth = branchDirection === 'left' ? '2px' : '5px'
  const rightAccentWidth = branchDirection === 'left' ? '5px' : '2px'
  const handleStyle = { backgroundColor: borderColor }

  return (
    <div
      className={cn(
        'group relative w-[180px] rounded-lg border-2 transition-all duration-200',
        'cursor-pointer shadow-sm hover:shadow-md'
      )}
      style={{
        backgroundColor: selected ? themeConfig.card : bgColor,
        borderColor: selected ? themeConfig.accent : borderColor,
        borderLeftWidth: leftAccentWidth,
        borderRightWidth: rightAccentWidth,
      }}
      onClick={handleClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        id={FLOW_HANDLE_IDS.targetLeft}
        className="!h-3 !w-3 !border-2 !border-white"
        style={{ ...handleStyle, top: '35%' }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id={FLOW_HANDLE_IDS.sourceLeft}
        className="!h-3 !w-3 !border-2 !border-white"
        style={{ ...handleStyle, top: '65%' }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id={FLOW_HANDLE_IDS.targetRight}
        className="!h-3 !w-3 !border-2 !border-white"
        style={{ ...handleStyle, top: '35%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={FLOW_HANDLE_IDS.sourceRight}
        className="!h-3 !w-3 !border-2 !border-white"
        style={{ ...handleStyle, top: '65%' }}
      />

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {isVirtual ? (
            <>
              <div
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: borderColor }}
              >
                <FileText className="h-3 w-3 text-white" />
              </div>
              {Object.keys(metadata).length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsContentExpanded((value) => !value)
                  }}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded transition-colors hover:bg-black/10"
                  title={isContentExpanded ? '收起内容' : '展开内容'}
                >
                  {isContentExpanded ? (
                    <ChevronDown className="h-4 w-4" style={{ color: themeConfig.muted }} />
                  ) : (
                    <ChevronRight className="h-4 w-4" style={{ color: themeConfig.muted }} />
                  )}
                </button>
              )}
            </>
          ) : (
            <>
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
                        setOrderInputValue(e.target.value.replace(/[^0-9]/g, ''))
                      }}
                      onBlur={handleInputBlur}
                      onKeyDown={handleInputKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      className="h-6 w-8 rounded border text-center text-xs font-bold outline-none"
                      style={{
                        borderColor,
                        color: themeConfig.text,
                        backgroundColor: themeConfig.card,
                      }}
                    />
                  ) : (
                    <button
                      onClick={handleOrderClick}
                      disabled={siblingsCount === undefined || siblingsCount < 1}
                      className={cn(
                        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
                        siblingsCount !== undefined && siblingsCount >= 1
                          ? 'cursor-pointer hover:scale-110 hover:shadow-md'
                          : 'cursor-default opacity-80'
                      )}
                      style={{
                        backgroundColor: borderColor,
                        color: '#ffffff',
                      }}
                      title={
                        siblingsCount !== undefined && siblingsCount >= 1
                          ? `点击修改顺序 (1-${siblingsCount})`
                          : undefined
                      }
                    >
                      {orderIndex}
                    </button>
                  )}
                </div>
              )}
              {data.content && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsContentExpanded((value) => !value)
                  }}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded transition-colors hover:bg-black/10"
                  title={isContentExpanded ? '收起内容' : '展开内容'}
                >
                  {isContentExpanded ? (
                    <ChevronDown className="h-4 w-4" style={{ color: themeConfig.muted }} />
                  ) : (
                    <ChevronRight className="h-4 w-4" style={{ color: themeConfig.muted }} />
                  )}
                </button>
              )}
            </>
          )}

          <h3
            className="flex-1 truncate text-lg font-semibold"
            style={{ color: themeConfig.heading }}
            title={label}
          >
            {label ? (label.length > 8 ? `${label.slice(0, 8)}...` : label) : '未命名'}
          </h3>
        </div>

        {isVirtual && isContentExpanded && Object.keys(metadata).length > 0 && (
          <div className="mt-1.5 text-xs" style={{ color: themeConfig.text }}>
            {Object.entries(metadata)
              .slice(0, 2)
              .map(([key, value]) => (
                <div key={key} className="truncate">
                  <span style={{ color: themeConfig.muted }}>{key}:</span>{' '}
                  {String(value).length > 25 ? `${String(value).slice(0, 25)}...` : String(value)}
                </div>
              ))}
            {Object.keys(metadata).length > 2 && (
              <div style={{ color: themeConfig.muted }}>+{Object.keys(metadata).length - 2} more</div>
            )}
          </div>
        )}

        {!isVirtual && data.content && isContentExpanded && (
          <div className="mt-1.5 line-clamp-2 break-words text-xs" style={{ color: themeConfig.text }}>
            {data.content}
          </div>
        )}
      </div>

      {isDetached && (
        <div
          className="absolute -left-2 -top-2 rounded-full border-2 border-white px-2 py-0.5 text-xs font-medium"
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
