/**
 * 文件侧边栏组件 - Obsidian 风格
 *
 * 左侧边栏文件管理系统主组件
 * 模仿 Obsidian 的简洁设计风格
 */

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { FilePlus, FolderPlus, ChevronDown, ChevronRight, ArrowUpDown, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useThemeStore } from '@/stores/themeStore'
import { FolderItem } from './folder-item'
import { FileItem } from './file-item'
import type { DropPosition } from '@/types/file-system'

export function FileSidebar() {
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  
  const {
    folders,
    files,
    currentFileId,
    expandedFolderIds,
    sortedFolders,
    getFilesByFolder,
    createFolder,
    createFile,
    importFile,
    toggleFolder,
    expandAll,
    collapseAll,
    reorderFolders,
    openFile,
  } = useFileSystemStore()

  // 拖拽状态
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<DropPosition | null>(null)
  
  // 避免 Hydration 错误 - 等待客户端挂载完成
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // 获取排序后的文件夹和根目录文件
  const sortedFolderList = sortedFolders()
  const rootFiles = getFilesByFolder(null)

  // 处理创建文件
  const handleCreateFile = () => {
    const name = prompt('请输入文件名：', '未命名.md')
    if (name) {
      createFile(name, null)
    }
  }

  // 处理创建文件夹
  const handleCreateFolder = () => {
    const name = prompt('请输入文件夹名称：', '新建文件夹')
    if (name) {
      createFolder(name)
    }
  }

  // 处理导入文件
  const handleImportFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt'
    input.multiple = true
    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement
      if (!target.files) return

      for (const file of Array.from(target.files)) {
        const content = await file.text()
        importFile(file.name, content, null)
      }
    }
    input.click()
  }

  // 处理文件夹展开/折叠
  const handleToggleFolder = (id: string) => {
    toggleFolder(id)
  }

  // 处理拖拽开始
  const handleDragStart = useCallback((e: React.DragEvent, id: string, type: 'folder' | 'file') => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, type }))
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  // 处理拖拽经过
  const handleDragOver = useCallback((e: React.DragEvent, id: string, type: 'folder' | 'file') => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const position: DropPosition = e.clientY < midY ? 'before' : 'after'

    setDragOverId(id)
    setDragOverPosition(position)
  }, [])

  // 处理放置
  const handleDrop = useCallback((e: React.DragEvent, targetId: string, type: 'folder' | 'file') => {
    e.preventDefault()
    e.stopPropagation()

    const data = e.dataTransfer.getData('text/plain')
    if (!data) {
      setDragOverId(null)
      setDragOverPosition(null)
      return
    }

    try {
      const { id: draggedId, type: draggedType } = JSON.parse(data)

      if (draggedType === 'folder' && type === 'folder' && draggedId !== targetId) {
        reorderFolders(draggedId, targetId, dragOverPosition || 'after')
      }
    } catch {
      // 忽略解析错误
    }

    setDragOverId(null)
    setDragOverPosition(null)
  }, [dragOverPosition, reorderFolders])

  // 判断是否全部展开
  const isAllExpanded = sortedFolderList.length > 0 && 
    sortedFolderList.every(f => expandedFolderIds.has(f.id))

  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ 
        backgroundColor: themeConfig.background,
        color: themeConfig.text,
      }}
    >
      {/* 顶部工具栏 - Obsidian 风格 */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-60">
          文件列表
        </span>
        <div className="flex items-center gap-0.5">
          {/* 新建文件 */}
          <button
            onClick={handleCreateFile}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="新建文件"
          >
            <FilePlus className="w-4 h-4" />
          </button>
          {/* 新建文件夹 */}
          <button
            onClick={handleCreateFolder}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="新建文件夹"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          {/* 排序 */}
          <button
            onClick={handleImportFile}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="导入文件"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
          {/* 展开/折叠 */}
          <button
            onClick={isAllExpanded ? collapseAll : expandAll}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title={isAllExpanded ? '折叠全部' : '展开全部'}
          >
            {isAllExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-y-auto px-1">
        {/* 等待客户端挂载完成后再渲染列表，避免 Hydration 错误 */}
        {mounted && (
          <>
            {/* 文件夹列表 */}
            {sortedFolderList.map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                files={getFilesByFolder(folder.id)}
                isExpanded={expandedFolderIds.has(folder.id)}
                currentFileId={currentFileId}
                onToggle={() => handleToggleFolder(folder.id)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                dragOverId={dragOverId}
                dragOverPosition={dragOverPosition}
              />
            ))}

            {/* 根目录文件 */}
            {rootFiles.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                isActive={file.id === currentFileId}
                isModified={file.isModified}
                onClick={() => openFile(file.id)}
              />
            ))}

            {/* 空状态 */}
            {sortedFolderList.length === 0 && rootFiles.length === 0 && (
              <div className="px-4 py-8 text-center opacity-40">
                <div className="text-sm mb-1">还没有文件</div>
                <div className="text-xs">点击上方按钮创建</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
