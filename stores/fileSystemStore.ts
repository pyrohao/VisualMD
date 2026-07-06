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
import type { Folder, MarkdownFile, Workspace, DropPosition, WorkspaceAsset } from '@/types/file-system'
import { useDocumentStore } from './documentStore'
import { useGitStore } from './gitStore'
import { useTabsStore } from './tabsStore'
import { buildLocalMarkdownPath, buildRelativeAssetPath, createLocalAssetRecord } from '@/lib/local-image-resolution'
import { saveLocalWorkspaceAssetBinary, deleteLocalWorkspaceAssetBinary } from '@/lib/local-workspace-storage'
import { createIndexedDbPersistStorage } from '@/lib/git-store-persist-storage'
import { exportMarkdownFileWithAssets, exportWorkspaceAsset } from '@/lib/local-workspace-export'
import type { WelcomeDocumentSeed } from '@/lib/default-documents'
import { createDefaultMarkdownDocumentContent, ensureMarkdownExtension, generateUniqueItemName } from '@/lib/workspace-item-utils'

/**
 * 文件系统 Store 接口
 */
interface FileSystemStore {
  // ==================== 状态 ====================
  
  /** 文件夹列表 */
  folders: Folder[]
  /** 文件列表 */
  files: MarkdownFile[]
  assets: WorkspaceAsset[]
  /** 当前打开的文件ID */
  currentFileId: string | null
  /** 展开的文件夹ID集合 */
  expandedFolderIds: Set<string>
  /** 是否已完成首次欢迎文档初始化 */
  hasInitializedWelcomeDocs: boolean
  
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
  /** 仅在首次使用时初始化欢迎文档 */
  initializeWelcomeDocs: (documents: ReadonlyArray<WelcomeDocumentSeed>) => void
  /** 打开文件 */
  openFile: (id: string) => void
  /** 保存文件（标记为已修改） */
  saveFile: (id: string, content: string) => void
  /** 保存文件内容并标记为已保存 */
  saveFileContent: (id: string, content: string) => void
  uploadAsset: (fileId: string, file: File) => Promise<{ assetPath: string; relativePath: string }>
  deleteAsset: (assetPath: string) => Promise<void>
  exportAsset: (assetPath: string) => Promise<void>
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
  exportFile: (id: string) => Promise<void>
  /** 导出文件夹为ZIP */
  exportFolder: (folderId: string) => void
}

/**
 * 获取最大 order 值
 */
function getMaxOrder(items: { order: number }[]): number {
  return items.length > 0 ? Math.max(...items.map(i => i.order)) : 0
}

