'use client'

/**
 * 空白标签页视图
 *
 * 当新建空白标签或关闭所有文件时显示的提示页面
 * 提供快速操作入口：创建新文件、打开文件、关闭标签页
 */

import { FilePlus, FolderOpen, X } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTabsStore } from '@/stores/tabsStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useTranslation } from '@/stores/languageStore'
import { openFile } from '@/lib/file-system'
import { toast } from '@/hooks/use-toast'
import { useState, useEffect } from 'react'

interface EmptyTabViewProps {
  tabId: string
  onOpenSearch?: () => void
}

export function EmptyTabView({ tabId, onOpenSearch }: EmptyTabViewProps) {
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { closeTab, openFileInCurrentTab } = useTabsStore()
  const { t } = useTranslation()

  useEffect(() => {
    setMounted(true)
  }, [])
  const { createFile, files } = useFileSystemStore()

  // 处理创建新文件 - 在当前空白标签页打开新创建的文件
  const handleCreateNewFile = () => {
    // 创建新文件到文件系统
    createFile(t('file.untitled') + '.md', null)
    
    // 获取刚创建的文件（最新的文件）
    const { files: updatedFiles } = useFileSystemStore.getState()
    const newFile = updatedFiles[updatedFiles.length - 1]
    
    if (newFile) {
      // 在当前空白标签页打开新文件
      openFileInCurrentTab(tabId, newFile.name, newFile.content, newFile.id)
    }
  }

  // 处理打开文件 - 调用搜索功能
  const handleOpenFile = () => {
    if (onOpenSearch) {
      onOpenSearch()
    } else {
      // 如果没有提供搜索回调，使用原生文件打开
      handleNativeOpenFile()
    }
  }

  // 原生文件打开（备用方案）
  const handleNativeOpenFile = async () => {
    try {
      const result = await openFile()
      if (result.success && result.content && result.fileName) {
        // 在当前空白标签页打开文件内容
        openFileInCurrentTab(tabId, result.fileName, result.content)
        toast({
          title: t('toast.fileAdded'),
          description: result.fileName,
        })
      }
    } catch (error) {
      console.error('Failed to open file:', error)
      toast({
        title: t('file.openFileFailed'),
        variant: 'destructive',
      })
    }
  }

  // 处理关闭标签页
  const handleCloseTab = () => {
    if (tabId !== 'blank') {
      closeTab(tabId)
    }
  }

  // 使用 useMemo 确保菜单项在语言变化时更新，但避免 hydration 不匹配
  const menuItems = mounted ? [
    {
      icon: FilePlus,
      label: t('sidebar.newFile'),
      shortcut: 'Ctrl + N',
      onClick: handleCreateNewFile,
    },
    {
      icon: FolderOpen,
      label: t('sidebar.openFile'),
      shortcut: 'Ctrl + O',
      onClick: handleOpenFile,
    },
    {
      icon: X,
      label: t('sidebar.closeTab'),
      shortcut: '',
      onClick: handleCloseTab,
    },
  ] : [
    {
      icon: FilePlus,
      label: '创建新文件',
      shortcut: 'Ctrl + N',
      onClick: handleCreateNewFile,
    },
    {
      icon: FolderOpen,
      label: '打开文件',
      shortcut: 'Ctrl + O',
      onClick: handleOpenFile,
    },
    {
      icon: X,
      label: '关闭标签页',
      shortcut: '',
      onClick: handleCloseTab,
    },
  ]

  return (
    <div
      className="flex flex-col items-center justify-center h-full w-full"
      style={{ backgroundColor: themeConfig.background }}
    >
      {/* 中央内容区 */}
      <div className="flex flex-col items-center gap-3">
        {/* 标题 */}
        <h2
          className="text-2xl font-semibold"
          style={{ color: themeConfig.text }}
          suppressHydrationWarning
        >
          {mounted ? t('sidebar.noFileOpen') : '未打开文件'}
        </h2>

        {/* 操作菜单 */}
        <div className="flex flex-col items-center gap-1">
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={item.onClick}
              className="flex items-center gap-1 px-5 py-2.5 rounded-md transition-all duration-200 group"
              style={{
                color: themeConfig.primary,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = themeConfig.primary + '15'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
              suppressHydrationWarning
            >
              <span className="text-base font-medium" suppressHydrationWarning>{item.label}</span>
              {item.shortcut && (
                <span
                  className="text-sm ml-1 opacity-50"
                  style={{ color: themeConfig.muted }}
                >
                  ({item.shortcut})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 底部提示 */}
      <div
        className="absolute bottom-8 text-xs opacity-40"
        style={{ color: themeConfig.muted }}
        suppressHydrationWarning
      >
        {mounted ? t('sidebar.selectFromSidebar') : '从左侧文件面板选择文件，或从上方标签栏新建文档'}
      </div>
    </div>
  )
}

export default EmptyTabView
