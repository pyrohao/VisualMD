/**
 * 多标签页状态管理 - Zustand Store
 *
 * 管理多个打开的文档标签页
 * - 标签页的增删改查
 * - 当前激活标签切换
 * - 标签页状态管理
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'

export interface Tab {
  id: string
  fileName: string
  content: string
  isModified: boolean
  isNew?: boolean // 是否是新建未保存的文件
  fileId?: string | null // 绑定的文件系统文件ID
  templateId?: string | null // 绑定的模板ID（用于模板编辑）
  isTemplate?: boolean // 是否是模板编辑标签
}

interface TabsStore {
  // ==================== 状态 ====================

  /** 所有打开的标签页 */
  tabs: Tab[]
  /** 当前激活的标签页ID */
  activeTabId: string | null

  // ==================== 操作 ====================

  /** 创建新标签页 */
  createTab: (fileName?: string, content?: string, isBlank?: boolean) => string
  /** 打开文件到新标签页 */
  openFileInTab: (fileName: string, content: string, fileId?: string) => string
  /** 根据文件ID查找标签页 */
  findTabByFileId: (fileId: string) => Tab | null
  /** 更新标签页绑定的文件ID */
  updateTabFileId: (tabId: string, fileId: string) => void
  /** 关闭标签页 */
  closeTab: (tabId: string) => void
  /** 关闭所有标签页 */
  closeAllTabs: () => void
  /** 激活标签页 */
  activateTab: (tabId: string) => void
  /** 切换到下一个标签页 */
  switchToNextTab: () => void
  /** 切换到上一个标签页 */
  switchToPrevTab: () => void
  /** 更新标签页内容 */
  updateTabContent: (tabId: string, content: string) => void
  /** 标记标签页为已修改 */
  markTabAsModified: (tabId: string, isModified: boolean) => void
  /** 标记标签页为已保存 */
  markTabAsSaved: (tabId: string, fileName?: string) => void
  /** 获取当前激活的标签页 */
  getActiveTab: () => Tab | null
  /** 获取标签页内容 */
  getTabContent: (tabId: string) => string | null
  /** 在当前标签页打开文件（用于空白标签页） */
  openFileInCurrentTab: (tabId: string, fileName: string, content: string, fileId?: string) => void
  /** 重新排序标签页 */
  reorderTabs: (dragIndex: number, hoverIndex: number) => void
}

/**
 * 生成唯一的文件名（用于新建文件）
 */
function generateUniqueFileName(existingTabs: Tab[]): string {
  let index = 1
  let fileName = `未命名-${index}.md`

  while (existingTabs.some((t) => t.fileName === fileName)) {
    index++
    fileName = `未命名-${index}.md`
  }

  return fileName
}

/**
 * 创建 Tabs Store
 */
