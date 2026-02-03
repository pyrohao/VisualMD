'use client'

/**
 * 编辑器工具栏组件
 *
 * 顶部工具栏，左侧文件操作、中间标签栏、右侧视图控制
 * 浏览器风格的动态多标签页设计 - 标签自动堆叠效果
 */

import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import {
  FolderOpen,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  ChevronDown,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useTabsStore } from '@/stores/tabsStore'
import { Button } from './ui/button'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { openFile, exportAsHTML } from '@/lib/file-system'
import { ThemeToggle } from './theme-toggle'
import { toast } from '@/hooks/use-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

interface EditorToolbarProps {
  onToggleRight: () => void
  rightCollapsed: boolean
  onSearch?: () => void
}

// 标签尺寸配置
const TAB_CONFIG = {
  maxWidth: 200,      // 最大宽度
  minWidth: 40,       // 最小宽度（堆叠时）
  normalWidth: 140,   // 正常宽度
  padding: 4,         // 标签间距
}

export function EditorToolbar({
  onToggleRight,
  rightCollapsed,
  onSearch,
}: EditorToolbarProps) {
  const { importFile } = useFileSystemStore()
  const { getThemeConfig } = useThemeStore()
  const { isPanelExpanded, togglePanel } = useSidebarStore()
  const { tabs, activeTabId, activateTab, closeTab, createTab, openFileInTab, getActiveTab, closeAllTabs } = useTabsStore()
  const [isLoading, setIsLoading] = useState(false)
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const [mounted, setMounted] = useState(false)
  const activeTab = getActiveTab()

  // 使用安全的主题配置，避免 SSR 不匹配
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])

  // 计算每个标签的宽度
  const tabWidths = useMemo(() => {
    if (tabs.length === 0) return {}
    
    const totalTabs = tabs.length
    const availableWidth = containerWidth - 40 // 减去新建按钮的空间
    
    // 计算理想宽度
    const idealWidth = Math.min(
      TAB_CONFIG.normalWidth,
      Math.max(TAB_CONFIG.minWidth, (availableWidth - (totalTabs - 1) * TAB_CONFIG.padding) / totalTabs)
    )
    
    // 为每个标签计算宽度
    const widths: Record<string, number> = {}
    tabs.forEach((tab) => {
      // 激活的标签或悬停的标签显示更宽
      const isActive = tab.id === activeTabId
      const isHovered = tab.id === hoveredTabId
      
      if (isActive) {
        widths[tab.id] = Math.min(TAB_CONFIG.maxWidth, Math.max(idealWidth, TAB_CONFIG.normalWidth))
      } else if (isHovered) {
        widths[tab.id] = Math.min(TAB_CONFIG.maxWidth, idealWidth * 1.2)
      } else {
        widths[tab.id] = idealWidth
      }
    })
    
    return widths
  }, [tabs, containerWidth, activeTabId, hoveredTabId])

  // 监听容器宽度变化
  useEffect(() => {
    const container = tabsContainerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })

    resizeObserver.observe(container)
    setContainerWidth(container.clientWidth)

    return () => resizeObserver.disconnect()
  }, [])

  // 处理打开文件
  const handleOpen = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await openFile()
      if (result.success && result.content && result.fileName) {
        importFile(result.fileName, result.content, null)
        openFileInTab(result.fileName, result.content)
      }
    } catch (error) {
      console.error('Failed to open file:', error)
      toast({
        title: '打开文件失败',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [importFile, openFileInTab])

  // 处理导出
  const handleExport = useCallback(async () => {
    if (!activeTab) return

    setIsLoading(true)
    try {
      const success = await exportAsHTML(activeTab.content, activeTab.fileName)
      if (success) {
        toast({ title: '导出成功' })
      }
    } catch (error) {
      console.error('Failed to export file:', error)
      toast({
        title: '导出文件失败',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [activeTab])

  // 处理新建标签 - 创建空白标签页
  const handleNewTab = () => {
    createTab(undefined, undefined, true)
  }

  return (
    <div
      className="flex h-11 items-center justify-between border-b px-2 shadow-sm"
      style={{
        backgroundColor: themeConfig.card,
        borderColor: themeConfig.border,
      }}
    >
      {/* 左侧：文件操作 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* 展开/收起左侧面板按钮 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePanel}
          className="h-8 w-8 transition-colors"
          style={{ color: themeConfig.muted }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = themeConfig.text
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = themeConfig.muted
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          {isPanelExpanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>

        <div
          className="mx-1 h-4 w-px"
          style={{ backgroundColor: themeConfig.border }}
        />

        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpen}
          disabled={isLoading}
          className="h-8 w-8 transition-colors"
          style={{ color: themeConfig.muted }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = themeConfig.text
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = themeConfig.muted
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleExport}
          disabled={isLoading || !mounted || !activeTab}
          className="h-8 w-8 transition-colors"
          style={{ color: themeConfig.muted }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = themeConfig.text
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = themeConfig.muted
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <Download className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onSearch}
          className="h-8 w-8 transition-colors"
          style={{ color: themeConfig.muted }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = themeConfig.text
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = themeConfig.muted
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* 中间：标签栏 */}
      <div 
        ref={tabsContainerRef}
        className="flex-1 mx-2 relative overflow-hidden h-full flex items-center"
      >
        {tabs.length === 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewTab}
            className="h-7 gap-1 text-xs transition-colors"
            style={{ color: themeConfig.muted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = themeConfig.text
              e.currentTarget.style.backgroundColor = themeConfig.hover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = themeConfig.muted
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <Plus className="h-3 w-3" />
            新建文档
          </Button>
        ) : (
          <div className="flex items-center h-full relative">
            {tabs.map((tab, index) => {
              const width = tabWidths[tab.id] || TAB_CONFIG.normalWidth
              const isActive = tab.id === activeTabId
              const isHovered = tab.id === hoveredTabId
              
              return (
                <div
                  key={tab.id}
                  onClick={() => activateTab(tab.id)}
                  onMouseEnter={() => setHoveredTabId(tab.id)}
                  onMouseLeave={() => setHoveredTabId(null)}
                  className={cn(
                    'group relative flex items-center h-7 rounded-md cursor-pointer select-none',
                    'transition-all duration-200 ease-out',
                    isActive && 'z-10'
                  )}
                  style={{
                    width: `${width}px`,
                    marginLeft: index > 0 ? `-${TAB_CONFIG.padding}px` : '0',
                    backgroundColor: isActive 
                      ? themeConfig.background 
                      : themeConfig.card,
                    border: `1px solid ${isActive ? themeConfig.border : themeConfig.border + '80'}`,
                    boxShadow: isActive 
                      ? `0 2px 4px #00000020` 
                      : 'none',
                    zIndex: isActive ? 10 : isHovered ? 5 : tabs.length - index,
                  }}
                >
                  {/* 左侧装饰线（扑克牌堆叠效果） */}
                  <div 
                    className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-md"
                    style={{
                      backgroundColor: isActive 
                        ? themeConfig.primary 
                        : 'transparent',
                    }}
                  />
                  
                  {/* 文件名 */}
                  <span 
                    className="flex-1 text-xs truncate px-2"
                    style={{
                      color: isActive ? themeConfig.text : themeConfig.muted,
                      fontWeight: isActive ? 500 : 400,
                    }}
                  >
                    {tab.fileName}
                  </span>

                  {/* 修改标记 */}
                  {tab.isModified && (
                    <span
                      className="w-1.5 h-1.5 rounded-full mr-1 flex-shrink-0"
                      style={{ backgroundColor: themeConfig.primary }}
                    />
                  )}

                  {/* 关闭按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                    className={cn(
                      'p-0.5 rounded mr-1 flex-shrink-0 transition-all duration-150',
                      'opacity-0 group-hover:opacity-100',
                      'hover:bg-white/10'
                    )}
                    style={{ color: themeConfig.muted }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}

            {/* 新建按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNewTab}
              className="h-7 w-7 flex-shrink-0 ml-1 transition-colors"
              style={{ color: themeConfig.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = themeConfig.text
                e.currentTarget.style.backgroundColor = themeConfig.hover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = themeConfig.muted
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* 右侧：标签页菜单和主题切换 */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* 标签页下拉菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 transition-colors"
              style={{ color: themeConfig.muted }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = themeConfig.text
                e.currentTarget.style.backgroundColor = themeConfig.hover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = themeConfig.muted
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 max-h-[70vh] overflow-y-auto"
            style={{
              backgroundColor: themeConfig.card,
              borderColor: themeConfig.border,
            }}
          >
            {/* 全部关闭 */}
            <DropdownMenuItem
              onClick={() => {
                closeAllTabs()
                // 关闭后自动创建空白标签页
                setTimeout(() => {
                  createTab(undefined, undefined, true)
                }, 0)
                toast({
                  title: '已关闭所有标签页',
                })
              }}
              className="cursor-pointer"
              style={{ color: themeConfig.text }}
            >
              <X className="mr-2 h-4 w-4" style={{ color: themeConfig.muted }} />
              <span>全部关闭</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator style={{ backgroundColor: themeConfig.border }} />

            {/* 当前打开的标签页列表 */}
            {tabs.length === 0 ? (
              <div
                className="px-2 py-3 text-sm text-center"
                style={{ color: themeConfig.muted }}
              >
                没有打开的标签页
              </div>
            ) : (
              tabs.map((tab) => (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => activateTab(tab.id)}
                  className="cursor-pointer"
                  style={{
                    color: tab.id === activeTabId ? themeConfig.primary : themeConfig.text,
                    backgroundColor: tab.id === activeTabId ? themeConfig.primary + '15' : 'transparent',
                  }}
                >
                  <FileText
                    className="mr-2 h-4 w-4 flex-shrink-0"
                    style={{ color: tab.id === activeTabId ? themeConfig.primary : themeConfig.muted }}
                  />
                  <span className="truncate">{tab.fileName}</span>
                  {tab.isModified && (
                    <span style={{ color: themeConfig.primary }} className="ml-1">
                      ●
                    </span>
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          className="mx-1 h-4 w-px"
          style={{ backgroundColor: themeConfig.border }}
        />

        <ThemeToggle />
      </div>
    </div>
  )
}

export default EditorToolbar
