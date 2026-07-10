import { createIdbStore } from '@/lib/idb'
export interface NodePosition {
  x: number
  y: number
}

export interface EditorState {
  fileId: string
  nodePositions: Record<string, NodePosition>
  expandedNodeIds: string[]
  lastModified: number
  version: number
}

const STATE_VERSION = 1
const STORAGE_KEY_PREFIX = 'markdown-editor:state:'
const editorStateStore = createIdbStore<EditorState>('visualmd-workspace', 'editor-states')
const editorStateCache = new Map<string, EditorState | null>()

function getStorageKey(fileId: string) {
  return `${STORAGE_KEY_PREFIX}${fileId}`
}

function normalizeEditorState(state: EditorState): EditorState {
  return {
    ...state,
    version: state.version || STATE_VERSION,
    nodePositions: state.nodePositions || {},
    expandedNodeIds: Array.isArray(state.expandedNodeIds) ? state.expandedNodeIds : [],
  }
}

function readLegacyState(fileId: string) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const data = window.localStorage.getItem(getStorageKey(fileId))
    if (!data) {
      return null
    }

    return normalizeEditorState(JSON.parse(data) as EditorState)
  } catch (error) {
    console.error('Failed to load legacy editor state:', error)
    return null
  }
}

function removeLegacyState(fileId: string) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(getStorageKey(fileId))
  } catch (error) {
    console.error('Failed to delete legacy editor state:', error)
  }
}

export function saveEditorState(state: EditorState): void {
  const normalizedState = normalizeEditorState({
    ...state,
    lastModified: Date.now(),
  })
  editorStateCache.set(normalizedState.fileId, normalizedState)

  void editorStateStore.set(normalizedState.fileId, normalizedState).catch((error) => {
    console.error('Failed to save editor state:', error)
  })
}

export async function loadEditorState(fileId: string): Promise<EditorState | null> {
  const cachedState = editorStateCache.get(fileId)
  if (cachedState !== undefined) {
    return cachedState
  }

  try {
    const indexedState = await editorStateStore.get(fileId)
    if (indexedState) {
      const normalizedState = normalizeEditorState(indexedState)
      editorStateCache.set(fileId, normalizedState)
      return normalizedState
    }
  } catch (error) {
    console.error('Failed to load editor state from IndexedDB:', error)
  }

  const legacyState = readLegacyState(fileId)
  if (legacyState) {
    editorStateCache.set(fileId, legacyState)
    void editorStateStore.set(fileId, legacyState).then(() => {
      removeLegacyState(fileId)
    }).catch((error) => {
      console.error('Failed to migrate legacy editor state:', error)
    })
    return legacyState
  }

  editorStateCache.set(fileId, null)
  return null
}

export function deleteEditorState(fileId: string): void {
  editorStateCache.delete(fileId)
  removeLegacyState(fileId)

  void editorStateStore.remove(fileId).catch((error) => {
    console.error('Failed to delete editor state:', error)
  })
}

export function createEditorState(fileId: string): EditorState {
  return {
    fileId,
    nodePositions: {},
    expandedNodeIds: ['root'],
    lastModified: Date.now(),
    version: STATE_VERSION,
  }
}

export async function cleanupExpiredStates(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
  const now = Date.now()

  try {
    const entries = await editorStateStore.getAll()
    await Promise.all(entries.map(async ({ key, value }) => {
      const normalizedState = normalizeEditorState(value)
      if (now - normalizedState.lastModified > maxAge) {
        editorStateCache.delete(key)
        await editorStateStore.remove(key)
      }
    }))
  } catch (error) {
    console.error('Failed to cleanup expired editor states:', error)
  }
}

export async function getAllStoredFileIds(): Promise<string[]> {
  try {
    const entries = await editorStateStore.getAll()
    return entries.map((entry) => entry.key)
  } catch (error) {
    console.error('Failed to get stored file IDs:', error)
    return []
  }
}