function repairMissingLocalFileRecord(fileId: string, getState: () => FileSystemStore): MarkdownFile | null {
  const state = getState()
  const existingFile = state.files.find((item) => item.id === fileId)
  if (existingFile) {
    return existingFile
  }

  const tabsState = useTabsStore.getState()
  const fallbackTab = tabsState.tabs.find((tab) => tab.sourceType === 'local' && tab.fileId === fileId) || null
  const documentState = useDocumentStore.getState()
  const fallbackDocument = documentState.document?.fileId === fileId
    ? documentState.document
    : null

  const rawFileName = fallbackTab?.fileName || fallbackDocument?.fileName || ''
  if (!rawFileName.trim()) {
    return null
  }

  const now = Date.now()
  return {
    id: fileId,
    type: 'file',
    name: ensureMarkdownExtension(rawFileName.trim()),
    folderId: null,
    order: getMaxOrder(state.files.filter((item) => item.folderId === null)) + 1,
    content:
      fallbackTab?.content ||
      (typeof documentState.getCurrentMarkdown === 'function'
        ? documentState.getCurrentMarkdown()
        : '') ||
      '',
    isModified: Boolean(fallbackTab?.isModified || fallbackDocument?.isModified),
    lastOpenedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

async function migrateFileSystemPersistedState(persistedState: unknown) {
  if (!persistedState || typeof persistedState !== 'object') {
    return persistedState
  }

  const state = persistedState as {
    assets?: Array<WorkspaceAsset & { contentBase64?: string }>
    expandedFolderIds?: string[] | Set<string>
    hasInitializedWelcomeDocs?: boolean
  }

  const migratedAssets = Array.isArray(state.assets)
    ? await Promise.all(state.assets.map(async (asset) => {
        if (asset.contentBase64) {
          await saveLocalWorkspaceAssetBinary({
            id: asset.id,
            name: asset.name,
            path: asset.path,
            contentBase64: asset.contentBase64,
            mimeType: asset.mimeType,
            createdAt: asset.createdAt,
            updatedAt: asset.updatedAt,
          })
        }

        return {
          id: asset.id,
          name: asset.name,
          path: asset.path,
          mimeType: asset.mimeType,
          createdAt: asset.createdAt,
          updatedAt: asset.updatedAt,
        }
      }))
    : []

  return {
    ...state,
    assets: migratedAssets,
    expandedFolderIds:
      state.expandedFolderIds instanceof Set
        ? Array.from(state.expandedFolderIds)
        : Array.isArray(state.expandedFolderIds)
          ? state.expandedFolderIds
          : [],
    hasInitializedWelcomeDocs:
      typeof state.hasInitializedWelcomeDocs === 'boolean'
        ? state.hasInitializedWelcomeDocs
        : true,
  }
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
        assets: [],
        currentFileId: null,
        expandedFolderIds: new Set(),
        hasInitializedWelcomeDocs: false,
        
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
          const folderName = generateUniqueItemName(
            folders.map((folder) => folder.name),
            name.trim() || '新建文件夹'
          )
          const newFolder: Folder = {
            id: nanoid(),
            type: 'folder',
            name: folderName,
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

          // 确保文件名以 .md 结尾
          let fileName = name.trim() || '未命名文档.md'
          fileName = generateUniqueItemName(
            files.filter((file) => file.folderId === folderId).map((file) => file.name),
            fileName,
            { extensionMode: 'markdown' }
          )

          const content = createDefaultMarkdownDocumentContent(fileName)

          // 更新虚拟根节点标题为 Metadata（通过修改 root.title）
          // 注意：这个标题仅用于显示，实际保存时虚拟根节点固定显示为 Metadata

          const newFile: MarkdownFile = {
            id: nanoid(),
            type: 'file',
            name: fileName,
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

        initializeWelcomeDocs: (documents) => {
          const { hasInitializedWelcomeDocs, files, folders, assets, currentFileId } = get()

          if (hasInitializedWelcomeDocs) {
            return
          }

          const normalizedDocuments = documents
            .map((document) => {
              const rawName = document.name.trim()
              return {
                name: rawName ? ensureMarkdownExtension(rawName) : '',
                content: document.content,
              }
            })
            .filter((document) => document.name.length > 0 && document.content.trim().length > 0)

          if (files.length > 0 || folders.length > 0 || assets.length > 0 || normalizedDocuments.length === 0) {
            set({ hasInitializedWelcomeDocs: true })
            return
          }

          const now = Date.now()
          const nextFiles = [...files]
          const importedFiles: MarkdownFile[] = []

          normalizedDocuments.forEach((document, index) => {
            const fileName = generateUniqueItemName(
              nextFiles.filter((file) => file.folderId === null).map((file) => file.name),
              document.name,
              { extensionMode: 'markdown' }
            )
            const newFile: MarkdownFile = {
              id: nanoid(),
              type: 'file',
              name: fileName,
              folderId: null,
              order: getMaxOrder(nextFiles.filter((file) => file.folderId === null)) + 1,
              content: document.content,
              isModified: false,
              lastOpenedAt: now + index,
              createdAt: now + index,
              updatedAt: now + index,
            }

            nextFiles.push(newFile)
            importedFiles.push(newFile)
          })

          set({
            files: nextFiles,
            currentFileId: importedFiles[importedFiles.length - 1]?.id ?? currentFileId,
            hasInitializedWelcomeDocs: true,
          })
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

        saveFileContent: (id: string, content: string) => {
          const { files } = get()
          set({
            files: files.map(f =>
              f.id === id
                ? { ...f, content, isModified: false, updatedAt: Date.now() }
                : f
            ),
          })
          
          // 同时重置 documentStore 的 isModified 状态
          const { document } = useDocumentStore.getState()
          if (document) {
            useDocumentStore.setState({
              document: { ...document, isModified: false }
            })
          }
        },

        uploadAsset: async (fileId, file) => {
          let { files, folders } = get()
          let markdownPath = buildLocalMarkdownPath(fileId, files, folders)

          if (!markdownPath) {
            const repairedFile = repairMissingLocalFileRecord(fileId, get)
            if (repairedFile) {
              set((state) => ({
                files: [...state.files, repairedFile],
                currentFileId: state.currentFileId ?? repairedFile.id,
              }))
              ;({ files, folders } = get())
              markdownPath = buildLocalMarkdownPath(fileId, files, folders)
            }
          }

          if (!markdownPath) {
            const fallbackTab = useTabsStore.getState().tabs.find(
              (tab) => tab.sourceType === 'local' && tab.fileId === fileId
            )
            if (fallbackTab?.fileName?.trim()) {
              markdownPath = ensureMarkdownExtension(fallbackTab.fileName.trim())
            }
          }

          if (!markdownPath) {
            throw new Error('Local markdown file not found. Save or reopen the local document and try again.')
          }

          const nextAsset = await createLocalAssetRecord(markdownPath, file)
          const relativePath = buildRelativeAssetPath(markdownPath, nextAsset.metadata.path)
          await saveLocalWorkspaceAssetBinary(nextAsset.binary)

          set((state) => ({
            assets: [
              ...state.assets.filter((asset) => asset.path !== nextAsset.metadata.path),
              nextAsset.metadata,
            ],
          }))

          return {
            assetPath: nextAsset.metadata.path,
            relativePath,
          }
        },

        deleteAsset: async (assetPath) => {
          await deleteLocalWorkspaceAssetBinary(assetPath)
          set((state) => ({
            assets: state.assets.filter((asset) => asset.path !== assetPath),
          }))
        },

        exportAsset: async (assetPath) => {
          const asset = get().assets.find((item) => item.path === assetPath)
          if (!asset) {
            throw new Error('Asset not found')
          }

          await exportWorkspaceAsset(asset)
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
          useGitStore.setState((state) => ({
            stagedChanges: state.stagedChanges.filter((item) => !(item.kind === 'local-file' && item.localFileId === id)),
          }))
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
        
        exportFile: async (id: string) => {
          const { files, folders, assets } = get()
          const file = files.find(f => f.id === id)
          if (!file) return

          const markdownPath = buildLocalMarkdownPath(id, files, folders) || file.name
          await exportMarkdownFileWithAssets({
            file,
            markdownPath,
            assets,
          })
        },
        
        exportFolder: (folderId: string) => {
          // TODO: 实现 ZIP 导出
        },
      }),
      {
        name: 'markdown-workspace',
        version: 3,
        storage: createIndexedDbPersistStorage<Partial<Workspace>>({
          dbName: 'visualmd-workspace',
          storeName: 'zustand-persist',
          legacyStorageKey: 'markdown-workspace',
        }),
        migrate: (persistedState) => migrateFileSystemPersistedState(persistedState),
        partialize: (state) => ({
          folders: state.folders,
          files: state.files,
          assets: state.assets,
          currentFileId: state.currentFileId,
          expandedFolderIds: Array.from(state.expandedFolderIds),
          hasInitializedWelcomeDocs: state.hasInitializedWelcomeDocs,
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
