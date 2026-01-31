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
import { PromptDialog } from '../ui/prompt-dialog'
import { toast } from '@/hooks/use-toast'

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

  // 客户端挂载状态，用于避免 hydration 不匹配
  const [mounted, setMounted] = useState(false)

  // 根目录拖放状态
  const [isRootDragOver, setIsRootDragOver] = useState(false)

  // 排序状态
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'updatedAt' | 'createdAt'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Prompt 对话框状态
  const [showFilePrompt, setShowFilePrompt] = useState(false)
  const [showFolderPrompt, setShowFolderPrompt] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // 点击外部关闭排序菜单
  useEffect(() => {
    if (!showSortMenu) return
    
    const handleClickOutside = () => {
      setShowSortMenu(false)
    }
    
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showSortMenu])
  
  // 处理排序
  const handleSort = (by: 'name' | 'updatedAt' | 'createdAt', order: 'asc' | 'desc') => {
    setSortBy(by)
    setSortOrder(order)
    setShowSortMenu(false)
  }
  
  // 排序函数
  const sortItems = <T extends { name: string; updatedAt: number; createdAt: number }>(items: T[]): T[] => {
    return [...items].sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'zh-CN')
          break
        case 'updatedAt':
          comparison = a.updatedAt - b.updatedAt
          break
        case 'createdAt':
          comparison = a.createdAt - b.createdAt
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }

  // 获取排序后的文件夹和根目录文件
  const sortedFolderList = sortedFolders()
  const rootFiles = getFilesByFolder(null)

  // 处理创建文件
  const handleCreateFile = () => {
    setShowFilePrompt(true)
  }

  // 确认创建文件
  const handleConfirmCreateFile = (name: string) => {
    if (name.trim()) {
      createFile(name.trim(), null)
      toast({
        title: '文件创建成功',
      })
    }
  }

  // 处理创建文件夹
  const handleCreateFolder = () => {
    setShowFolderPrompt(true)
  }

  // 确认创建文件夹
  const handleConfirmCreateFolder = (name: string) => {
    if (name.trim()) {
      createFolder(name.trim())
      toast({
        title: '文件夹创建成功',
      })
    }
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

  // 处理放置（内部拖拽排序）
  const handleDrop = useCallback((e: React.DragEvent, targetId: string, type: 'folder' | 'file') => {
    e.preventDefault()
    e.stopPropagation()

    const data = e.dataTransfer.getData('text/plain')
    if (!data) {
      // 没有内部拖拽数据，可能是外部文件拖拽，不处理
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
  
  // 处理根目录外部文件拖拽
  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsRootDragOver(true)
    }
  }, [])
  
  const handleRootDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsRootDragOver(false)
  }, [])
  
  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsRootDragOver(false)
    
    // 处理外部文件拖拽到根目录
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt')) {
          const content = await file.text()
          importFile(file.name, content, null)
        }
      }
    }
  }

  // 判断是否全部展开
  const isAllExpanded = sortedFolderList.length > 0 && 
    sortedFolderList.every(f => expandedFolderIds.has(f.id))

  return (
    <div
      className={cn(
        "w-full h-full flex flex-col",
        isRootDragOver && "bg-blue-500/10"
      )}
      style={{ 
        backgroundColor: isRootDragOver ? undefined : themeConfig.background,
        color: themeConfig.text,
      }}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
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
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowSortMenu(!showSortMenu)
              }}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              title="排序"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
            {/* 排序下拉菜单 */}
            {showSortMenu && (
              <div 
                className="absolute right-0 top-full mt-1 py-1 rounded-lg shadow-lg border min-w-[180px] z-50"
                onClick={(e) => e.stopPropagation()}
                style={{ 
                  backgroundColor: themeConfig.card,
                  borderColor: themeConfig.border,
                }}
              >
                {/* 文件名排序 */}
                <button
                  onClick={() => handleSort('name', 'asc')}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-white/5 flex items-center justify-between",
                    sortBy === 'name' && sortOrder === 'asc' && "text-blue-400"
                  )}
                  style={{ color: sortBy === 'name' && sortOrder === 'asc' ? undefined : themeConfig.text }}
                >
                  文件名 (A-Z)
                  {sortBy === 'name' && sortOrder === 'asc' && <ChevronDown className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleSort('name', 'desc')}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-white/5 flex items-center justify-between",
                    sortBy === 'name' && sortOrder === 'desc' && "text-blue-400"
                  )}
                  style={{ color: sortBy === 'name' && sortOrder === 'desc' ? undefined : themeConfig.text }}
                >
                  文件名 (Z-A)
                  {sortBy === 'name' && sortOrder === 'desc' && <ChevronDown className="w-4 h-4" />}
                </button>
                
                {/* 分隔线 */}
                <div className="my-1 border-t" style={{ borderColor: themeConfig.border }} />
                
                {/* 编辑时间排序 */}
                <button
                  onClick={() => handleSort('updatedAt', 'desc')}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-white/5 flex items-center justify-between",
                    sortBy === 'updatedAt' && sortOrder === 'desc' && "text-blue-400"
                  )}
                  style={{ color: sortBy === 'updatedAt' && sortOrder === 'desc' ? undefined : themeConfig.text }}
                >
                  编辑时间 (从新到旧)
                  {sortBy === 'updatedAt' && sortOrder === 'desc' && <ChevronDown className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleSort('updatedAt', 'asc')}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-white/5 flex items-center justify-between",
                    sortBy === 'updatedAt' && sortOrder === 'asc' && "text-blue-400"
                  )}
                  style={{ color: sortBy === 'updatedAt' && sortOrder === 'asc' ? undefined : themeConfig.text }}
                >
                  编辑时间 (从旧到新)
                  {sortBy === 'updatedAt' && sortOrder === 'asc' && <ChevronDown className="w-4 h-4" />}
                </button>
                
                {/* 分隔线 */}
                <div className="my-1 border-t" style={{ borderColor: themeConfig.border }} />
                
                {/* 创建时间排序 */}
                <button
                  onClick={() => handleSort('createdAt', 'desc')}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-white/5 flex items-center justify-between",
                    sortBy === 'createdAt' && sortOrder === 'desc' && "text-blue-400"
                  )}
                  style={{ color: sortBy === 'createdAt' && sortOrder === 'desc' ? undefined : themeConfig.text }}
                >
                  创建时间 (从新到旧)
                  {sortBy === 'createdAt' && sortOrder === 'desc' && <ChevronDown className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleSort('createdAt', 'asc')}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-white/5 flex items-center justify-between",
                    sortBy === 'createdAt' && sortOrder === 'asc' && "text-blue-400"
                  )}
                  style={{ color: sortBy === 'createdAt' && sortOrder === 'asc' ? undefined : themeConfig.text }}
                >
                  创建时间 (从旧到新)
                  {sortBy === 'createdAt' && sortOrder === 'asc' && <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
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
        {/* 等待客户端挂载完成后再渲染，避免 hydration 不匹配 */}
        {(() => { console.log('渲染文件列表 - mounted:', mounted, 'folders:', sortedFolderList.length, 'rootFiles:', rootFiles.length); return null; })()}
        {mounted && (
          <>
            {/* 文件夹列表 */}
            {sortItems(sortedFolderList).map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                files={sortItems(getFilesByFolder(folder.id))}
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
            {sortItems(rootFiles).map((file) => (
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

      {/* 创建文件对话框 */}
      <PromptDialog
        isOpen={showFilePrompt}
        onClose={() => setShowFilePrompt(false)}
        onConfirm={handleConfirmCreateFile}
        title="新建文件"
        description="请输入文件名："
        defaultValue="未命名.md"
        confirmText="创建"
        cancelText="取消"
        placeholder="文件名"
      />

      {/* 创建文件夹对话框 */}
      <PromptDialog
        isOpen={showFolderPrompt}
        onClose={() => setShowFolderPrompt(false)}
        onConfirm={handleConfirmCreateFolder}
        title="新建文件夹"
        description="请输入文件夹名称："
        defaultValue="新建文件夹"
        confirmText="创建"
        cancelText="取消"
        placeholder="文件夹名称"
      />
    </div>
  )
}
