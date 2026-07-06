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

export type SidebarPanel = 'files' | 'outline' | 'templates' | 'ai' | 'git' | 'git-files' | 'settings' | 'help'

export interface Template {
  id: string
  name: string
  description: string
  content: string
  isBuiltIn: boolean
  createdAt: number
  updatedAt: number
}

export const SIDEBAR_PANEL_MIN_WIDTH = 260

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
  /** 是否正在加载内置模板（防止并发加载） */
  isLoadingBuiltInTemplates: boolean
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
  /** 重置所有模板数据 */
  resetTemplates: () => void
}

/**
 * 内置模板定义
 */
const BUILT_IN_TEMPLATES = [
  {
    id: 'template-capability',
    name: 'Capability Skill',
    description: '能力技能模板',
    fileName: 'Capability Skill.md',
  },
  {
    id: 'template-constraint',
    name: 'Constraint Skill',
    description: '约束技能模板',
    fileName: 'Constraint Skill.md',
  },
  {
    id: 'template-decision',
    name: 'Decision Skill',
    description: '决策技能模板',
    fileName: 'Decision Skill.md',
  },
  {
    id: 'template-procedural',
    name: 'Procedural Skill',
    description: '程序技能模板',
    fileName: 'Procedural Skill.md',
  },
  {
    id: 'template-prompt',
    name: 'Prompt Template',
    description: '提示词模板',
    fileName: 'Prompt Template.md',
  },
]

/**
 * 加载内置模板内容
 */
async function loadBuiltInTemplateContent(fileName: string): Promise<string> {
  try {
    const response = await fetch(`/assets/templates/${fileName}`)
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
        panelWidth: SIDEBAR_PANEL_MIN_WIDTH,

        templates: [],
        selectedTemplateId: null,
        builtInTemplatesInitialized: false,
        isLoadingBuiltInTemplates: false,
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
          set({ panelWidth: Math.max(SIDEBAR_PANEL_MIN_WIDTH, Math.round(width)) })
        },

        // ==================== 模板操作 ====================

        loadBuiltInTemplates: async () => {
          const { builtInTemplatesInitialized, isLoadingBuiltInTemplates, templates: existingTemplates } = get()
          
          // 如果正在加载中，直接返回，防止并发调用
          if (isLoadingBuiltInTemplates) {
            return
          }
          
          // 如果内置模板已经初始化过（加载过），则不再加载
          // 这样用户删除内置模板后，刷新页面也不会恢复
          if (builtInTemplatesInitialized) {
            return
          }
          
          // 标记为正在加载
          set({ isLoadingBuiltInTemplates: true })
          
          try {
            // 加载所有内置模板（过滤掉已存在的）
            const templatesToLoad: Template[] = []
            
            for (const builtIn of BUILT_IN_TEMPLATES) {
              // 检查是否已存在相同 id 的模板
              const exists = existingTemplates.some(t => t.id === builtIn.id)
              if (exists) {
                continue
              }
              
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
                isLoadingBuiltInTemplates: false,
              }))
            } else {
              // 即使没有加载到模板，也标记为已初始化，避免重复尝试
              set({ 
                builtInTemplatesInitialized: true,
                isLoadingBuiltInTemplates: false,
              })
            }
          } catch (error) {
            // 发生错误时也要重置加载状态
            set({ isLoadingBuiltInTemplates: false })
            console.error('加载内置模板失败:', error)
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
          set((state) => {
            const newTemplates = state.templates.map((t) =>
              t.id === id
                ? { ...t, ...updates, updatedAt: Date.now() }
                : t
            )
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

        // 重置所有模板数据（用于清除缓存）
        resetTemplates: () => {
          set({
            templates: [],
            builtInTemplatesInitialized: false,
            selectedTemplateId: null,
          })
        },
      }),
      {
        name: 'sidebar-store-v2', // 修改存储名称以清除旧缓存
        partialize: (state) => ({
          activePanel: state.activePanel,
          isPanelExpanded: state.isPanelExpanded,
          panelWidth: state.panelWidth,
          templates: state.templates.filter(t => !t.isBuiltIn), // 只持久化自定义模板
          selectedTemplateId: state.selectedTemplateId,
          builtInTemplatesInitialized: false, // 每次重新加载内置模板
        }),
      }
    ),
    { name: 'SidebarStore' }
  )
)
