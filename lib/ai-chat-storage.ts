import { createIdbStore } from './idb'
import type { AiDocAction, AiDocReferenceSnapshot, AiDocTaskType } from './ai-doc-chat'

export type AiConversationStatus = 'active' | 'archived'
export type AiMessageState = 'pending' | 'streaming' | 'done' | 'failed' | 'cancelled'

export interface AiConversationRecord {
  id: string
  title: string
  documentId: string | null
  tabId: string | null
  sourceType: 'local' | 'git' | 'unknown'
  taskType: AiDocTaskType
  status: AiConversationStatus
  providerId: string
  model: string
  createdAt: number
  updatedAt: number
  lastMessageAt: number
  messageCount: number
}

export interface AiMessageRecord {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  state: AiMessageState
  error?: string | null
  action?: AiDocAction | null
  referenceIds: string[]
}

export interface AiReferenceRecord extends AiDocReferenceSnapshot {
  id: string
  conversationId: string
  documentId: string | null
  tabId: string | null
  stale: boolean
  createdAt: number
}

export interface AiDraftRecord {
  conversationId: string
  inputText: string
  taskType: AiDocTaskType
  selectedReferenceIds: string[]
  providerId: string
  model: string
  updatedAt: number
}

export interface AiUiStateRecord {
  key: string
  value: string
  updatedAt: number
}

const conversationsStore = createIdbStore<AiConversationRecord>('visualmd-ai-chat', 'conversations')
const messagesStore = createIdbStore<AiMessageRecord>('visualmd-ai-chat', 'messages')
const referencesStore = createIdbStore<AiReferenceRecord>('visualmd-ai-chat', 'references')
const draftsStore = createIdbStore<AiDraftRecord>('visualmd-ai-chat', 'drafts')
const uiStateStore = createIdbStore<AiUiStateRecord>('visualmd-ai-chat', 'ui_state')

export async function listAiConversations() {
  return (await conversationsStore.getAll()).map((entry) => entry.value).sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function listAiMessages(conversationId: string) {
  return (await messagesStore.getAll())
    .map((entry) => entry.value)
    .filter((message) => message.conversationId === conversationId)
    .sort((left, right) => left.createdAt - right.createdAt)
}

export async function listAiReferences(conversationId: string) {
  return (await referencesStore.getAll())
    .map((entry) => entry.value)
    .filter((reference) => reference.conversationId === conversationId)
    .sort((left, right) => left.createdAt - right.createdAt)
}

export async function getAiDraft(conversationId: string) {
  return draftsStore.get(conversationId)
}

export async function saveAiConversation(record: AiConversationRecord) {
  return conversationsStore.set(record.id, record)
}

export async function saveAiMessage(record: AiMessageRecord) {
  return messagesStore.set(record.id, record)
}

export async function saveAiReference(record: AiReferenceRecord) {
  return referencesStore.set(record.id, record)
}

export async function deleteAiReference(referenceId: string) {
  return referencesStore.remove(referenceId)
}

export async function saveAiDraft(record: AiDraftRecord) {
  return draftsStore.set(record.conversationId, record)
}

export async function saveAiUiState(key: string, value: string) {
  return uiStateStore.set(key, { key, value, updatedAt: Date.now() })
}

export async function getAiUiState(key: string) {
  const record = await uiStateStore.get(key)
  return record?.value ?? null
}

export async function deleteAiConversationCascade(conversationId: string) {
  const messages = await messagesStore.getAll()
  const references = await referencesStore.getAll()

  await conversationsStore.remove(conversationId)
  await draftsStore.remove(conversationId)

  await Promise.all(
    messages
      .map((entry) => entry.value)
      .filter((message) => message.conversationId === conversationId)
      .map((message) => messagesStore.remove(message.id))
  )

  await Promise.all(
    references
      .map((entry) => entry.value)
      .filter((reference) => reference.conversationId === conversationId)
      .map((reference) => referencesStore.remove(reference.id))
  )
}
