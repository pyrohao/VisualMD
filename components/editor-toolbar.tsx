'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  GitBranch,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useTabsStore } from '@/stores/tabsStore'
import { Button } from './ui/button'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { requestNavigationWithUnsavedGuard } from '@/stores/unsavedChangesStore'
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
  onSearch?: () => void
  onToggleAiDock?: () => void
  aiDockOpen?: boolean
}

const TAB_CONFIG = {
  maxWidth: 200,
  minWidth: 40,
  normalWidth: 140,
  overlap: 4,
  reserveWidth: 84,
}

const TAB_ACTIONS_TRIGGER_ID = 'editor-toolbar-tab-actions-trigger'

export function EditorToolbar({
  onSearch,
  onToggleAiDock,
  aiDockOpen = false,
}: EditorToolbarProps) {
  const { importFile } = useFileSystemStore()
  const { getThemeConfig } = useThemeStore()
  const { isPanelExpanded, togglePanel } = useSidebarStore()
  const {
    tabs,
    activeTabId,
    activateTab,
    closeTab,
    createTab,
    openFileInTab,
    getActiveTab,
    closeAllTabs,
    reorderTabs,
  } = useTabsStore()
  const { t } = useTranslation()

  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const activeTab = getActiveTab()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const container = tabsContainerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setContainerWidth(entry.contentRect.width)
      }
    })

    resizeObserver.observe(container)
    setContainerWidth(container.clientWidth)

    return () => resizeObserver.disconnect()
  }, [])

  const tabWidths = useMemo(() => {
    if (tabs.length === 0) return {}

    const availableWidth = Math.max(0, containerWidth - TAB_CONFIG.reserveWidth)
    const idealWidth = Math.min(
      TAB_CONFIG.normalWidth,
      Math.max(
        TAB_CONFIG.minWidth,
        (availableWidth - (tabs.length - 1) * TAB_CONFIG.overlap) / tabs.length
      )
    )

    const widths: Record<string, number> = {}

    tabs.forEach((tab) => {
      const isActive = tab.id === activeTabId
      const isHovered = tab.id === hoveredTabId

      if (isActive) {
        widths[tab.id] = Math.min(TAB_CONFIG.maxWidth, Math.max(idealWidth, TAB_CONFIG.normalWidth))
        return
      }

      if (isHovered) {
        widths[tab.id] = Math.min(TAB_CONFIG.maxWidth, idealWidth * 1.2)
        return
      }

      widths[tab.id] = idealWidth
    })

    return widths
  }, [activeTabId, containerWidth, hoveredTabId, tabs])

  const interactiveIconProps = useCallback(
    (active = false) => ({
      style: { color: active ? themeConfig.primary : themeConfig.muted },
      onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
        event.currentTarget.style.color = themeConfig.text
        event.currentTarget.style.backgroundColor = themeConfig.hover
      },
      onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
        event.currentTarget.style.color = active ? themeConfig.primary : themeConfig.muted
        event.currentTarget.style.backgroundColor = 'transparent'
      },
    }),
    [themeConfig]
  )

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

  const handleExport = useCallback(async () => {
    if (!activeTab) return

    setIsLoading(true)
    try {
      const { getCurrentMarkdown } = useDocumentStore.getState()
      const latestContent = getCurrentMarkdown()

      if (exportAsMarkdown(latestContent, activeTab.fileName)) {
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

  const handleNewTab = useCallback(() => {
    void requestNavigationWithUnsavedGuard(
      () => {
        createTab(undefined, undefined, true)
      },
      mounted ? t('node.newDocument') : 'New document'
    )
  }, [createTab, mounted, t])

  const handleTabActivate = useCallback(
    (tabId: string, fileName: string) => {
      if (tabId === activeTabId) return
      void requestNavigationWithUnsavedGuard(() => activateTab(tabId), fileName)
    },
    [activateTab, activeTabId]
  )

  const handleTabClose = useCallback(
    (tabId: string) => {
      if (tabId !== activeTabId) {
        closeTab(tabId)
        return
      }

      void requestNavigationWithUnsavedGuard(() => closeTab(tabId), getActiveTab()?.fileName || null)
    },
    [activeTabId, closeTab, getActiveTab]
  )

  const handleCloseAllTabs = useCallback(() => {
    void requestNavigationWithUnsavedGuard(() => {
      closeAllTabs()
      toast({
        title: mounted ? t('file.closeAllTabs') : 'All tabs closed',
      })
    }, mounted ? t('common.closeAll') : 'Close all')
  }, [closeAllTabs, mounted, t])

  const handleDragStart = useCallback(
    (event: React.DragEvent, tabId: string) => {
      setDraggedTabId(tabId)
      event.dataTransfer.effectAllowed = 'move'

      const dragImage = document.createElement('div')
      dragImage.style.cssText = [
        'position: fixed',
        'top: -1000px',
        'padding: 4px 12px',
        `background: ${themeConfig.card}`,
        `border: 1px solid ${themeConfig.border}`,
        'border-radius: 6px',
        `color: ${themeConfig.text}`,
        'font-size: 12px',
        'pointer-events: none',
        'z-index: 9999',
      ].join(';')
      dragImage.textContent = tabs.find((tab) => tab.id === tabId)?.fileName || ''
      document.body.appendChild(dragImage)
      event.dataTransfer.setDragImage(dragImage, 0, 0)
      setTimeout(() => document.body.removeChild(dragImage), 0)
    },
    [tabs, themeConfig]
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent, tabId: string) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      if (tabId !== draggedTabId) {
        setDragOverTabId(tabId)
      }
    },
    [draggedTabId]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent, targetTabId: string) => {
      event.preventDefault()
      event.stopPropagation()

      if (!draggedTabId || draggedTabId === targetTabId) {
        setDraggedTabId(null)
        setDragOverTabId(null)
        return
      }

      const dragIndex = tabs.findIndex((tab) => tab.id === draggedTabId)
      const hoverIndex = tabs.findIndex((tab) => tab.id === targetTabId)

      if (dragIndex !== -1 && hoverIndex !== -1) {
        reorderTabs(dragIndex, hoverIndex)
      }

      setDraggedTabId(null)
      setDragOverTabId(null)
    },
    [draggedTabId, reorderTabs, tabs]
  )

  const handleDragEnd = useCallback(() => {
    setDraggedTabId(null)
    setDragOverTabId(null)
  }, [])

  return (
    <div
      className="flex h-11 items-center border-b px-2 shadow-sm"
      style={{
        backgroundColor: themeConfig.card,
        borderColor: themeConfig.border,
      }}
    >
      <div className="flex flex-shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePanel}
          className="h-8 w-8 transition-colors"
          {...interactiveIconProps()}
        >
          {isPanelExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        <div className="mx-1 h-4 w-px" style={{ backgroundColor: themeConfig.border }} />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            void requestNavigationWithUnsavedGuard(
              handleOpen,
              mounted ? t('sidebar.openFile') : 'Open file'
            )
          }}
          disabled={isLoading}
          className="h-8 w-8 transition-colors"
          {...interactiveIconProps()}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleExport}
          disabled={isLoading || !mounted || !activeTab}
          className="h-8 w-8 transition-colors"
          {...interactiveIconProps()}
        >
          <Download className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onSearch}
          className="h-8 w-8 transition-colors"
          {...interactiveIconProps()}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <div className="mx-2 flex min-w-0 flex-1 items-center">
        <div
          ref={tabsContainerRef}
          className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden"
        >
          {tabs.length === 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewTab}
              className="h-7 gap-1 text-xs transition-colors"
              {...interactiveIconProps()}
              suppressHydrationWarning
            >
              <Plus className="h-3 w-3" />
              {mounted ? t('node.newDocument') : 'New document'}
            </Button>
          ) : (
            <div className="relative flex h-full items-center">
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
                    onClick={() => handleTabActivate(tab.id, tab.fileName)}
                    onMouseEnter={() => setHoveredTabId(tab.id)}
                    onMouseLeave={() => setHoveredTabId(null)}
                    onDragStart={(event) => handleDragStart(event, tab.id)}
                    onDragOver={(event) => handleDragOver(event, tab.id)}
                    onDragLeave={() => setDragOverTabId(null)}
                    onDrop={(event) => handleDrop(event, tab.id)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      'group relative flex h-7 cursor-pointer select-none items-center rounded-md transition-all duration-200 ease-out',
                      isActive && 'z-10'
                    )}
                    style={{
                      width: `${width}px`,
                      marginLeft: index > 0 ? `-${TAB_CONFIG.overlap}px` : '0',
                      backgroundColor: isActive
                        ? themeConfig.background
                        : isDragOver
                          ? `${themeConfig.primary}20`
                          : themeConfig.card,
                      border: `1px solid ${
                        isActive
                          ? themeConfig.border
                          : isDragOver
                            ? themeConfig.primary
                            : `${themeConfig.border}80`
                      }`,
                      boxShadow: isActive
                        ? '0 2px 4px #00000020'
                        : isDragOver
                          ? `0 0 0 2px ${themeConfig.primary}40`
                          : 'none',
                      zIndex: isActive ? 10 : isHovered ? 5 : tabs.length - index,
                      opacity: isDragged ? 0.5 : 1,
                      transform: isDragOver ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    <div
                      className="absolute bottom-0 left-0 top-0 w-0.5 rounded-l-md"
                      style={{
                        backgroundColor: isActive ? themeConfig.primary : 'transparent',
                      }}
                    />

                    {tab.sourceType === 'git' && (
                      <span
                        className="mr-1 flex-shrink-0 rounded px-1 text-[10px]"
                        style={{
                          backgroundColor: `${themeConfig.success}20`,
                          color: themeConfig.success,
                        }}
                      >
                        Git
                      </span>
                    )}

                    {tab.isTemplate && (
                      <span
                        className="mr-1 flex-shrink-0 rounded px-1 text-[10px]"
                        style={{
                          backgroundColor: `${themeConfig.primary}20`,
                          color: themeConfig.primary,
                        }}
                      >
                        Template
                      </span>
                    )}

                    <span
                      className="flex-1 truncate px-2 text-xs"
                      style={{
                        color: isActive ? themeConfig.text : themeConfig.muted,
                        fontWeight: isActive ? 500 : 400,
                      }}
                    >
                      {tab.fileName}
                    </span>

                    {tab.isModified && (
                      <span
                        className="mr-1 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: themeConfig.primary }}
                      />
                    )}

                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        handleTabClose(tab.id)
                      }}
                      className={cn(
                        'mr-1 flex-shrink-0 rounded p-0.5 transition-all duration-150',
                        tabs.length === 1 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      )}
                      style={{ color: themeConfig.muted }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.color = themeConfig.text
                        event.currentTarget.style.backgroundColor = themeConfig.hover
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.color = themeConfig.muted
                        event.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}

              <Button
                variant="ghost"
                size="icon"
                onClick={handleNewTab}
                className="ml-1 h-7 w-7 flex-shrink-0 transition-colors"
                {...interactiveIconProps()}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    id={TAB_ACTIONS_TRIGGER_ID}
                    className="h-7 w-7 flex-shrink-0 transition-colors"
                    {...interactiveIconProps()}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-[70vh] w-56 overflow-y-auto"
                  onCloseAutoFocus={() => {
                    window.setTimeout(() => {
                      document.getElementById(TAB_ACTIONS_TRIGGER_ID)?.blur()
                    }, 0)
                  }}
                  style={{
                    backgroundColor: themeConfig.card,
                    borderColor: themeConfig.border,
                  }}
                >
                  <DropdownMenuItem
                    onClick={handleCloseAllTabs}
                    className="cursor-pointer focus:bg-transparent"
                    style={{ color: themeConfig.text }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.backgroundColor = themeConfig.hover
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.backgroundColor = 'transparent'
                    }}
                    suppressHydrationWarning
                  >
                    <X className="mr-2 h-4 w-4" style={{ color: themeConfig.muted }} />
                    <span suppressHydrationWarning>{mounted ? t('common.closeAll') : 'Close all'}</span>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator style={{ backgroundColor: themeConfig.border }} />

                  {tabs.length === 0 ? (
                    <div
                      className="px-2 py-3 text-center text-sm"
                      style={{ color: themeConfig.muted }}
                      suppressHydrationWarning
                    >
                      {mounted ? t('common.noOpenTabs') : 'No open tabs'}
                    </div>
                  ) : (
                    tabs.map((tab) => (
                      <DropdownMenuItem
                        key={tab.id}
                        onClick={() => handleTabActivate(tab.id, tab.fileName)}
                        className="cursor-pointer"
                        style={{
                          color: tab.id === activeTabId ? themeConfig.primary : themeConfig.text,
                          backgroundColor: tab.id === activeTabId ? `${themeConfig.primary}15` : 'transparent',
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
                          <span className="ml-1" style={{ color: themeConfig.primary }}>
                            鈥?
                          </span>
                        )}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <div className="hidden">
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 transition-colors"
              {...interactiveIconProps()}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-[70vh] w-56 overflow-y-auto"
            style={{
              backgroundColor: themeConfig.card,
              borderColor: themeConfig.border,
            }}
          >
            <DropdownMenuItem
              onClick={handleCloseAllTabs}
              className="cursor-pointer focus:bg-transparent"
              style={{ color: themeConfig.text }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = themeConfig.hover
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'transparent'
              }}
              suppressHydrationWarning
            >
              <X className="mr-2 h-4 w-4" style={{ color: themeConfig.muted }} />
              <span suppressHydrationWarning>{mounted ? t('common.closeAll') : 'Close all'}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator style={{ backgroundColor: themeConfig.border }} />

            {tabs.length === 0 ? (
              <div
                className="px-2 py-3 text-center text-sm"
                style={{ color: themeConfig.muted }}
                suppressHydrationWarning
              >
                {mounted ? t('common.noOpenTabs') : 'No open tabs'}
              </div>
            ) : (
              tabs.map((tab) => (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => handleTabActivate(tab.id, tab.fileName)}
                  className="cursor-pointer"
                  style={{
                    color: tab.id === activeTabId ? themeConfig.primary : themeConfig.text,
                    backgroundColor: tab.id === activeTabId ? `${themeConfig.primary}15` : 'transparent',
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
                    <span className="ml-1" style={{ color: themeConfig.primary }}>
                      •
                    </span>
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mx-1 h-4 w-px" style={{ backgroundColor: themeConfig.border }} />
        <Button
          variant="ghost"
          onClick={onToggleAiDock}
          className="h-8 gap-1.5 px-2.5 transition-colors"
          {...interactiveIconProps(aiDockOpen)}
          title={mounted ? t('sidebar.ai') : 'AI'}
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium leading-none">AI</span>
        </Button>

        <ThemeToggle />
        <div className="mx-1 h-4 w-px" style={{ backgroundColor: themeConfig.border }} />
        <LanguageToggle />
      </div>
    </div>
  )
}

export default EditorToolbar
