import { useDocumentStore } from '@/stores/documentStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useGitStore } from '@/stores/gitStore'
import { useTabsStore } from '@/stores/tabsStore'
import { inferGitFileKind, isGitBinaryFileKind } from '@/lib/git/file-kind'

export function syncActiveDocumentToActiveSource(options: { markSaved?: boolean } = {}) {
  const tabsStore = useTabsStore.getState()
  const activeTab = tabsStore.getActiveTab()
  const documentStore = useDocumentStore.getState()
  const document = documentStore.document

  if (!activeTab || !document) return false

  const latestMarkdown = documentStore.getCurrentMarkdown()
  const activeGitKind =
    activeTab.gitMeta?.fileKind || (activeTab.gitMeta?.path ? inferGitFileKind(activeTab.gitMeta.path) : 'text')

  if (activeTab.sourceType === 'git' && activeTab.fileId) {
    if (isGitBinaryFileKind(activeGitKind)) {
      return false
    }
    useGitStore.getState().updateDraftContent(activeTab.fileId, latestMarkdown)
    tabsStore.updateTabContent(activeTab.id, latestMarkdown)
    if (options.markSaved) {
      tabsStore.markTabAsSaved(activeTab.id, document.fileName)
      documentStore.markAsSaved()
    } else {
      tabsStore.markTabAsModified(activeTab.id, true)
    }
    return true
  }

  if (activeTab.fileId) {
    const fileStore = useFileSystemStore.getState()
    const currentFile = fileStore.files.find((item) => item.id === activeTab.fileId)

    if (document.fileName && currentFile && currentFile.name !== document.fileName) {
      fileStore.renameFile(activeTab.fileId, document.fileName)
    }

    if (options.markSaved) {
      fileStore.saveFileContent(activeTab.fileId, latestMarkdown)
    } else {
      fileStore.saveFile(activeTab.fileId, latestMarkdown)
    }
    tabsStore.updateTabContent(activeTab.id, latestMarkdown)
    if (options.markSaved) {
      tabsStore.markTabAsSaved(activeTab.id, document.fileName)
      documentStore.markAsSaved()
    } else {
      tabsStore.markTabAsModified(activeTab.id, true)
    }
    return true
  }

  tabsStore.updateTabContent(activeTab.id, latestMarkdown)
  if (options.markSaved) {
    tabsStore.markTabAsSaved(activeTab.id, document.fileName)
    documentStore.markAsSaved()
  } else {
    tabsStore.markTabAsModified(activeTab.id, true)
  }
  return true
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
