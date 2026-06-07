/**
 * Multi-tab state store powered by Zustand.
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { GitFileKind, GitProvider, GitSourceType } from '@/lib/git/types'

export interface Tab {
  id: string
  fileName: string
  content: string
  savedContent?: string
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
    fileKind?: GitFileKind
    mimeType?: string
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
  discardTabChanges: (tabId: string) => void
  getActiveTab: () => Tab | null
  getTabContent: (tabId: string) => string | null
  openFileInCurrentTab: (tabId: string, fileName: string, content: string, fileId?: string) => void
  reorderTabs: (dragIndex: number, hoverIndex: number) => void
}

function generateUniqueFileName(existingTabs: Tab[]): string {
  let index = 1
  let fileName = `未命名${index}.md`

  while (existingTabs.some((tab) => tab.fileName === fileName)) {
    index += 1
    fileName = `未命名${index}.md`
  }

  return fileName
}

function getInitialContent(content?: string, isBlank?: boolean) {
  if (isBlank) return ''
  return content || '# 新文档\n\n开始编辑...'
}

export const useTabsStore = create<TabsStore>()(
  devtools(
    persist(
      (set, get) => ({
        tabs: [],
        activeTabId: null,

        createTab: (fileName?: string, content?: string, isBlank?: boolean) => {
          const { tabs } = get()
          const initialContent = getInitialContent(content, isBlank)
          const newTab: Tab = {
            id: nanoid(),
            fileName: fileName || generateUniqueFileName(tabs),
            content: initialContent,
            savedContent: initialContent,
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
            const existingTabById = tabs.find((tab) => tab.fileId === fileId)
            if (existingTabById) {
              set({ activeTabId: existingTabById.id })
              return existingTabById.id
            }
          }

          const existingTab = tabs.find((tab) => tab.fileName === fileName && !tab.fileId)
          if (existingTab) {
            if (fileId) {
              set({
                tabs: tabs.map((tab) =>
                  tab.id === existingTab.id
                    ? {
                        ...tab,
                        fileId,
                        sourceType: 'local',
                        gitMeta: null,
                        fileName,
                        content,
                        savedContent: tab.savedContent ?? content,
                      }
                    : tab
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
            savedContent: content,
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
                      savedContent: tab.savedContent ?? item.savedContent ?? tab.content,
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
            savedContent: tab.savedContent ?? tab.content,
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
          return tabs.find((tab) => tab.fileId === fileId) || null
        },

        updateTabFileId: (tabId: string, fileId: string) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((tab) =>
              tab.id === tabId ? { ...tab, fileId } : tab
            ),
          })
        },

        closeTab: (tabId: string) => {
          const { tabs, activeTabId } = get()
          const tabIndex = tabs.findIndex((tab) => tab.id === tabId)
          if (tabIndex === -1) return

          const newTabs = tabs.filter((tab) => tab.id !== tabId)
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
          if (tabs.some((tab) => tab.id === tabId)) {
            set({ activeTabId: tabId })
          }
        },

        switchToNextTab: () => {
          const { tabs, activeTabId } = get()
          if (tabs.length <= 1 || !activeTabId) return

          const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
          const nextIndex = (currentIndex + 1) % tabs.length
          set({ activeTabId: tabs[nextIndex].id })
        },

        switchToPrevTab: () => {
          const { tabs, activeTabId } = get()
          if (tabs.length <= 1 || !activeTabId) return

          const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
          const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
          set({ activeTabId: tabs[prevIndex].id })
        },

        updateTabContent: (tabId: string, content: string) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((tab) =>
              tab.id === tabId ? { ...tab, content, isModified: true } : tab
            ),
          })
        },

        markTabAsModified: (tabId: string, isModified: boolean) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((tab) =>
              tab.id === tabId ? { ...tab, isModified } : tab
            ),
          })
        },

        markTabAsSaved: (tabId: string, fileName?: string) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((tab) =>
              tab.id === tabId
                ? {
                    ...tab,
                    isModified: false,
                    isNew: false,
                    fileName: fileName || tab.fileName,
                    savedContent: tab.content,
                  }
                : tab
            ),
          })
        },

        discardTabChanges: (tabId: string) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((tab) =>
              tab.id === tabId
                ? {
                    ...tab,
                    content: tab.savedContent ?? tab.content,
                    isModified: false,
                  }
                : tab
            ),
          })
        },

        getActiveTab: () => {
          const { tabs, activeTabId } = get()
          return tabs.find((tab) => tab.id === activeTabId) || null
        },

        getTabContent: (tabId: string) => {
          const { tabs } = get()
          const tab = tabs.find((item) => item.id === tabId)
          return tab?.content || null
        },

        openFileInCurrentTab: (tabId: string, fileName: string, content: string, fileId?: string) => {
          const { tabs } = get()
          set({
            tabs: tabs.map((tab) =>
              tab.id === tabId
                ? {
                    ...tab,
                    fileName,
                    content,
                    savedContent: content,
                    isModified: false,
                    isNew: false,
                    fileId: fileId || null,
                    sourceType: 'local',
                    gitMeta: null,
                  }
                : tab
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
