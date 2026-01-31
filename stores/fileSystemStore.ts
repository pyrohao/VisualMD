/**
 * 文件系统状态管理 - Zustand Store
 *
 * 本模块提供左侧边栏文件管理系统的状态管理，包括：
 * 1. 文件夹的创建、重命名、删除
 * 2. 文件的创建、导入、导出、保存
 * 3. 拖拽排序功能
 * 4. 当前文件的切换
 *
 * 对应技术文档第8章 - 文件管理系统
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { Folder, MarkdownFile, Workspace, DropPosition } from '@/types/file-system'

/**
 * 文件系统 Store 接口
 */
interface FileSystemStore {
  // ==================== 状态 ====================
  
  /** 文件夹列表 */
  folders: Folder[]
  /** 文件列表 */
  files: MarkdownFile[]
  /** 当前打开的文件ID */
  currentFileId: string | null
  /** 展开的文件夹ID集合 */
  expandedFolderIds: Set<string>
  
  // ==================== 计算属性 ====================
  
  /** 排序后的文件夹列表 */
  sortedFolders: () => Folder[]
  /** 获取文件夹内的文件（已排序） */
  getFilesByFolder: (folderId: string | null) => MarkdownFile[]
  
  // ==================== 文件夹操作 ====================
  
  /** 创建文件夹 */
  createFolder: (name: string) => void
  /** 重命名文件夹 */
  renameFolder: (id: string, newName: string) => void
  /** 删除文件夹 */
  deleteFolder: (id: string) => void
  /** 展开/折叠文件夹 */
  toggleFolder: (id: string) => void
  /** 展开所有文件夹 */
  expandAll: () => void
  /** 折叠所有文件夹 */
  collapseAll: () => void
  
  // ==================== 文件操作 ====================
  
  /** 创建文件 */
  createFile: (name: string, folderId?: string | null) => void
  /** 导入文件 */
  importFile: (name: string, content: string, folderId?: string | null) => void
  /** 打开文件 */
  openFile: (id: string) => void
  /** 保存文件 */
  saveFile: (id: string, content: string) => void
  /** 标记文件为已保存 */
  markFileAsSaved: (id: string) => void
  /** 标记文件为已修改 */
  markFileAsModified: (id: string) => void
  /** 重命名文件 */
  renameFile: (id: string, newName: string) => void
  /** 删除文件 */
  deleteFile: (id: string) => void
  /** 移动文件到文件夹 */
  moveFileToFolder: (fileId: string, folderId: string | null) => void
  
  // ==================== 拖拽排序 ====================
  
  /** 重新排序文件夹 */
  reorderFolders: (draggedId: string, targetId: string, position: DropPosition) => void
  /** 重新排序文件 */
  reorderFiles: (draggedId: string, targetId: string, position: DropPosition) => void
  
  // ==================== 导出 ====================
  
  /** 导出文件 */
  exportFile: (id: string) => void
  /** 导出文件夹为ZIP */
  exportFolder: (folderId: string) => void
}

/**
 * 获取最大 order 值
 */
function getMaxOrder(items: { order: number }[]): number {
  return items.length > 0 ? Math.max(...items.map(i => i.order)) : 0
}

/**
 * 创建文件系统 Store
 */
