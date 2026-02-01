/**
 * 侧边栏状态管理 - Zustand Store
 *
 * 管理左侧图标栏和功能面板的状态
 * - 面板切换（文件、模板等）
 * - 模板管理
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'

export type SidebarPanel = 'files' | 'templates'

export interface Template {
  id: string
  name: string
  description: string
  content: string
  isBuiltIn: boolean
  createdAt: number
  updatedAt: number
}

interface SidebarStore {
  // ==================== 面板状态 ====================

  /** 当前激活的面板 */
  activePanel: SidebarPanel
  /** 功能面板是否展开 */
  isPanelExpanded: boolean
  /** 面板宽度 */
  panelWidth: number

  // ==================== 模板状态 ====================

  /** 模板列表 */
  templates: Template[]
  /** 当前选中的模板ID */
  selectedTemplateId: string | null
  /** 内置模板是否已初始化（用于判断是否需要加载内置模板） */
  builtInTemplatesInitialized: boolean
  /** 当前正在编辑的模板ID（用于自动保存状态跟踪） */
  editingTemplateId: string | null
  /** 模板是否被修改（类似于文件的 isModified） */
  isTemplateModified: boolean

  // ==================== 面板操作 ====================

  /** 设置当前面板 */
  setActivePanel: (panel: SidebarPanel) => void
  /** 切换面板展开状态 */
  togglePanel: () => void
  /** 设置面板宽度 */
  setPanelWidth: (width: number) => void

  // ==================== 模板操作 ====================

  /** 加载内置模板 */
  loadBuiltInTemplates: () => Promise<void>
  /** 添加自定义模板 */
  addTemplate: (template: Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltIn'>) => void
  /** 更新模板 */
  updateTemplate: (id: string, updates: Partial<Template>) => void
  /** 删除模板 */
  deleteTemplate: (id: string) => void
  /** 选择模板 */
  selectTemplate: (id: string | null) => void
  /** 获取模板内容 */
  getTemplateContent: (id: string) => string | null
  /** 设置正在编辑的模板 */
  setEditingTemplate: (id: string | null) => void
  /** 标记模板为已修改 */
  markTemplateAsModified: () => void
  /** 标记模板为已保存 */
  markTemplateAsSaved: () => void
}

/**
 * 内置模板定义
 */
const BUILT_IN_TEMPLATES = [
  {
    id: 'template-skill',
    name: '技能模板',
    description: '用于创建技能文档的模板',
    fileName: 'SKILL.md',
  },
]

/**
 * 加载内置模板内容
 */
async function loadBuiltInTemplateContent(fileName: string): Promise<string> {
  try {
    const response = await fetch(`/templates/${fileName}`)
    if (!response.ok) {
      throw new Error(`Failed to load template: ${fileName}`)
    }
    return await response.text()
  } catch (error) {
    console.error('Failed to load built-in template:', error)
    return ''
  }
}

/**
 * 创建 Sidebar Store
 */
export const useSidebarStore = create<SidebarStore>()(
  devtools(
    persist(
      (set, get) => ({
        // ==================== 初始状态 ====================

        activePanel: 'files',
        isPanelExpanded: true,
        panelWidth: 260,

        templates: [],
        selectedTemplateId: null,
        builtInTemplatesInitialized: false,
        editingTemplateId: null,
        isTemplateModified: false,

        // ==================== 面板操作 ====================

        setActivePanel: (panel) => {
          set({ activePanel: panel })
          // 切换面板时自动展开
          if (!get().isPanelExpanded) {
            set({ isPanelExpanded: true })
          }
        },

        togglePanel: () => {
          set((state) => ({ isPanelExpanded: !state.isPanelExpanded }))
        },

        setPanelWidth: (width) => {
          set({ panelWidth: Math.max(200, Math.min(400, width)) })
        },

        // ==================== 模板操作 ====================

        loadBuiltInTemplates: async () => {
          const { builtInTemplatesInitialized, templates: existingTemplates } = get()
          
          // 如果内置模板已经初始化过（加载过），则不再加载
          // 这样用户删除内置模板后，刷新页面也不会恢复
          if (builtInTemplatesInitialized) {
            return
          }
          
          // 加载所有内置模板
          const templatesToLoad: Template[] = []
          
          for (const builtIn of BUILT_IN_TEMPLATES) {
            const content = await loadBuiltInTemplateContent(builtIn.fileName)
            if (content) {
              templatesToLoad.push({
                id: builtIn.id,
                name: builtIn.name,
                description: builtIn.description,
                content,
                isBuiltIn: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
            }
          }

          // 添加内置模板并标记为已初始化
          if (templatesToLoad.length > 0) {
            set((state) => ({
              templates: [...state.templates, ...templatesToLoad],
              builtInTemplatesInitialized: true,
            }))
          } else {
            // 即使没有加载到模板，也标记为已初始化，避免重复尝试
            set({ builtInTemplatesInitialized: true })
          }
        },

        addTemplate: (template) => {
          const newTemplate: Template = {
            ...template,
            id: nanoid(),
            isBuiltIn: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          set((state) => ({
            templates: [...state.templates, newTemplate],
          }))
        },

        updateTemplate: (id, updates) => {
          console.log('[sidebarStore] updateTemplate 被调用:', { id, updatesContentLength: updates.content?.length })
          set((state) => {
            const newTemplates = state.templates.map((t) =>
              t.id === id
                ? { ...t, ...updates, updatedAt: Date.now() }
                : t
            )
            console.log('[sidebarStore] updateTemplate 完成, templates 长度:', newTemplates.length)
            return { templates: newTemplates }
          })
        },

        deleteTemplate: (id) => {
          // 允许删除所有模板（包括内置模板）
          set((state) => ({
            templates: state.templates.filter((t) => t.id !== id),
            selectedTemplateId: state.selectedTemplateId === id ? null : state.selectedTemplateId,
          }))
        },

        selectTemplate: (id) => {
          set({ selectedTemplateId: id })
        },

        getTemplateContent: (id) => {
          const template = get().templates.find((t) => t.id === id)
          console.log('[sidebarStore] getTemplateContent:', { id, found: !!template, contentLength: template?.content?.length })
          return template?.content || null
        },

        setEditingTemplate: (id) => {
          set({ editingTemplateId: id, isTemplateModified: false })
        },

        markTemplateAsModified: () => {
          set({ isTemplateModified: true })
        },

        markTemplateAsSaved: () => {
          set({ isTemplateModified: false })
        },
      }),
      {
        name: 'sidebar-store',
        partialize: (state) => ({
          activePanel: state.activePanel,
          isPanelExpanded: state.isPanelExpanded,
          panelWidth: state.panelWidth,
          templates: state.templates, // 所有模板都持久化（包括内置模板）
          selectedTemplateId: state.selectedTemplateId,
          builtInTemplatesInitialized: state.builtInTemplatesInitialized, // 持久化初始化标志
        }),
      }
    ),
    { name: 'SidebarStore' }
  )
)
