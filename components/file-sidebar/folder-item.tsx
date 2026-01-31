/**
 * 文件夹项组件 - Obsidian 风格
 *
 * 简洁的文件夹展示，支持展开/折叠和文件列表
 */

'use client'

import { useState, useRef } from 'react'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useThemeStore } from '@/stores/themeStore'
import type { Folder as FolderType, MarkdownFile } from '@/types/file-system'
import { FileItem } from './file-item'

interface FolderItemProps {
  folder: FolderType
  files: MarkdownFile[]
  isExpanded: boolean
  currentFileId: string | null
  onToggle: () => void
  onDragStart: (e: React.DragEvent, id: string, type: 'folder') => void
  onDragOver: (e: React.DragEvent, id: string, type: 'folder') => void
  onDrop: (e: React.DragEvent, id: string, type: 'folder') => void
  dragOverId: string | null
  dragOverPosition: 'before' | 'after' | null
}

export function FolderItem({
  folder,
  files,
  isExpanded,
  currentFileId,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  dragOverId,
  dragOverPosition,
}: FolderItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(folder.name)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  
  const { renameFolder, deleteFolder, createFile, moveFileToFolder, openFile, importFile } = useFileSystemStore()

  // 处理重命名
  const handleRename = () => {
    if (editName.trim() && editName !== folder.name) {
      renameFolder(folder.id, editName)
    }
    setIsEditing(false)
  }

  // 处理删除
  const handleDelete = () => {
    if (confirm(`确定要删除文件夹 "${folder.name}" 吗？\n文件夹内的所有文件也将被删除。`)) {
      deleteFolder(folder.id)
    }
  }

  // 处理新建文件
  const handleCreateFile = () => {
    const name = prompt('请输入文件名：', '未命名.md')
    if (name) {
      createFile(name, folder.id)
    }
  }

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setShowContextMenu(true)
    // 点击其他地方关闭菜单
    const closeMenu = () => {
      setShowContextMenu(false)
      document.removeEventListener('click', closeMenu)
    }
    document.addEventListener('click', closeMenu)
  }

  // 处理文件拖放到文件夹（内部拖拽 + 外部文件拖拽）
  const handleFolderDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOverExternal(false)

    // 1. 处理外部文件拖拽（从操作系统拖拽文件）
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.stopPropagation() // 只有实际处理文件时才阻止冒泡
      for (const file of Array.from(e.dataTransfer.files)) {
        if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt')) {
          const content = await file.text()
          importFile(file.name, content, folder.id)
        }
      }
      return
    }

    // 2. 处理内部拖拽（从其他文件夹移动文件）
    const data = e.dataTransfer.getData('text/plain')
    if (!data) return

    e.stopPropagation() // 处理内部拖拽时阻止冒泡
    try {
      const { id, type } = JSON.parse(data)
      if (type === 'file') {
        moveFileToFolder(id, folder.id)
      }
    } catch {
      // 忽略解析错误
    }
  }

  // 处理外部文件拖拽经过（显示视觉反馈）
  const [isDragOverExternal, setIsDragOverExternal] = useState(false)
  
  const handleExternalDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    // 检查是否有外部文件
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOverExternal(true)
    }
  }

  const handleExternalDragLeave = (e: React.DragEvent) => {
    setIsDragOverExternal(false)
  }

  const isDragOver = dragOverId === folder.id
  const showDragLineBefore = isDragOver && dragOverPosition === 'before'
  const showDragLineAfter = isDragOver && dragOverPosition === 'after'

  return (
    <div className="select-none">
      {/* 拖拽指示线 - 上方 */}
      {showDragLineBefore && (
        <div className="h-0.5 bg-blue-500 rounded-full my-0.5" />
      )}
      
      {/* 文件夹头部 - 支持外部文件拖拽 */}
      <div
        draggable
        onDragStart={(e) => onDragStart(e, folder.id, 'folder')}
        onDragOver={(e) => {
          onDragOver(e, folder.id, 'folder')
          handleExternalDragOver(e)
        }}
        onDragLeave={handleExternalDragLeave}
        onDrop={(e) => {
          onDrop(e, folder.id, 'folder')
          handleFolderDrop(e)
        }}
        onContextMenu={handleContextMenu}
        className={cn(
          'group flex items-center gap-1 px-2 py-1 rounded cursor-pointer',
          'hover:bg-white/5 transition-colors',
          isDragOverExternal && 'bg-blue-500/20 ring-1 ring-blue-500/50'
        )}
        style={{ color: themeConfig.text }}
        title={isDragOverExternal ? '释放以导入文件到文件夹' : ''}
      >
        {/* 展开/折叠箭头 */}
        <div
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className="p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
        >
          <ChevronRight 
            className={cn(
              'w-4 h-4 transition-transform duration-150',
              isExpanded && 'rotate-90'
            )} 
          />
        </div>

        {/* 文件夹图标 */}
        <span className="text-yellow-500/80">
          {isExpanded ? (
            <FolderOpen className="w-4 h-4" />
          ) : (
            <Folder className="w-4 h-4" />
          )}
        </span>

        {/* 文件夹名称 */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') {
                setEditName(folder.name)
                setIsEditing(false)
              }
            }}
            className="flex-1 px-1 py-0 text-sm bg-transparent border border-blue-500/50 rounded outline-none"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="flex-1 text-sm truncate"
            onDoubleClick={() => setIsEditing(true)}
          >
            {folder.name}
          </span>
        )}

        {/* 文件数量 */}
        {files.length > 0 && !isEditing && (
          <span className="text-xs opacity-40">
            {files.length}
          </span>
        )}
      </div>

      {/* 右键菜单 */}
      {showContextMenu && (
        <div 
          className="fixed z-50 py-1 rounded-md shadow-lg border"
          style={{ 
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
          }}
        >
          <button
            onClick={handleCreateFile}
            className="w-full px-4 py-1.5 text-left text-sm hover:bg-white/10 transition-colors"
          >
            新建文件
          </button>
          <button
            onClick={() => {
              setIsEditing(true)
              setShowContextMenu(false)
            }}
            className="w-full px-4 py-1.5 text-left text-sm hover:bg-white/10 transition-colors"
          >
            重命名
          </button>
          <div className="my-1 border-t" style={{ borderColor: themeConfig.border }} />
          <button
            onClick={handleDelete}
            className="w-full px-4 py-1.5 text-left text-sm text-red-400 hover:bg-white/10 transition-colors"
          >
            删除
          </button>
        </div>
      )}

      {/* 文件列表 - 也支持外部文件拖拽 */}
      {isExpanded && (
        <div 
          className={cn(
            "ml-4 border-l",
            isDragOverExternal && "bg-blue-500/10"
          )}
          style={{ borderColor: themeConfig.border }}
          onDragOver={handleExternalDragOver}
          onDragLeave={handleExternalDragLeave}
          onDrop={handleFolderDrop}
        >
          {files.length === 0 ? (
            <div className="px-4 py-2 text-xs opacity-30 italic">
              {isDragOverExternal ? '释放以导入文件' : '空文件夹'}
            </div>
          ) : (
            files.map((file) => (
              <FileItem
                key={file.id}
                file={file}
                isActive={file.id === currentFileId}
                isModified={file.isModified}
                onClick={() => openFile(file.id)}
              />
            ))
          )}
        </div>
      )}

      {/* 拖拽指示线 - 下方 */}
      {showDragLineAfter && (
        <div className="h-0.5 bg-blue-500 rounded-full my-0.5" />
      )}
    </div>
  )
}
