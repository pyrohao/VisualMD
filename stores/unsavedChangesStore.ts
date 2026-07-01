import { create } from 'zustand'
import { discardActiveTabChanges, persistActiveTabSave } from '@/lib/editor-persistence'
import { useDocumentStore } from './documentStore'
import { useTabsStore } from './tabsStore'

type EditorHandler = {
  dirty: boolean
  save?: () => void | Promise<void>
  discard?: () => void | Promise<void>
}

interface UnsavedChangesStore {
  editors: Record<string, EditorHandler>
  dialogOpen: boolean
  pendingTargetLabel: string | null
  pendingAction: (() => void | Promise<void>) | null
  registerEditor: (
    id: string,
    handlers: Pick<EditorHandler, 'save' | 'discard'>
  ) => void
  unregisterEditor: (id: string) => void
  setEditorDirty: (id: string, dirty: boolean) => void
  hasDirtyEditors: () => boolean
  hasUnsavedChanges: () => boolean
  requestNavigation: (
    action: () => void | Promise<void>,
    targetLabel?: string | null
  ) => Promise<void>
  confirmSaveAndContinue: () => Promise<void>
  discardAndContinue: () => Promise<void>
  cancelNavigation: () => void
}

async function runPendingEditors(mode: 'save' | 'discard') {
  const editors = Object.entries(useUnsavedChangesStore.getState().editors)

  for (const [, editor] of editors) {
    if (!editor.dirty) continue
    const handler = mode === 'save' ? editor.save : editor.discard
    if (handler) {
      await handler()
    }
  }
}

async function flushPendingMarkdownPreviewSaveIfNeeded() {
  const activeTab = useTabsStore.getState().getActiveTab()
  const documentStoreState = useDocumentStore.getState() as {
    getIsModified?: () => boolean
    document?: { isModified?: boolean } | null
  }
  const documentModified = typeof documentStoreState.getIsModified === 'function'
    ? documentStoreState.getIsModified()
    : Boolean(documentStoreState.document?.isModified)

  if (!activeTab?.isModified || documentModified) {
    return
  }

  const markdownPreviewSave = useUnsavedChangesStore.getState().editors['markdown-preview']?.save
  if (markdownPreviewSave) {
    await markdownPreviewSave()
  }
}

export const useUnsavedChangesStore = create<UnsavedChangesStore>((set, get) => ({
  editors: {},
  dialogOpen: false,
  pendingTargetLabel: null,
  pendingAction: null,

  registerEditor: (id, handlers) => {
    set((state) => ({
      editors: {
        ...state.editors,
        [id]: {
          dirty: state.editors[id]?.dirty ?? false,
          ...handlers,
        },
      },
    }))
  },

  unregisterEditor: (id) => {
    set((state) => {
      const nextEditors = { ...state.editors }
      delete nextEditors[id]
      return { editors: nextEditors }
    })
  },

  setEditorDirty: (id, dirty) => {
    set((state) => ({
      editors: {
        ...state.editors,
        [id]: {
          ...state.editors[id],
          dirty,
        },
      },
    }))
  },

  hasDirtyEditors: () => Object.values(get().editors).some((editor) => editor.dirty),

  hasUnsavedChanges: () => {
    const activeTab = useTabsStore.getState().getActiveTab()
    return Boolean(activeTab?.isModified || get().hasDirtyEditors())
  },

  requestNavigation: async (action, targetLabel) => {
    if (!get().hasUnsavedChanges()) {
      await action()
      return
    }

    set({
      dialogOpen: true,
      pendingAction: action,
      pendingTargetLabel: targetLabel || null,
    })
  },

  confirmSaveAndContinue: async () => {
    const action = get().pendingAction
    const documentStoreState = useDocumentStore.getState() as {
      getIsModified?: () => boolean
      document?: { isModified?: boolean } | null
    }

    await saveDirtyEditors()
    const documentModified = typeof documentStoreState.getIsModified === 'function'
      ? documentStoreState.getIsModified()
      : Boolean(documentStoreState.document?.isModified)
    if (documentModified) {
      persistActiveTabSave()
    }

    set({
      dialogOpen: false,
      pendingAction: null,
      pendingTargetLabel: null,
    })

    if (action) {
      await action()
    }
  },

  discardAndContinue: async () => {
    const action = get().pendingAction

    await runPendingEditors('discard')
    discardActiveTabChanges()

    set({
      dialogOpen: false,
      pendingAction: null,
      pendingTargetLabel: null,
    })

    if (action) {
      await action()
    }
  },

  cancelNavigation: () => {
    set({
      dialogOpen: false,
      pendingAction: null,
      pendingTargetLabel: null,
    })
  },
}))

export async function requestNavigationWithUnsavedGuard(
  action: () => void | Promise<void>,
  targetLabel?: string | null
) {
  await useUnsavedChangesStore.getState().requestNavigation(action, targetLabel)
}

export function hasUnsavedChanges() {
  return useUnsavedChangesStore.getState().hasUnsavedChanges()
}

export async function saveDirtyEditors() {
  await runPendingEditors('save')
  await flushPendingMarkdownPreviewSaveIfNeeded()
}

export async function discardDirtyEditors() {
  await runPendingEditors('discard')
}
