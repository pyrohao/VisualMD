import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useGitStore } from '@/stores/gitStore'
import { useTabsStore, type Tab } from '@/stores/tabsStore'

type TabContentSources = {
  gitDrafts?: Record<string, { draftContent: string }>
  localFiles?: Array<{ id: string; content: string }>
}

export function resolveTabCurrentContent(tab?: Tab | null, sources?: TabContentSources) {
  if (!tab) {
    return ''
  }

  if (tab.fileId) {
    if (tab.sourceType === 'git') {
      const draft = sources?.gitDrafts?.[tab.fileId] || useGitStore.getState().drafts[tab.fileId]
      if (draft) {
        return draft.draftContent
      }
    } else {
      const file = (sources?.localFiles || useFileSystemStore.getState().files).find((item) => item.id === tab.fileId)
      if (file) {
        return file.content
      }
    }
  }

  return tab.content || ''
}

export function resolveTabSavedContent(tab?: Tab | null, sources?: TabContentSources) {
  if (!tab) {
    return ''
  }

  if (typeof tab.savedContent === 'string') {
    return tab.savedContent
  }

  return resolveTabCurrentContent(tab, sources)
}

export function syncTabContentFromSource(tab?: Tab | null) {
  if (!tab || !tab.fileId || tab.isTemplate) {
    return
  }

  const currentContent = resolveTabCurrentContent(tab)
  const nextSavedContent = tab.isModified ? tab.savedContent : currentContent

  if (tab.content === currentContent && tab.savedContent === nextSavedContent) {
    return
  }

  useTabsStore.setState((state) => ({
    tabs: state.tabs.map((item) =>
      item.id === tab.id
        ? {
            ...item,
            content: currentContent,
            savedContent: nextSavedContent,
          }
        : item
    ),
  }))
}
