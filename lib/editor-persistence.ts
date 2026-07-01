import { useDocumentStore } from '@/stores/documentStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useGitStore } from '@/stores/gitStore'
import { useTabsStore } from '@/stores/tabsStore'
import { inferGitFileKind, isGitBinaryFileKind } from '@/lib/git/file-kind'

export function persistMarkdownToActiveSource(
  markdown: string,
  fileName?: string,
  options: { markSaved?: boolean } = {}
) {
  const tabsStore = useTabsStore.getState()
  const activeTab = tabsStore.getActiveTab()
  const markSaved = options.markSaved === true

  if (!activeTab) return false

  const nextFileName = fileName || activeTab.fileName
  const activeGitKind =
    activeTab.gitMeta?.fileKind || (activeTab.gitMeta?.path ? inferGitFileKind(activeTab.gitMeta.path) : 'text')

  if (activeTab.sourceType === 'git' && activeTab.fileId) {
    if (isGitBinaryFileKind(activeGitKind)) {
      return false
    }

    useGitStore.getState().updateDraftContent(activeTab.fileId, markdown)
    useTabsStore.setState((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              fileName: nextFileName,
              content: markdown,
              savedContent: markSaved ? markdown : tab.savedContent,
              isModified: markSaved ? false : true,
              isNew: markSaved ? false : tab.isNew,
            }
          : tab
      ),
    }))

    if (markSaved) {
      useDocumentStore.getState().markAsSaved()
    }
    return true
  }

  if (activeTab.fileId) {
    const fileStore = useFileSystemStore.getState()
    const currentFile = fileStore.files.find((item) => item.id === activeTab.fileId)

    if (nextFileName && currentFile && currentFile.name !== nextFileName) {
      fileStore.renameFile(activeTab.fileId, nextFileName)
    }

    if (markSaved) {
      fileStore.saveFileContent(activeTab.fileId, markdown)
    } else {
      fileStore.saveFile(activeTab.fileId, markdown)
    }

    useTabsStore.setState((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === activeTab.id
          ? {
              ...tab,
              fileName: nextFileName,
              content: markdown,
              savedContent: markSaved ? markdown : tab.savedContent,
              isModified: markSaved ? false : true,
              isNew: markSaved ? false : tab.isNew,
            }
          : tab
      ),
    }))

    if (markSaved) {
      useDocumentStore.getState().markAsSaved()
    }
    return true
  }

  useTabsStore.setState((state) => ({
    tabs: state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? {
            ...tab,
            fileName: nextFileName,
            content: markdown,
            savedContent: markSaved ? markdown : tab.savedContent,
            isModified: markSaved ? false : true,
            isNew: markSaved ? false : tab.isNew,
          }
        : tab
    ),
  }))

  if (markSaved) {
    useDocumentStore.getState().markAsSaved()
  }
  return true
}

export function syncActiveDocumentToActiveSource(options: { markSaved?: boolean } = {}) {
  const tabsStore = useTabsStore.getState()
  const activeTab = tabsStore.getActiveTab()
  const documentStore = useDocumentStore.getState()
  const document = documentStore.document

  if (!activeTab || !document) return false

  const latestMarkdown = documentStore.getCurrentMarkdown()
  return persistMarkdownToActiveSource(latestMarkdown, document.fileName, options)
}

export function persistActiveTabSave() {
  syncActiveDocumentToActiveSource({ markSaved: true })
}

export function discardActiveTabChanges() {
  const tabsStore = useTabsStore.getState()
  const activeTab = tabsStore.getActiveTab()

  if (!activeTab) return

  const discardContent = activeTab.savedContent ?? activeTab.content
  const activeGitKind =
    activeTab.gitMeta?.fileKind || (activeTab.gitMeta?.path ? inferGitFileKind(activeTab.gitMeta.path) : 'text')

  if (activeTab.sourceType === 'git' && activeTab.fileId) {
    if (isGitBinaryFileKind(activeGitKind)) {
      tabsStore.discardTabChanges(activeTab.id)
      return
    }
    useGitStore.getState().updateDraftContent(activeTab.fileId, discardContent)
  }

  if (activeTab.fileId && activeTab.sourceType !== 'git') {
    useFileSystemStore.getState().saveFileContent(activeTab.fileId, discardContent)
  }

  useDocumentStore.getState().loadDocument(discardContent, activeTab.fileName, activeTab.fileId || undefined)
  tabsStore.discardTabChanges(activeTab.id)
  useDocumentStore.getState().markAsSaved()
}
