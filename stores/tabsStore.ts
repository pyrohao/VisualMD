/**
 * 多标签页状态管理 - Zustand Store
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { GitProvider, GitSourceType } from '@/lib/git/types'

export interface Tab {
  id: string
  fileName: string
  content: string
  isModified: boolean
  isNew?: boolean
  fileId?: string | null
  templateId?: string | null
  isTemplate?: boolean
  sourceType?: GitSourceType
  gitMeta?: {
    provider: GitProvider
    ownerOrNamespace: string
    repo: string
    branch: string
    path: string
    sha?: string
  } | null
}

interface TabsStore {
  tabs: Tab[]
  activeTabId: string | null
  createTab: (fileName?: string, content?: string, isBlank?: boolean) => string
  openFileInTab: (fileName: string, content: string, fileId?: string) => string
  openGitFileInTab: (tab: Omit<Tab, 'id'>) => string
  findTabByFileId: (fileId: string) => Tab | null
  updateTabFileId: (tabId: string, fileId: string) => void
  closeTab: (tabId: string) => void
  closeAllTabs: () => void
  activateTab: (tabId: string) => void
  switchToNextTab: () => void
  switchToPrevTab: () => void
  updateTabContent: (tabId: string, content: string) => void
  markTabAsModified: (tabId: string, isModified: boolean) => void
  markTabAsSaved: (tabId: string, fileName?: string) => void
  getActiveTab: () => Tab | null
  getTabContent: (tabId: string) => string | null
  openFileInCurrentTab: (tabId: string, fileName: string, content: string, fileId?: string) => void
  reorderTabs: (dragIndex: number, hoverIndex: number) => void
}

function generateUniqueFileName(existingTabs: Tab[]): string {
  let index = 1
  let fileName = `未命名${index}.md`

  while (existingTabs.some((t) => t.fileName === fileName)) {
    index++
    fileName = `未命名${index}.md`
  }

  return fileName
}

export const useTabsStore = create<TabsStore>()(
  devtools(
    persist(
      (set, get) => ({
        tabs: [],
        activeTabId: null,

        createTab: (fileName?: string, content?: string, isBlank?: boolean) => {
          const { tabs } = get()
          const newTab: Tab = {
            id: nanoid(),
            fileName: fileName || generateUniqueFileName(tabs),
            content: isBlank ? '' : content || '# 新文档\n\n开始编辑...',
            isModified: false,
            isNew: !fileName || isBlank,
            sourceType: 'local',
          }

          set({
            tabs: [...tabs, newTab],
            activeTabId: newTab.id,
          })

          return newTab.id
        },

        openFileInTab: (fileName: string, content: string, fileId?: string) => {
          const { tabs } = get()

          if (fileId) {
            const existingTabById = tabs.find((t) => t.fileId === fileId)
            if (existingTabById) {
              set({ activeTabId: existingTabById.id })
              return existingTabById.id
            }
          }

          const existingTab = tabs.find((t) => t.fileName === fileName && !t.fileId)
          if (existingTab) {
            if (fileId) {
              set({
                tabs: tabs.map((t) =>
                  t.id === existingTab.id ? { ...t, fileId, sourceType: 'local', gitMeta: null } : t
                ),
                activeTabId: existingTab.id,
              })
            } else {
              set({ activeTabId: existingTab.id })
            }
            return existingTab.id
          }

          const newTab: Tab = {
            id: nanoid(),
            fileName,
            content,
            isModified: false,
            isNew: false,
            fileId: fileId || null,
            sourceType: 'local',
            gitMeta: null,
          }

          set({
            tabs: [...tabs, newTab],
            activeTabId: newTab.id,
          })

          return newTab.id
        },

        openGitFileInTab: (tab) => {
          const { tabs } = get()
          const existingTab = tab.fileId ? tabs.find((item) => item.fileId === tab.fileId) : null

          if (existingTab) {
            set({
              tabs: tabs.map((item) =>
                item.id === existingTab.id
                  ? {
                      ...item,
                      ...tab,
                      sourceType: 'git',
                      isModified: tab.isModified ?? item.isModified,
                    }
                  : item
              ),
              activeTabId: existingTab.id,
            })
            return existingTab.id
          }

          const newTab: Tab = {
            ...tab,
            id: nanoid(),
            sourceType: 'git',
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
          let newActiveTabId = activeTabId

          if (activeTabId === tabId) {
            if (newTabs.length > 0) {
              const newIndex = Math.max(0, tabIndex - 1)
              newActiveTabId = newTabs[newIndex].id
            } else {
              newActiveTabId = null
            }
          }

          set({
            tabs: newTabs,
            activeTabId: newActiveTabId,
          })
        },

        closeAllTabs: () => {
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
                ? { ...t, fileName, content, isModified: false, isNew: false, fileId: fileId || null, sourceType: 'local', gitMeta: null }
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
      }
    ),
    { name: 'TabsStore' }
  )
)
