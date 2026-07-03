/**
 * 文件项组件 - Obsidian 风格
 *
 * 简洁的文件展示，点击加载可视化组件
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useGitStore } from '@/stores/gitStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import type { MarkdownFile } from '@/types/file-system'
import { DeleteConfirmDialog } from '../delete-confirm-dialog'
import { PromptDialog } from '../ui/prompt-dialog'
import { toast } from '@/hooks/use-toast'

interface FileItemProps {
  file: MarkdownFile
  isActive: boolean
  isModified: boolean
  onClick?: () => void
}

export function FileItem({ file, isActive, isModified, onClick }: FileItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(file.name)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showStagePrompt, setShowStagePrompt] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { t } = useTranslation()
  const { connected: gitConnected, stageLocalFile } = useGitStore()

  useEffect(() => {
    setMounted(true)
  }, [])
  
  const { renameFile, deleteFile, exportFile } = useFileSystemStore()

  // 处理点击
  const handleClick = () => {
    if (!isEditing && onClick) {
      onClick()
    }
  }

  // 处理重命名
  const handleRename = () => {
    if (editName.trim() && editName !== file.name) {
      renameFile(file.id, editName)
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
    deleteFile(file.id)
    toast({
      title: t('toast.fileDeleted'),
    })
  }

  // 处理导出
  const handleExport = async () => {
    await exportFile(file.id)
    toast({
      title: t('file.exportSuccess'),
    })
  }

  const handleStageToGit = (repoPath: string) => {
    if (!gitConnected) {
      toast({
        title: t('git.connectFirst'),
        variant: 'destructive',
      })
      return
    }

    const nextPath = repoPath.trim() || file.name
    stageLocalFile(file.id, nextPath)
    toast({
      title: t('git.stagedToGit'),
      description: nextPath,
    })
  }

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
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
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: file.id, type: 'file' }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'group flex items-center gap-2 px-2 py-1 rounded cursor-pointer',
          'transition-colors duration-150',
          isActive
            ? 'bg-white/10'
            : 'hover:bg-white/5'
        )}
        style={{ 
          color: isActive ? themeConfig.accent : themeConfig.text,
        }}
      >
        {/* 文件图标 */}
        <FileText className={cn(
          'w-4 h-4 shrink-0',
          isActive ? 'opacity-100' : 'opacity-60'
        )} />

        {/* 文件名 */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') {
                setEditName(file.name)
                setIsEditing(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 px-1 py-0 text-sm bg-transparent border border-blue-500/50 rounded outline-none"
            autoFocus
          />
        ) : (
          <span className={cn(
            'flex-1 text-sm truncate',
            isActive && 'font-medium'
          )}>
            {file.name}
          </span>
        )}

        {/* 未保存标记 */}
        {isModified && !isEditing && (
          <span 
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: themeConfig.accent }}
            title={t('file.unsavedChanges')}
          />
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
            onClick={() => {
              setIsEditing(true)
              setShowContextMenu(false)
            }}
            className="w-full px-4 py-1.5 text-left text-sm hover:bg-white/10 transition-colors"
          >
            {t('file.rename')}
          </button>
          <button
            onClick={() => {
              void handleExport()
              setShowContextMenu(false)
            }}
            className="w-full px-4 py-1.5 text-left text-sm hover:bg-white/10 transition-colors"
          >
            {t('common.export')}
          </button>
          <button
            onClick={() => {
              if (!gitConnected) {
                return
              }
              setShowStagePrompt(true)
              setShowContextMenu(false)
            }}
            disabled={!gitConnected}
            className={cn(
              'w-full px-4 py-1.5 text-left text-sm transition-colors',
              gitConnected ? 'hover:bg-white/10' : 'cursor-not-allowed opacity-40'
            )}
          >
            {t('git.stageToGit')}
          </button>
          <div className="my-1 border-t" style={{ borderColor: themeConfig.border }} />
          <button
            onClick={() => {
              handleDelete()
              setShowContextMenu(false)
            }}
            className="w-full px-4 py-1.5 text-left text-sm text-red-400 hover:bg-white/10 transition-colors"
          >
            {t('common.delete')}
          </button>
        </div>
      )}

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        itemName={file.name}
        title={t('file.deleteFile')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={handleConfirmDelete}
      />

      <PromptDialog
        isOpen={showStagePrompt}
        onClose={() => setShowStagePrompt(false)}
        onConfirm={handleStageToGit}
        title={t('git.stageToGit')}
        description={t('git.stageToGitDescription')}
        defaultValue={file.name}
        confirmText={t('git.stageConfirm')}
        cancelText={t('common.cancel')}
        placeholder="docs/example.md"
      />
    </>
  )
}
