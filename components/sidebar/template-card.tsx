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
import { useThemeStore } from '@/stores/themeStore'
import type { Template } from '@/stores/sidebarStore'
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
  const themeConfig = getThemeConfig()

  // 获取模板内容预览（前100个字符）
  const getPreview = (content: string) => {
    // 移除 front matter
    const withoutFrontMatter = content.replace(/^---[\s\S]*?---\n*/, '')
    // 取前100个字符
    return withoutFrontMatter.slice(0, 100).replace(/\n/g, ' ') + '...'
  }

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
          {/* 模板类型标识 */}
          {template.isBuiltIn && (
            <span
              className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: themeConfig.primary + '20',
                color: themeConfig.primary,
              }}
            >
              内置
            </span>
          )}

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

          {/* 内容预览 */}
          <p
            className="text-xs line-clamp-2 mt-2"
            style={{ color: themeConfig.textMuted }}
          >
            {getPreview(template.content)}
          </p>

          {/* 底部信息 */}
          <div
            className="flex items-center justify-between mt-3 pt-2 border-t text-[10px]"
            style={{
              borderColor: themeConfig.border,
              color: themeConfig.textMuted,
            }}
          >
            <span>
              {template.isBuiltIn
                ? '系统模板'
                : new Date(template.updatedAt).toLocaleDateString()}
            </span>
            <div className="flex items-center gap-2">
              {isModified && (
                <span 
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: themeConfig.primary }}
                  title="有未保存的修改"
                />
              )}
              <span>{template.content.length} 字符</span>
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

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={onDelete}
          className="gap-2 text-red-500 focus:text-red-500"
        >
          <Trash2 className="w-4 h-4" />
          <span>删除模板</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
