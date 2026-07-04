/**
 * 文件系统类型定义
 *
 * 本模块定义左侧边栏文件管理系统的所有类型
 * 对应技术文档第8章 - 文件管理系统
 */

/**
 * 文件夹
 */
export interface Folder {
  id: string
  type: 'folder'
  name: string
  order: number
  createdAt: number
  updatedAt: number
}

/**
 * Markdown 文件
 */
export interface MarkdownFile {
  id: string
  type: 'file'
  name: string
  folderId: string | null
  order: number
  content: string
  isModified: boolean
  lastOpenedAt?: number
  createdAt: number
  updatedAt: number
}

export interface WorkspaceAsset {
  id: string
  name: string
  path: string
  mimeType?: string
  createdAt: number
  updatedAt: number
}

/**
 * 文件系统项（文件夹或文件）
 */
export type FileSystemItem = Folder | MarkdownFile

/**
 * 工作区状态
 */
export interface Workspace {
  folders: Folder[]
  files: MarkdownFile[]
  assets: WorkspaceAsset[]
  currentFileId: string | null
  expandedFolderIds: string[]
  hasInitializedWelcomeDocs: boolean
}

/**
 * 拖拽排序位置
 */
export type DropPosition = 'before' | 'after'

/**
 * 导入文件选项
 */
export interface ImportFileOptions {
  folderId?: string | null
  overwrite?: boolean
}
