'use client'

/**
 * 模板卡片组件
 *
 * 展示单个模板的信息，支持右键菜单操作
 * - 编辑模板
 * - 使用模板
 * - 删除模板
 */

import { FileText, Trash2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import type { Template } from '@/stores/sidebarStore'
import { useState, useEffect } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface TemplateCardProps {
  template: Template
  isSelected: boolean
  isModified?: boolean
  onSelect: () => void
  onUse: () => void
  onDelete: () => void
}

export function TemplateCard({
  template,
  isSelected,
  isModified,
  onSelect,
  onUse,
  onDelete,
}: TemplateCardProps) {
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onClick={onSelect}
          className={cn(
            'group relative p-3 rounded-lg border cursor-pointer transition-all duration-200',
            'hover:shadow-md hover:border-opacity-50',
            isSelected && 'ring-2 ring-offset-1'
          )}
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            ...(isSelected && { ringColor: themeConfig.primary }),
          }}
        >


          {/* 图标和标题 */}
          <div className="flex items-start gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: themeConfig.primary + '15' }}
            >
              <FileText
                className="w-5 h-5"
                style={{ color: themeConfig.primary }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h4
                className="font-medium text-sm truncate"
                style={{ color: themeConfig.text }}
              >
                {template.name}
              </h4>
              <p
                className="text-xs mt-0.5 line-clamp-1"
                style={{ color: themeConfig.textMuted }}
              >
                {template.description || '暂无描述'}
              </p>
            </div>
          </div>

        </div>
      </ContextMenuTrigger>

      {/* 右键菜单 */}
      <ContextMenuContent className="w-40">
        <ContextMenuItem onClick={onUse} className="gap-2">
          <Check className="w-4 h-4" />
          <span>使用模板</span>
        </ContextMenuItem>

        {!template.isBuiltIn && (
          <>
            <ContextMenuSeparator />

            <ContextMenuItem
              onClick={onDelete}
              className="gap-2 text-red-500 focus:text-red-500"
            >
              <Trash2 className="w-4 h-4" />
              <span>删除模板</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
