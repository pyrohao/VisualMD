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
import { DeleteConfirmDialog } from '../delete-confirm-dialog'
import { PromptDialog } from '../ui/prompt-dialog'
import { toast } from '@/hooks/use-toast'

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showFilePrompt, setShowFilePrompt] = useState(false)
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
    setShowDeleteConfirm(true)
    setShowContextMenu(false)
  }

  // 确认删除
  const handleConfirmDelete = () => {
    deleteFolder(folder.id)
    toast({
      title: '文件夹已删除',
    })
  }

  // 处理新建文件
  const handleCreateFile = () => {
    setShowFilePrompt(true)
    setShowContextMenu(false)
  }

  // 确认创建文件
  const handleConfirmCreateFile = (name: string) => {
    if (name.trim()) {
      createFile(name.trim(), folder.id)
      toast({
        title: '文件创建成功',
      })
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

  // 处理拖拽开始
  const handleDragStart = (e: React.DragEvent) => {
    onDragStart(e, folder.id, 'folder')
  }

  // 处理拖拽经过
  const handleDragOver = (e: React.DragEvent) => {
    onDragOver(e, folder.id, 'folder')
  }

  // 处理放置
  const handleDrop = (e: React.DragEvent) => {
    onDrop(e, folder.id, 'folder')
  }

  // 处理文件夹拖拽放置（将文件拖入文件夹）
  const [isDragOverExternal, setIsDragOverExternal] = useState(false)

  const handleExternalDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // 检查是否是内部拖拽（文件排序）
    const data = e.dataTransfer.getData('text/plain')
    if (data) {
      try {
        const { type } = JSON.parse(data)
        if (type === 'file') {
          setIsDragOverExternal(true)
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  const handleExternalDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOverExternal(false)
  }

  const handleFolderDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOverExternal(false)

    const data = e.dataTransfer.getData('text/plain')
    if (!data) return

    try {
      const { id: draggedId, type } = JSON.parse(data)
      if (type === 'file') {
        moveFileToFolder(draggedId, folder.id)
      }
    } catch {
      // 忽略解析错误
    }
  }

  // 处理外部文件拖拽导入
  const handleExternalDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOverExternal(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt')) {
          const content = await file.text()
          importFile(file.name, content, folder.id)
        }
      }
    }
  }

  // 判断是否显示拖拽指示线
  const showDragLineBefore = dragOverId === folder.id && dragOverPosition === 'before'
  const showDragLineAfter = dragOverId === folder.id && dragOverPosition === 'after'

  return (
    <div>
      {/* 拖拽指示线 - 上方 */}
      {showDragLineBefore && (
        <div className="h-0.5 bg-blue-500 rounded-full my-0.5" />
      )}

      {/* 文件夹头部 */}
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={onToggle}
        onContextMenu={handleContextMenu}
        className={cn(
          'group flex items-center gap-2 px-2 py-1 rounded cursor-pointer',
          'transition-colors duration-150',
          'hover:bg-white/5'
        )}
        style={{ color: themeConfig.text }}
      >
        {/* 展开/折叠图标 */}
        <ChevronRight 
          className={cn(
            'w-4 h-4 shrink-0 transition-transform duration-150',
            isExpanded && 'rotate-90'
          )} 
        />

        {/* 文件夹图标 */}
        {isExpanded ? (
          <FolderOpen className="w-4 h-4 shrink-0 opacity-80" />
        ) : (
          <Folder className="w-4 h-4 shrink-0 opacity-60" />
        )}

        {/* 文件夹名 */}
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
            onClick={(e) => e.stopPropagation()}
            className="flex-1 px-1 py-0 text-sm bg-transparent border border-blue-500/50 rounded outline-none"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-sm truncate">
            {folder.name}
          </span>
        )}

        {/* 文件数量 */}
        <span className="text-xs opacity-40">
          {files.length}
        </span>
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
            onClick={() => {
              setIsEditing(true)
              setShowContextMenu(false)
            }}
            className="w-full px-4 py-1.5 text-left text-sm hover:bg-white/10 transition-colors"
          >
            重命名
          </button>
          <button
            onClick={() => {
              handleCreateFile()
            }}
            className="w-full px-4 py-1.5 text-left text-sm hover:bg-white/10 transition-colors"
          >
            新建文件
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

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        itemName={folder.name}
        title="删除文件夹"
        description={`确定要删除文件夹 "${folder.name}" 吗？文件夹内的所有文件也将被删除。`}
        onConfirm={handleConfirmDelete}
      />

      {/* 新建文件对话框 */}
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
    </div>
  )
}
