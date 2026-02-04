'use client'

/**
 * 图标侧边栏组件
 *
 * 最左侧的图标栏，用于切换不同的功能面板
 * 设计参考 Obsidian 的左侧边栏
 */

import { FolderOpen, LayoutTemplate, Sparkles, Settings, ListTree, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarStore, type SidebarPanel } from '@/stores/sidebarStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useState, useEffect, useMemo } from 'react'
import { HelpDialog } from '../help-dialog'

interface IconItem {
  id: SidebarPanel
  icon: typeof FolderOpen
  label: string
  shortcut: string
}

const getIcons = (t: (key: string) => string): IconItem[] => [
  { id: 'files', icon: FolderOpen, label: t('sidebar.files'), shortcut: 'Ctrl+1' },
  { id: 'outline', icon: ListTree, label: t('sidebar.outline'), shortcut: 'Ctrl+2' },
  { id: 'templates', icon: LayoutTemplate, label: t('sidebar.templates'), shortcut: 'Ctrl+3' },
  { id: 'ai', icon: Sparkles, label: t('sidebar.aiGenerate'), shortcut: 'Ctrl+4' },
]

const getBottomIcons = (t: (key: string) => string): IconItem[] => [
  { id: 'settings', icon: Settings, label: t('sidebar.settings'), shortcut: '' },
]

export function IconSidebar() {
  const { activePanel, setActivePanel } = useSidebarStore()
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const [helpDialogOpen, setHelpDialogOpen] = useState(false)
  const { t } = useTranslation()

  // 使用安全的主题配置，避免 SSR 不匹配
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleIconClick = (panelId: SidebarPanel) => {
    // 切换到新面板
    setActivePanel(panelId)
  }

  const handleHelpClick = () => {
    setHelpDialogOpen(true)
  }

  // 使用 useMemo 缓存图标配置，避免每次渲染重新创建
  const ICONS = useMemo(() => getIcons(t), [t])
  const BOTTOM_ICONS = useMemo(() => getBottomIcons(t), [t])

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="h-full w-12 flex flex-col items-center py-3 border-r"
        style={{
          backgroundColor: themeConfig.sidebar,
          borderColor: themeConfig.border,
        }}
      >
        {/* 图标列表 */}
        <div className="flex-1 flex flex-col items-center gap-1">
          {ICONS.map((item) => {
            const Icon = item.icon
            const isActive = activePanel === item.id

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleIconClick(item.id)}
                    className={cn(
                      'relative w-9 h-9 rounded-md flex items-center justify-center transition-all duration-200',
                      'hover:bg-white/10',
                      isActive && 'bg-white/15'
                    )}
                    style={{
                      color: isActive ? themeConfig.primary : themeConfig.textMuted,
                    }}
                  >
                    <Icon className="w-5 h-5" />

                    {/* 左侧激活指示条 */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                        style={{ backgroundColor: themeConfig.primary }}
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-2">
                  <span>{item.label}</span>
                  <span className="text-xs opacity-50">{item.shortcut}</span>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        {/* 底部图标 */}
        <div className="flex flex-col items-center gap-1">
          {/* 帮助按钮 - 打开对话框 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleHelpClick}
                className={cn(
                  'relative w-9 h-9 rounded-md flex items-center justify-center transition-all duration-200',
                  'hover:bg-white/10'
                )}
                style={{
                  color: themeConfig.textMuted,
                }}
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <span>{mounted ? t('sidebar.help') : '帮助'}</span>
            </TooltipContent>
          </Tooltip>

          {BOTTOM_ICONS.map((item) => {
            const Icon = item.icon
            const isActive = activePanel === item.id

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleIconClick(item.id)}
                    className={cn(
                      'relative w-9 h-9 rounded-md flex items-center justify-center transition-all duration-200',
                      'hover:bg-white/10',
                      isActive && 'bg-white/15'
                    )}
                    style={{
                      color: isActive ? themeConfig.primary : themeConfig.textMuted,
                    }}
                  >
                    <Icon className="w-5 h-5" />

                    {/* 左侧激活指示条 */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                        style={{ backgroundColor: themeConfig.primary }}
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <span>{item.label}</span>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>

      {/* 帮助对话框 */}
      <HelpDialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen} />
    </TooltipProvider>
  )
}
