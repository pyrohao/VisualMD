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
  GitBranch,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useTabsStore } from '@/stores/tabsStore'
import { Button } from './ui/button'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { openFile, exportAsMarkdown } from '@/lib/file-system'
import { ThemeToggle } from './theme-toggle'
import { LanguageToggle } from './language-switcher'
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
  const { tabs, activeTabId, activateTab, closeTab, createTab, openFileInTab, getActiveTab, closeAllTabs, reorderTabs } = useTabsStore()
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const [mounted, setMounted] = useState(false)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
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
        title: t('file.openFileFailed'),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [importFile, openFileInTab, t])

  // 处理导出 - 使用最新的 Markdown 内容
  const handleExport = useCallback(async () => {
    if (!activeTab) return

    setIsLoading(true)
    try {
      // 从 documentStore 获取最新的 Markdown 内容
      const { getCurrentMarkdown } = useDocumentStore.getState()
      const latestContent = getCurrentMarkdown()

      const success = exportAsMarkdown(latestContent, activeTab.fileName)
      if (success) {
        toast({ title: t('file.exportSuccess') })
      }
    } catch (error) {
      console.error('Failed to export file:', error)
      toast({
        title: t('file.exportFailed'),
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, t])

  // 处理新建标签 - 创建空白标签页
  const handleNewTab = () => {
    createTab(undefined, undefined, true)
  }

  // 处理标签拖拽开始
  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
    // 设置拖拽时的透明图像
    const dragImage = document.createElement('div')
    dragImage.style.cssText = `
      position: fixed;
      top: -1000px;
      padding: 4px 12px;
      background: ${themeConfig.card};
      border: 1px solid ${themeConfig.border};
      border-radius: 4px;
      color: ${themeConfig.text};
      font-size: 12px;
      pointer-events: none;
      z-index: 9999;
    `
    dragImage.textContent = tabs.find(t => t.id === tabId)?.fileName || ''
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 0, 0)
    setTimeout(() => document.body.removeChild(dragImage), 0)
  }, [tabs, themeConfig])

  // 处理标签拖拽经过
  const handleDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (tabId !== draggedTabId) {
      setDragOverTabId(tabId)
    }
  }, [draggedTabId])

  // 处理标签拖拽离开
  const handleDragLeave = useCallback(() => {
    setDragOverTabId(null)
  }, [])

  // 处理标签放置
  const handleDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!draggedTabId || draggedTabId === targetTabId) {
      setDraggedTabId(null)
      setDragOverTabId(null)
      return
    }

    const dragIndex = tabs.findIndex(t => t.id === draggedTabId)
    const hoverIndex = tabs.findIndex(t => t.id === targetTabId)
    
    if (dragIndex !== -1 && hoverIndex !== -1) {
      reorderTabs(dragIndex, hoverIndex)
    }
    
    setDraggedTabId(null)
    setDragOverTabId(null)
  }, [draggedTabId, tabs, reorderTabs])

  // 处理拖拽结束
  const handleDragEnd = useCallback(() => {
    setDraggedTabId(null)
    setDragOverTabId(null)
  }, [])

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
            suppressHydrationWarning
          >
            <Plus className="h-3 w-3" />
            {mounted ? t('node.newDocument') : '新建文档'}
          </Button>
        ) : (
          <div className="flex items-center h-full relative">
            {tabs.map((tab, index) => {
              const width = tabWidths[tab.id] || TAB_CONFIG.normalWidth
              const isActive = tab.id === activeTabId
              const isHovered = tab.id === hoveredTabId
              const isDragged = tab.id === draggedTabId
              const isDragOver = tab.id === dragOverTabId

              return (
                <div
                  key={tab.id}
                  draggable
                  onClick={() => activateTab(tab.id)}
                  onMouseEnter={() => setHoveredTabId(tab.id)}
                  onMouseLeave={() => setHoveredTabId(null)}
                  onDragStart={(e) => handleDragStart(e, tab.id)}
                  onDragOver={(e) => handleDragOver(e, tab.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, tab.id)}
                  onDragEnd={handleDragEnd}
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
                      : isDragOver
                        ? themeConfig.primary + '20'
                        : themeConfig.card,
                    border: `1px solid ${isActive ? themeConfig.border : isDragOver ? themeConfig.primary : themeConfig.border + '80'}`,
                    boxShadow: isActive
                      ? `0 2px 4px #00000020`
                      : isDragOver
                        ? `0 0 0 2px ${themeConfig.primary}40`
                        : 'none',
                    zIndex: isActive ? 10 : isHovered ? 5 : tabs.length - index,
                    opacity: isDragged ? 0.5 : 1,
                    transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
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
                  
                  {/* 模板图标 */}
                  {tab.sourceType === 'git' && (
                    <span
                      className="text-[10px] px-1 rounded mr-1 flex-shrink-0"
                      style={{
                        backgroundColor: themeConfig.success + '20',
                        color: themeConfig.success,
                      }}
                    >
                      Git
                    </span>
                  )}

                  {tab.isTemplate && (
                    <span 
                      className="text-[10px] px-1 rounded mr-1 flex-shrink-0"
                      style={{
                        backgroundColor: themeConfig.primary + '20',
                        color: themeConfig.primary,
                      }}
                    >
                      模板
                    </span>
                  )}

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
                      tabs.length === 1 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    )}
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
                toast({
                  title: mounted ? t('file.closeAllTabs') : '已关闭所有标签页',
                })
              }}
              className="cursor-pointer focus:bg-transparent"
              style={{ color: themeConfig.text }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = themeConfig.hover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
              suppressHydrationWarning
            >
              <X className="mr-2 h-4 w-4" style={{ color: themeConfig.muted }} />
              <span suppressHydrationWarning>{mounted ? t('common.closeAll') : '全部关闭'}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator style={{ backgroundColor: themeConfig.border }} />

            {/* 当前打开的标签页列表 */}
            {tabs.length === 0 ? (
              <div
                className="px-2 py-3 text-sm text-center"
                style={{ color: themeConfig.muted }}
                suppressHydrationWarning
              >
                {mounted ? t('common.noOpenTabs') : '没有打开的标签页'}
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
                  {tab.sourceType === 'git' ? (
                    <GitBranch
                      className="mr-2 h-4 w-4 flex-shrink-0"
                      style={{ color: tab.id === activeTabId ? themeConfig.primary : themeConfig.muted }}
                    />
                  ) : (
                    <FileText
                      className="mr-2 h-4 w-4 flex-shrink-0"
                      style={{ color: tab.id === activeTabId ? themeConfig.primary : themeConfig.muted }}
                    />
                  )}
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

        <div
          className="mx-1 h-4 w-px"
          style={{ backgroundColor: themeConfig.border }}
        />

        <LanguageToggle />
      </div>
    </div>
  )
}

export default EditorToolbar
