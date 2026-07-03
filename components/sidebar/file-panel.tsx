'use client'

/**
 * 鏂囦欢闈㈡澘缁勪欢
 *
 * 鍔熻兘闈㈡澘涓殑鏂囦欢绠＄悊鐣岄潰
 * 浠庡師 FileSidebar 杩佺Щ鑰屾潵
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { FilePlus, FolderPlus, ChevronDown, ChevronRight, ArrowUpDown, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTabsStore } from '@/stores/tabsStore'
import { requestNavigationWithUnsavedGuard } from '@/stores/unsavedChangesStore'
import { useTranslation } from '@/stores/languageStore'
import { FolderItem } from '../file-sidebar/folder-item'
import { FileItem } from '../file-sidebar/file-item'
import { AssetItem } from '../file-sidebar/asset-item'
import type { DropPosition } from '@/types/file-system'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { LOCAL_ASSET_DIRECTORY } from '@/lib/local-image-resolution'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function FilePanel() {
  const { getThemeConfig } = useThemeStore()
  const { t } = useTranslation()

  const {
    folders,
    files,
    assets,
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
  } = useFileSystemStore()

  const { openFileInTab, findTabByFileId, getActiveTab, activeTabId, openFileInCurrentTab } = useTabsStore()

  // 鎷栨嫿鐘舵€?
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<DropPosition | null>(null)

  // 瀹㈡埛绔寕杞界姸鎬侊紝鐢ㄤ簬閬垮厤 hydration 涓嶅尮閰?
  const [mounted, setMounted] = useState(false)

  // 浣跨敤瀹夊叏鐨勪富棰橀厤缃紝閬垮厤 SSR 涓嶅尮閰?
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])

  // 鏍圭洰褰曟嫋鏀剧姸鎬?
  const [isRootDragOver, setIsRootDragOver] = useState(false)

  // 鎺掑簭鐘舵€?
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'updatedAt' | 'createdAt'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // 瀵硅瘽妗嗙姸鎬?
  const [showFileDialog, setShowFileDialog] = useState(false)
  const [showFolderDialog, setShowFolderDialog] = useState(false)
  const [fileName, setFileName] = useState('')
  const [folderName, setFolderName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 鐐瑰嚮澶栭儴鍏抽棴鎺掑簭鑿滃崟
  useEffect(() => {
    if (!showSortMenu) return

    const handleClickOutside = () => {
      setShowSortMenu(false)
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showSortMenu])

  // 澶勭悊鎺掑簭
  const handleSort = (by: 'name' | 'updatedAt' | 'createdAt', order: 'asc' | 'desc') => {
    setSortBy(by)
    setSortOrder(order)
    setShowSortMenu(false)
  }

  // 鎺掑簭鍑芥暟
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

  // 鑾峰彇鎺掑簭鍚庣殑鏂囦欢澶瑰拰鏍圭洰褰曟枃浠?
  const sortedFolderList = sortedFolders()
  const rootFiles = getFilesByFolder(null)
  const [assetsExpanded, setAssetsExpanded] = useState(true)
  const assetCount = assets.length

  // 澶勭悊鏂囦欢鐐瑰嚮 - 鍦ㄦ爣绛鹃〉涓墦寮€
  const handleFileClick = (fileId: string) => {
    const file = useFileSystemStore.getState().files.find(f => f.id === fileId)
    if (!file) return

    // 妫€鏌ユ槸鍚﹀凡缁忓湪鏌愪釜鏍囩椤垫墦寮€
    const existingTab = findTabByFileId(fileId)
    if (existingTab) {
      // 鍒囨崲鍒板凡瀛樺湪鐨勬爣绛鹃〉
      if (existingTab.id === activeTabId) {
        return
      }

      void requestNavigationWithUnsavedGuard(() => {
        openFileInTab(file.name, file.content, fileId)
      }, file.name)
      return
    }

    // 妫€鏌ュ綋鍓嶆槸鍚︽槸绌虹櫧鏍囩椤?
    const activeTab = getActiveTab()
    if (activeTab?.isNew && !activeTab?.content?.trim()) {
      // 鍦ㄥ綋鍓嶇┖鐧芥爣绛鹃〉鎵撳紑
      void requestNavigationWithUnsavedGuard(() => {
        openFileInCurrentTab(activeTabId!, file.name, file.content, fileId)
      }, file.name)
    } else {
      // 鍦ㄦ柊鏍囩椤垫墦寮€
      void requestNavigationWithUnsavedGuard(() => {
        openFileInTab(file.name, file.content, fileId)
      }, file.name)
    }
  }

  // 澶勭悊鍒涘缓鏂囦欢
  const handleCreateFile = () => {
    setFileName(t('file.untitled') + '.md')
    setShowFileDialog(true)
  }

  // 纭鍒涘缓鏂囦欢
  const handleConfirmCreateFile = () => {
    if (fileName.trim()) {
      createFile(fileName.trim(), null)
      setShowFileDialog(false)
      const nextFileId = useFileSystemStore.getState().currentFileId
      if (nextFileId) {
        handleFileClick(nextFileId)
      }
      toast({
        title: t('toast.fileAdded'),
      })
    }
  }

  // 澶勭悊鍒涘缓鏂囦欢澶?
  const handleCreateFolder = () => {
    setFolderName(t('file.newFolder'))
    setShowFolderDialog(true)
  }

  // 纭鍒涘缓鏂囦欢澶?
  const handleConfirmCreateFolder = () => {
    if (folderName.trim()) {
      createFolder(folderName.trim())
      setShowFolderDialog(false)
      toast({
        title: t('toast.folderAdded'),
      })
    }
  }

  // 澶勭悊瀵硅瘽妗嗗彇娑?
  const handleCancelFileDialog = () => {
    setShowFileDialog(false)
    setFileName('')
  }

  const handleCancelFolderDialog = () => {
    setShowFolderDialog(false)
    setFolderName('')
  }

  // 澶勭悊鏂囦欢澶瑰睍寮€/鎶樺彔
  const handleToggleFolder = (id: string) => {
    toggleFolder(id)
  }

  // 澶勭悊鎷栨嫿寮€濮?
  const handleDragStart = useCallback((e: React.DragEvent, id: string, type: 'folder' | 'file') => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, type }))
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  // 澶勭悊鎷栨嫿缁忚繃
  const handleDragOver = useCallback((e: React.DragEvent, id: string, type: 'folder' | 'file') => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    const position: DropPosition = e.clientY < midY ? 'before' : 'after'

    setDragOverId(id)
    setDragOverPosition(position)
  }, [])

  // 澶勭悊鏀剧疆锛堝唴閮ㄦ嫋鎷芥帓搴忥級
  const handleDrop = useCallback((e: React.DragEvent, targetId: string, type: 'folder' | 'file') => {
    e.preventDefault()
    e.stopPropagation()

    const data = e.dataTransfer.getData('text/plain')
    if (!data) {
      // 娌℃湁鍐呴儴鎷栨嫿鏁版嵁锛屽彲鑳芥槸澶栭儴鏂囦欢鎷栨嫿锛屼笉澶勭悊
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
      // 蹇界暐瑙ｆ瀽閿欒
    }

    setDragOverId(null)
    setDragOverPosition(null)
  }, [dragOverPosition, reorderFolders])

  // 澶勭悊鏍圭洰褰曞閮ㄦ枃浠舵嫋鎷?
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

    // 澶勭悊澶栭儴鏂囦欢鎷栨嫿鍒版牴鐩綍
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.name.endsWith('.txt')) {
          const content = await file.text()
          importFile(file.name, content, null)
        }
      }
    }
  }

  // 鍒ゆ柇鏄惁鍏ㄩ儴灞曞紑
  const isAllExpanded = sortedFolderList.length > 0 &&
    sortedFolderList.every(f => expandedFolderIds.has(f.id))

  return (
    <div
      className={cn(
        "h-full flex flex-col",
        isRootDragOver && "bg-blue-500/10"
      )}
      style={{
        backgroundColor: isRootDragOver ? undefined : themeConfig.sidebar,
        color: themeConfig.text,
      }}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
    >
      {/* 澶撮儴 */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: themeConfig.border }}
      >
        <div className="flex items-center gap-2">
          <FolderOpen
            className="w-5 h-5"
            style={{ color: themeConfig.primary }}
          />
          <span
            className="font-medium"
            style={{ color: themeConfig.text }}
          >
            {mounted ? t('sidebar.files') : '鏂囦欢'}
          </span>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: themeConfig.primary + '20',
            color: themeConfig.primary,
          }}
        >
          {files.length}
        </span>
      </div>

      {/* 椤堕儴宸ュ叿鏍?*/}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-60">
          {mounted ? t('sidebar.files') : '鏂囦欢'}
        </span>
        <div className="flex items-center gap-0.5">
          {/* 鏂板缓鏂囦欢 */}
          <button
            onClick={handleCreateFile}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title={mounted ? t('file.newFile') : '鏂板缓鏂囦欢'}
          >
            <FilePlus className="w-4 h-4" />
          </button>
          {/* 鏂板缓鏂囦欢澶?*/}
          <button
            onClick={handleCreateFolder}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title={mounted ? t('sidebar.createNewFolder') : 'New Folder'}
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          {/* 鎺掑簭 */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowSortMenu(!showSortMenu)
              }}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              title={mounted ? t('common.sort') : '鎺掑簭'}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
            {/* 鎺掑簭涓嬫媺鑿滃崟 */}
            {showSortMenu && (
              <div
                className="absolute right-0 top-full mt-1 py-1 rounded-lg shadow-lg border min-w-[180px] z-50"
                onClick={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: themeConfig.card,
                  borderColor: themeConfig.border,
                }}
              >
                {/* 鏂囦欢鍚嶆帓搴?*/}
                <button
                  onClick={() => handleSort('name', 'asc')}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-white/5 flex items-center justify-between",
                    sortBy === 'name' && sortOrder === 'asc' && "text-blue-400"
                  )}
                  style={{ color: sortBy === 'name' && sortOrder === 'asc' ? undefined : themeConfig.text }}
                >
                  {mounted ? t('file.nameAZ') : '鏂囦欢鍚?(A-Z)'}
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
                  {mounted ? t('file.nameZA') : '鏂囦欢鍚?(Z-A)'}
                  {sortBy === 'name' && sortOrder === 'desc' && <ChevronDown className="w-4 h-4" />}
                </button>

                {/* 鍒嗛殧绾?*/}
                <div className="my-1 border-t" style={{ borderColor: themeConfig.border }} />

                {/* 缂栬緫鏃堕棿鎺掑簭 */}
                <button
                  onClick={() => handleSort('updatedAt', 'desc')}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-white/5 flex items-center justify-between",
                    sortBy === 'updatedAt' && sortOrder === 'desc' && "text-blue-400"
                  )}
                  style={{ color: sortBy === 'updatedAt' && sortOrder === 'desc' ? undefined : themeConfig.text }}
                >
                  {mounted ? t('file.updatedNewToOld') : '缂栬緫鏃堕棿 (浠庢柊鍒版棫)'}
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
                  {mounted ? t('file.updatedOldToNew') : '缂栬緫鏃堕棿 (浠庢棫鍒版柊)'}
                  {sortBy === 'updatedAt' && sortOrder === 'asc' && <ChevronDown className="w-4 h-4" />}
                </button>

                {/* 鍒嗛殧绾?*/}
                <div className="my-1 border-t" style={{ borderColor: themeConfig.border }} />

                {/* 鍒涘缓鏃堕棿鎺掑簭 */}
                <button
                  onClick={() => handleSort('createdAt', 'desc')}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm hover:bg-white/5 flex items-center justify-between",
                    sortBy === 'createdAt' && sortOrder === 'desc' && "text-blue-400"
                  )}
                  style={{ color: sortBy === 'createdAt' && sortOrder === 'desc' ? undefined : themeConfig.text }}
                >
                  {mounted ? t('file.createdNewToOld') : '鍒涘缓鏃堕棿 (浠庢柊鍒版棫)'}
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
                  {mounted ? t('file.createdOldToNew') : '鍒涘缓鏃堕棿 (浠庢棫鍒版柊)'}
                  {sortBy === 'createdAt' && sortOrder === 'asc' && <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
          {/* 灞曞紑/鎶樺彔 */}
          <button
            onClick={isAllExpanded ? collapseAll : expandAll}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title={isAllExpanded ? '鎶樺彔鍏ㄩ儴' : '灞曞紑鍏ㄩ儴'}
          >
            {isAllExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* 鏂囦欢鍒楄〃 */}
      <div className="flex-1 overflow-y-auto px-1">
        {/* 绛夊緟瀹㈡埛绔寕杞藉畬鎴愬悗鍐嶆覆鏌擄紝閬垮厤 hydration 涓嶅尮閰?*/}
        {mounted && (
          <>
            {/* 鏂囦欢澶瑰垪琛?*/}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setAssetsExpanded((current) => !current)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-white/5"
                style={{ color: themeConfig.text }}
                title={`${LOCAL_ASSET_DIRECTORY} system assets`}
              >
                {assetsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="flex-1 text-sm font-medium">{LOCAL_ASSET_DIRECTORY}</span>
                <span className="text-xs opacity-60">{assetCount}</span>
              </button>
              {assetsExpanded && (
                <div className="mt-1 space-y-0.5 pl-4">
                  {assetCount > 0 ? (
                    sortItems(assets).map((asset) => (
                      <AssetItem key={asset.path} asset={asset} />
                    ))
                  ) : (
                    <div className="px-2 py-1 text-xs opacity-40">
                      No assets yet
                    </div>
                  )}
                </div>
              )}
            </div>

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
                onFileClick={handleFileClick}
              />
            ))}

            {/* 鏍圭洰褰曟枃浠?*/}
            {sortItems(rootFiles).map((file) => (
              <FileItem
                key={file.id}
                file={file}
                isActive={file.id === currentFileId}
                isModified={file.isModified}
                onClick={() => handleFileClick(file.id)}
              />
            ))}


            {/* 绌虹姸鎬?*/}
            {sortedFolderList.length === 0 && rootFiles.length === 0 && (
              <div className="px-4 py-8 text-center opacity-40">
                <div className="text-sm mb-1">No files yet</div>
                <div className="text-xs">Use the buttons above to create one</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 鍒涘缓鏂囦欢瀵硅瘽妗?*/}
      <Dialog open={showFileDialog} onOpenChange={setShowFileDialog}>
        <DialogContent
          className="sm:max-w-[400px]"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: themeConfig.text }}>
              {mounted ? t('file.newFile') : '鏂板缓鏂囦欢'}
            </DialogTitle>
            <DialogDescription style={{ color: themeConfig.textMuted }}>
              {mounted ? t('file.enterFileName') : 'Enter a file name'}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <input
              ref={fileInputRef}
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmCreateFile()
                }
                if (e.key === 'Escape') {
                  handleCancelFileDialog()
                }
              }}
              placeholder={mounted ? t('file.fileName') : 'File name'}
              className="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{
                backgroundColor: themeConfig.background,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button
              variant="outline"
              onClick={handleCancelFileDialog}
              style={{
                borderColor: themeConfig.border,
                color: themeConfig.text,
                backgroundColor: 'transparent',
              }}
              className="hover:opacity-80"
            >
              {mounted ? t('common.cancel') : '鍙栨秷'}
            </Button>
            <Button
              onClick={handleConfirmCreateFile}
              style={{
                backgroundColor: themeConfig.primary,
                color: '#fff',
              }}
              className="hover:opacity-90"
            >
              {mounted ? t('common.create') : '鍒涘缓'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 鍒涘缓鏂囦欢澶瑰璇濇 */}
      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent
          className="sm:max-w-[400px]"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: themeConfig.text }}>
              {mounted ? t('sidebar.createNewFolder') : 'New Folder'}
            </DialogTitle>
            <DialogDescription style={{ color: themeConfig.textMuted }}>
              {mounted ? t('file.enterFolderName') : 'Enter a folder name'}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <input
              ref={folderInputRef}
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmCreateFolder()
                }
                if (e.key === 'Escape') {
                  handleCancelFolderDialog()
                }
              }}
              placeholder={mounted ? t('file.folderName') : 'Folder name'}
              className="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{
                backgroundColor: themeConfig.background,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button
              variant="outline"
              onClick={handleCancelFolderDialog}
              style={{
                borderColor: themeConfig.border,
                color: themeConfig.text,
                backgroundColor: 'transparent',
              }}
              className="hover:opacity-80"
            >
              {mounted ? t('common.cancel') : '鍙栨秷'}
            </Button>
            <Button
              onClick={handleConfirmCreateFolder}
              style={{
                backgroundColor: themeConfig.primary,
                color: '#fff',
              }}
              className="hover:opacity-90"
            >
              {mounted ? t('common.create') : '鍒涘缓'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
