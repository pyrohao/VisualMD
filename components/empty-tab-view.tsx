'use client'

/**
 * 空白标签页视图
 *
 * 当新建空白标签或关闭所有文件时显示的提示页面
 * 提供快速操作入口：创建新文件、打开文件、关闭标签页
 */

import { FilePlus, FolderOpen, X } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useTabsStore } from '@/stores/tabsStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { openFile } from '@/lib/file-system'
import { toast } from '@/hooks/use-toast'

interface EmptyTabViewProps {
  tabId: string
  onOpenSearch?: () => void
}

export function EmptyTabView({ tabId, onOpenSearch }: EmptyTabViewProps) {
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  const { closeTab, openFileInTab } = useTabsStore()
  const { createFile, openFile: openFileInPanel } = useFileSystemStore()

  // 处理创建新文件 - 在文件面板创建新的未命名文件
  const handleCreateNewFile = () => {
    // 创建新文件到文件系统
    createFile('未命名文档.md', null)
    toast({
      title: '已创建新文件',
      description: '请在左侧文件面板查看',
    })
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
        // 在当前标签页打开文件内容
        openFileInTab(result.fileName, result.content)
        toast({
          title: '文件已打开',
          description: result.fileName,
        })
      }
    } catch (error) {
      console.error('Failed to open file:', error)
      toast({
        title: '打开文件失败',
        variant: 'destructive',
      })
    }
  }

  // 处理关闭标签页
  const handleCloseTab = () => {
    closeTab(tabId)
  }

  const menuItems = [
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
        >
          未打开文件
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
            >
              <span className="text-base font-medium">{item.label}</span>
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
      >
        从左侧文件面板选择文件，或从上方标签栏新建文档
      </div>
    </div>
  )
}

export default EmptyTabView
