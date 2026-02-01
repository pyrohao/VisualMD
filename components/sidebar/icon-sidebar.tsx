'use client'

/**
 * 图标侧边栏组件
 *
 * 最左侧的图标栏，用于切换不同的功能面板
 * 设计参考 Obsidian 的左侧边栏
 */

import { FolderOpen, LayoutTemplate, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarStore, type SidebarPanel } from '@/stores/sidebarStore'
import { useThemeStore } from '@/stores/themeStore'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface IconItem {
  id: SidebarPanel
  icon: typeof FolderOpen
  label: string
  shortcut: string
}

const ICONS: IconItem[] = [
  { id: 'files', icon: FolderOpen, label: '文件', shortcut: 'Ctrl+1' },
  { id: 'templates', icon: LayoutTemplate, label: '模板', shortcut: 'Ctrl+2' },
]

export function IconSidebar() {
  const { activePanel, setActivePanel, isPanelExpanded, togglePanel } = useSidebarStore()
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

  const handleIconClick = (panelId: SidebarPanel) => {
    if (activePanel === panelId) {
      // 点击已选中的图标，切换面板展开/收起
      togglePanel()
    } else {
      // 切换到新面板
      setActivePanel(panelId)
    }
  }

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

        {/* 展开/收起按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={togglePanel}
              className="w-9 h-9 rounded-md flex items-center justify-center transition-all duration-200 hover:bg-white/10"
              style={{ color: themeConfig.textMuted }}
            >
              {isPanelExpanded ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {isPanelExpanded ? '收起面板' : '展开面板'}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