export const useTabsStore = create<TabsStore>()(
  devtools(
    persist(
      (set, get) => ({
        // ==================== 初始状态 ====================

        tabs: [],
        activeTabId: null,

        // ==================== 操作实现 ====================

        createTab: (fileName?: string, content?: string, isBlank?: boolean) => {
          const { tabs } = get()
          const newTab: Tab = {
            id: nanoid(),
            fileName: fileName || generateUniqueFileName(tabs),
            content: isBlank ? '' : (content || '# 新文档\n\n开始编辑...'),
            isModified: false,
            isNew: !fileName || isBlank,
          }

          set({
            tabs: [...tabs, newTab],
            activeTabId: newTab.id,
          })

          return newTab.id
        },

        openFileInTab: (fileName: string, content: string, fileId?: string) => {
          const { tabs } = get()

          // 优先根据 fileId 查找是否已打开
          if (fileId) {
            const existingTabById = tabs.find((t) => t.fileId === fileId)
            if (existingTabById) {
              set({ activeTabId: existingTabById.id })
              return existingTabById.id
            }
          }

          // 检查是否已经在某个标签页打开（根据文件名）
          const existingTab = tabs.find((t) => t.fileName === fileName && !t.fileId)
          if (existingTab) {
            // 如果找到了未绑定 fileId 的同名标签，更新它的 fileId
            if (fileId) {
              set({
                tabs: tabs.map((t) =>
                  t.id === existingTab.id ? { ...t, fileId } : t
                ),
                activeTabId: existingTab.id,
              })
            } else {
              set({ activeTabId: existingTab.id })
            }
            return existingTab.id
          }

          // 创建新标签页
          const newTab: Tab = {
            id: nanoid(),
            fileName,
            content,
            isModified: false,
            isNew: false,
            fileId: fileId || null,
          }

          set({
            tabs: [...tabs, newTab],
            activeTabId: newTab.id,
          })

          return newTab.id
        },

        findTabByFileId: (fileId: string) => {
          const { tabs } = get()
          return tabs.find((t) => t.fileId === fileId) || null
        },

        updateTabFileId: (tabId: string, fileId: string) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((t) =>
              t.id === tabId ? { ...t, fileId } : t
            ),
          })
        },

        closeTab: (tabId: string) => {
          const { tabs, activeTabId } = get()
          const tabIndex = tabs.findIndex((t) => t.id === tabId)

          if (tabIndex === -1) return

          const newTabs = tabs.filter((t) => t.id !== tabId)

          // 如果关闭的是当前激活的标签页，需要切换到其他标签页
          let newActiveTabId = activeTabId
          if (activeTabId === tabId) {
            if (newTabs.length > 0) {
              // 优先切换到左边的标签页（上一级）
              const newIndex = Math.max(0, tabIndex - 1)
              newActiveTabId = newTabs[newIndex].id
            } else {
              // 所有标签都关闭了，不创建新标签，设置为 null
              newActiveTabId = null
            }
          }

          set({
            tabs: newTabs,
            activeTabId: newActiveTabId,
          })
        },

        closeAllTabs: () => {
          // 关闭所有标签，不创建新标签
          set({
            tabs: [],
            activeTabId: null,
          })
        },

        activateTab: (tabId: string) => {
          const { tabs } = get()
          if (tabs.some((t) => t.id === tabId)) {
            set({ activeTabId: tabId })
          }
        },

        switchToNextTab: () => {
          const { tabs, activeTabId } = get()
          if (tabs.length <= 1 || !activeTabId) return

          const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
          const nextIndex = (currentIndex + 1) % tabs.length
          set({ activeTabId: tabs[nextIndex].id })
        },

        switchToPrevTab: () => {
          const { tabs, activeTabId } = get()
          if (tabs.length <= 1 || !activeTabId) return

          const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
          const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
          set({ activeTabId: tabs[prevIndex].id })
        },

        updateTabContent: (tabId: string, content: string) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((t) =>
              t.id === tabId ? { ...t, content, isModified: true } : t
            ),
          })
        },

        markTabAsModified: (tabId: string, isModified: boolean) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((t) =>
              t.id === tabId ? { ...t, isModified } : t
            ),
          })
        },

        markTabAsSaved: (tabId: string, fileName?: string) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((t) =>
              t.id === tabId
                ? { ...t, isModified: false, isNew: false, fileName: fileName || t.fileName }
                : t
            ),
          })
        },

        getActiveTab: () => {
          const { tabs, activeTabId } = get()
          return tabs.find((t) => t.id === activeTabId) || null
        },

        getTabContent: (tabId: string) => {
          const { tabs } = get()
          const tab = tabs.find((t) => t.id === tabId)
          return tab?.content || null
        },

        openFileInCurrentTab: (tabId: string, fileName: string, content: string, fileId?: string) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((t) =>
              t.id === tabId
                ? { ...t, fileName, content, isModified: false, isNew: false, fileId: fileId || null }
                : t
            ),
          })
        },

        reorderTabs: (dragIndex: number, hoverIndex: number) => {
          const { tabs } = get()
          const newTabs = [...tabs]
          const [draggedTab] = newTabs.splice(dragIndex, 1)
          newTabs.splice(hoverIndex, 0, draggedTab)
          set({ tabs: newTabs })
        },
      }),
      {
        name: 'tabs-store',
        partialize: (state) => ({
          tabs: state.tabs,
          activeTabId: state.activeTabId,
        }),
      }
    ),
    { name: 'TabsStore' }
  )
)
