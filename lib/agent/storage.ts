import { nanoid } from 'nanoid'
import { createIdbStore } from '@/lib/idb'
import type { AgentConversation, AgentDraft, AgentMessage, AgentReferenceRecord, AgentUiState } from './types'

const DB_NAME = 'visualmd-agent'
const conversationsStore = createIdbStore<AgentConversation>(DB_NAME, 'conversations')
const messagesStore = createIdbStore<AgentMessage>(DB_NAME, 'messages')
const referencesStore = createIdbStore<AgentReferenceRecord>(DB_NAME, 'references')
const draftsStore = createIdbStore<AgentDraft>(DB_NAME, 'drafts')
const uiStateStore = createIdbStore<AgentUiState>(DB_NAME, 'ui_state')

export function createAgentConversationId() {
  return nanoid()
}

export async function listAgentConversations() {
  return (await conversationsStore.getAll())
    .map((entry) => entry.value)
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function listAgentMessages(conversationId: string) {
  return (await messagesStore.getAll())
    .map((entry) => entry.value)
    .filter((message) => message.conversationId === conversationId)
    .sort((left, right) => left.createdAt - right.createdAt)
}

export async function saveAgentConversation(record: AgentConversation) {
  return conversationsStore.set(record.id, record)
}

export async function saveAgentMessage(record: AgentMessage) {
  return messagesStore.set(record.id, record)
}

export async function saveAgentMessages(records: AgentMessage[]) {
  await Promise.all(records.map((record) => saveAgentMessage(record)))
}

export async function listAgentReferences(conversationId: string) {
  return (await referencesStore.getAll())
    .map((entry) => entry.value)
    .filter((reference) => reference.conversationId === conversationId)
    .sort((left, right) => left.createdAt - right.createdAt)
}

export async function saveAgentReference(record: AgentReferenceRecord) {
  return referencesStore.set(record.id, record)
}

export async function deleteAgentReference(referenceId: string) {
  return referencesStore.remove(referenceId)
}

export async function saveAgentDraft(record: AgentDraft) {
  return draftsStore.set(record.conversationId, record)
}

export async function getAgentDraft(conversationId: string) {
  return draftsStore.get(conversationId)
}

export async function listAgentDrafts() {
  return (await draftsStore.getAll()).map((entry) => entry.value)
}

export async function deleteAgentConversation(conversationId: string) {
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

export async function saveAgentUiState(key: string, value: string) {
  return uiStateStore.set(key, { key, value, updatedAt: Date.now() })
}

export async function getAgentUiState(key: string) {
  const record = await uiStateStore.get(key)
  return record?.value ?? null
}