export const useFileSystemStore = create<FileSystemStore>()(
  devtools(
    persist(
      (set, get) => ({
        // ==================== 初始状态 ====================
        folders: [],
        files: [],
        currentFileId: null,
        expandedFolderIds: new Set(),
        
        // ==================== 计算属性 ====================
        
        sortedFolders: () => {
          const { folders } = get()
          return [...folders].sort((a, b) => a.order - b.order)
        },
        
        getFilesByFolder: (folderId: string | null) => {
          const { files } = get()
          return files
            .filter(f => f.folderId === folderId)
            .sort((a, b) => a.order - b.order)
        },
        

        
        // ==================== 文件夹操作 ====================
        
        createFolder: (name: string) => {
          const { folders } = get()
          const now = Date.now()
          const newFolder: Folder = {
            id: nanoid(),
            type: 'folder',
            name: name.trim() || '新建文件夹',
            order: getMaxOrder(folders) + 1,
            createdAt: now,
            updatedAt: now,
          }
          set({ folders: [...folders, newFolder] })
        },
        
        renameFolder: (id: string, newName: string) => {
          const { folders } = get()
          set({
            folders: folders.map(f =>
              f.id === id
                ? { ...f, name: newName.trim() || f.name, updatedAt: Date.now() }
                : f
            ),
          })
        },
        
        deleteFolder: (id: string) => {
          const { folders, files } = get()
          // 删除文件夹及其内部文件
          set({
            folders: folders.filter(f => f.id !== id),
            files: files.filter(f => f.folderId !== id),
          })
        },
        
        toggleFolder: (id: string) => {
          const { expandedFolderIds } = get()
          const newSet = new Set(expandedFolderIds)
          if (newSet.has(id)) {
            newSet.delete(id)
          } else {
            newSet.add(id)
          }
          set({ expandedFolderIds: newSet })
        },
        
        expandAll: () => {
          const { folders } = get()
          set({ expandedFolderIds: new Set(folders.map(f => f.id)) })
        },
        
        collapseAll: () => {
          set({ expandedFolderIds: new Set() })
        },
        
        // ==================== 文件操作 ====================
        
        createFile: (name: string, folderId: string | null = null) => {
          const { files } = get()
          const now = Date.now()
          const newFile: MarkdownFile = {
            id: nanoid(),
            type: 'file',
            name: name.trim() || '未命名文档.md',
            folderId,
            order: getMaxOrder(files.filter(f => f.folderId === folderId)) + 1,
            content: `# ${name.trim().replace(/\.md$/, '') || '未命名文档'}\n\n开始编辑...`,
            isModified: false,
            lastOpenedAt: now,
            createdAt: now,
            updatedAt: now,
          }
          set({ files: [...files, newFile], currentFileId: newFile.id })
        },
        
        importFile: (name: string, content: string, folderId: string | null = null) => {
          const { files } = get()
          const now = Date.now()
          const newFile: MarkdownFile = {
            id: nanoid(),
            type: 'file',
            name: name.trim() || '导入文档.md',
            folderId,
            order: getMaxOrder(files.filter(f => f.folderId === folderId)) + 1,
            content,
            isModified: false,
            lastOpenedAt: now,
            createdAt: now,
            updatedAt: now,
          }
          set({ files: [...files, newFile], currentFileId: newFile.id })
        },
        
        openFile: (id: string) => {
          const { files } = get()
          set({
            currentFileId: id,
            files: files.map(f =>
              f.id === id ? { ...f, lastOpenedAt: Date.now() } : f
            ),
          })
        },
        
        saveFile: (id: string, content: string) => {
          const { files } = get()
          set({
            files: files.map(f =>
              f.id === id
                ? { ...f, content, isModified: true, updatedAt: Date.now() }
                : f
            ),
          })
        },
        
        markFileAsSaved: (id: string) => {
          const { files } = get()
          set({
            files: files.map(f =>
              f.id === id ? { ...f, isModified: false } : f
            ),
          })
        },
        
        markFileAsModified: (id: string) => {
          const { files } = get()
          set({
            files: files.map(f =>
              f.id === id ? { ...f, isModified: true, updatedAt: Date.now() } : f
            ),
          })
        },
        
        renameFile: (id: string, newName: string) => {
          const { files } = get()
          set({
            files: files.map(f =>
              f.id === id
                ? { ...f, name: newName.trim() || f.name, updatedAt: Date.now() }
                : f
            ),
          })
        },
        
        deleteFile: (id: string) => {
          const { files, currentFileId } = get()
          const newFiles = files.filter(f => f.id !== id)
          set({
            files: newFiles,
            currentFileId: currentFileId === id ? null : currentFileId,
          })
        },
        
        moveFileToFolder: (fileId: string, folderId: string | null) => {
          const { files } = get()
          const targetFiles = files.filter(f => f.folderId === folderId)
          set({
            files: files.map(f =>
              f.id === fileId
                ? { ...f, folderId, order: getMaxOrder(targetFiles) + 1 }
                : f
            ),
          })
        },
        
        // ==================== 拖拽排序 ====================
        
        reorderFolders: (draggedId: string, targetId: string, position: DropPosition) => {
          const { folders } = get()
          const draggedFolder = folders.find(f => f.id === draggedId)
          const targetFolder = folders.find(f => f.id === targetId)
          
          if (!draggedFolder || !targetFolder) return
          
          const sortedFolders = [...folders].sort((a, b) => a.order - b.order)
          const draggedIndex = sortedFolders.findIndex(f => f.id === draggedId)
          const targetIndex = sortedFolders.findIndex(f => f.id === targetId)
          
          // 从原位置移除
          sortedFolders.splice(draggedIndex, 1)
          
          // 计算插入位置
          let insertIndex = targetIndex
          if (position === 'after') {
            insertIndex = targetIndex + 1
          }
          if (draggedIndex < targetIndex) {
            insertIndex--
          }
          
          // 插入到新位置
          sortedFolders.splice(insertIndex, 0, draggedFolder)
          
          // 重新分配 order
          const newFolders = sortedFolders.map((f, index) => ({
            ...f,
            order: index + 1,
          }))
          
          set({ folders: newFolders })
        },
        
        reorderFiles: (draggedId: string, targetId: string, position: DropPosition) => {
          const { files } = get()
          const draggedFile = files.find(f => f.id === draggedId)
          const targetFile = files.find(f => f.id === targetId)
          
          if (!draggedFile || !targetFile) return
          if (draggedFile.folderId !== targetFile.folderId) return
          
          const folderId = draggedFile.folderId
          const folderFiles = files
            .filter(f => f.folderId === folderId)
            .sort((a, b) => a.order - b.order)
          
          const draggedIndex = folderFiles.findIndex(f => f.id === draggedId)
          const targetIndex = folderFiles.findIndex(f => f.id === targetId)
          
          // 从原位置移除
          folderFiles.splice(draggedIndex, 1)
          
          // 计算插入位置
          let insertIndex = targetIndex
          if (position === 'after') {
            insertIndex = targetIndex + 1
          }
          if (draggedIndex < targetIndex) {
            insertIndex--
          }
          
          // 插入到新位置
          folderFiles.splice(insertIndex, 0, draggedFile)
          
          // 重新分配 order
          const updatedFiles = folderFiles.map((f, index) => ({
            ...f,
            order: index + 1,
          }))
          
          // 合并回所有文件
          const otherFiles = files.filter(f => f.folderId !== folderId)
          set({ files: [...otherFiles, ...updatedFiles] })
        },
        
        // ==================== 导出 ====================
        
        exportFile: (id: string) => {
          const { files } = get()
          const file = files.find(f => f.id === id)
          if (!file) return
          
          const blob = new Blob([file.content], { type: 'text/markdown' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = file.name
          a.click()
          URL.revokeObjectURL(url)
        },
        
        exportFolder: (folderId: string) => {
          // TODO: 实现 ZIP 导出
          console.log('Export folder:', folderId)
        },
      }),
      {
        name: 'markdown-workspace',
        partialize: (state) => ({
          folders: state.folders,
          files: state.files,
          currentFileId: state.currentFileId,
          expandedFolderIds: Array.from(state.expandedFolderIds),
        }),
        onRehydrateStorage: () => (state) => {
          // 将数组恢复为 Set
          if (state && Array.isArray(state.expandedFolderIds)) {
            state.expandedFolderIds = new Set(state.expandedFolderIds)
          }
        },
      }
    ),
    { name: 'FileSystemStore' }
  )
)
