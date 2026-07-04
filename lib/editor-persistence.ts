import { useDocumentStore } from '@/stores/documentStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useGitStore } from '@/stores/gitStore'
import { useTabsStore } from '@/stores/tabsStore'
import { inferGitFileKind, isGitBinaryFileKind } from '@/lib/git/file-kind'
import { resolveTabSavedContent } from '@/lib/tab-content'

export function applyMarkdownToDocument(markdown: string, options: { external?: boolean } = {}) {
  const documentStore = useDocumentStore.getState() as {
    getCurrentMarkdown?: () => string
    updateFromMarkdown?: (markdown: string) => boolean
    applyExternalMarkdown?: (markdown: string) => boolean
  }
  const currentMarkdown = typeof documentStore.getCurrentMarkdown === 'function'
    ? documentStore.getCurrentMarkdown()
    : null

  if (currentMarkdown !== null && markdown === currentMarkdown) {
    return true
  }

  const applied = options.external && typeof documentStore.applyExternalMarkdown === 'function'
    ? documentStore.applyExternalMarkdown(markdown)
    : typeof documentStore.updateFromMarkdown === 'function'
      ? documentStore.updateFromMarkdown(markdown)
      : typeof documentStore.applyExternalMarkdown === 'function'
        ? documentStore.applyExternalMarkdown(markdown)
        : false

  if (!applied) {
    return false
  }

  if (
    options.external &&
    typeof documentStore.applyExternalMarkdown !== 'function' &&
    typeof documentStore.updateFromMarkdown === 'function'
  ) {
    useDocumentStore.setState((state) => ({ externalRevision: state.externalRevision + 1 }))
  }

  return true
}

export function persistMarkdownToActiveSource(
  markdown: string,
  fileName?: string,
  options: { markSaved?: boolean; markDocumentSaved?: boolean } = {}
) {
  const tabsStore = useTabsStore.getState()
  const activeTab = tabsStore.getActiveTab()
  const markSaved = options.markSaved === true
  const markDocumentSaved = options.markDocumentSaved ?? markSaved

  if (!activeTab) return false

  const nextFileName = fileName || activeTab.fileName
  const activeGitKind =
    activeTab.gitMeta?.fileKind || (activeTab.gitMeta?.path ? inferGitFileKind(activeTab.gitMeta.path) : 'text')

  const syncTabState = () => {
    if (typeof tabsStore.updateTabContent === 'function') {
      tabsStore.updateTabContent(activeTab.id, markdown)
    }

    if (markSaved) {
      if (typeof tabsStore.markTabAsSaved === 'function') {
        tabsStore.markTabAsSaved(activeTab.id, nextFileName)
      } else if (typeof useTabsStore.setState === 'function') {
        useTabsStore.setState((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === activeTab.id
              ? {
                  ...tab,
                  fileName: nextFileName,
                  content: markdown,
                  savedContent: markdown,
                  isModified: false,
                  isNew: false,
                }
              : tab
          ),
        }))
      }
      return
    }

    if (typeof tabsStore.markTabAsModified === 'function') {
      tabsStore.markTabAsModified(activeTab.id, true)
    } else if (typeof useTabsStore.setState === 'function') {
      useTabsStore.setState((state) => ({
        tabs: state.tabs.map((tab) =>
          tab.id === activeTab.id
            ? {
                ...tab,
                fileName: nextFileName,
                content: markdown,
                isModified: true,
              }
            : tab
        ),
      }))
    }
  }

  if (activeTab.sourceType === 'git' && activeTab.fileId) {
    if (isGitBinaryFileKind(activeGitKind)) {
      return false
    }

    useGitStore.getState().updateDraftContent(activeTab.fileId, markdown)
    syncTabState()

    if (markDocumentSaved) {
      useDocumentStore.getState().markAsSaved()
    }
    return true
  }

  if (activeTab.fileId) {
    const fileStore = useFileSystemStore.getState()
    const currentFiles = Array.isArray((fileStore as { files?: unknown }).files)
      ? (fileStore as { files: Array<{ id: string; name: string }> }).files
      : []
    const currentFile = currentFiles.find((item) => item.id === activeTab.fileId)

    if (nextFileName && currentFile && currentFile.name !== nextFileName) {
      fileStore.renameFile(activeTab.fileId, nextFileName)
    }

    if (markSaved) {
      fileStore.saveFileContent(activeTab.fileId, markdown)
    } else {
      fileStore.saveFile(activeTab.fileId, markdown)
    }

    syncTabState()

    if (markDocumentSaved) {
      useDocumentStore.getState().markAsSaved()
    }
    return true
  }

  syncTabState()

  if (markDocumentSaved) {
    useDocumentStore.getState().markAsSaved()
  }
  return true
}

export function syncActiveDocumentToActiveSource(options: { markSaved?: boolean; markDocumentSaved?: boolean } = {}) {
  const tabsStore = useTabsStore.getState()
  const activeTab = tabsStore.getActiveTab()
  const documentStore = useDocumentStore.getState()
  const document = documentStore.document

  if (!activeTab || !document) return false

  const latestMarkdown = documentStore.getCurrentMarkdown()
  return persistMarkdownToActiveSource(latestMarkdown, document.fileName, options)
}

export function persistActiveTabSave() {
  const activeTab = useTabsStore.getState().getActiveTab()
  if (activeTab?.sourceType === 'git') {
    syncActiveDocumentToActiveSource({ markSaved: true, markDocumentSaved: true })
    return
  }

  syncActiveDocumentToActiveSource({ markSaved: true })
}

export function discardActiveTabChanges() {
  const tabsStore = useTabsStore.getState()
  const activeTab = tabsStore.getActiveTab()

  if (!activeTab) return

  const discardContent = resolveTabSavedContent(activeTab)
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
