import { nanoid } from 'nanoid'
import { createIdbStore } from '@/lib/idb'
import type {
  AgentConversation,
  AgentDocumentSessionRecord,
  AgentDraft,
  AgentExecutionTargetRecord,
  AgentMessage,
  AgentReferenceRecord,
  AgentUiState,
} from './types'

const DB_NAME = 'visualmd-agent'
const conversationsStore = createIdbStore<AgentConversation>(DB_NAME, 'conversations')
const messagesStore = createIdbStore<AgentMessage[]>(DB_NAME, 'messages')
const referencesStore = createIdbStore<AgentReferenceRecord>(DB_NAME, 'references')
const draftsStore = createIdbStore<AgentDraft>(DB_NAME, 'drafts')
const uiStateStore = createIdbStore<AgentUiState>(DB_NAME, 'ui_state')
const documentSessionsStore = createIdbStore<AgentDocumentSessionRecord>(DB_NAME, 'document_sessions')
const executionTargetsStore = createIdbStore<AgentExecutionTargetRecord>(DB_NAME, 'execution_targets')

export function createAgentConversationId() {
  return nanoid()
}

export async function listAgentConversations() {
  return (await conversationsStore.getAll())
    .map((entry) => entry.value)
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function listAgentMessages(conversationId: string) {
  return ((await messagesStore.get(conversationId)) || [])
    .sort((left, right) => left.createdAt - right.createdAt)
}

export async function saveAgentConversation(record: AgentConversation) {
  return conversationsStore.set(record.id, record)
}

export async function saveAgentMessage(record: AgentMessage) {
  const messages = await listAgentMessages(record.conversationId)
  const nextMessages = [
    ...messages.filter((message) => message.id !== record.id),
    record,
  ].sort((left, right) => left.createdAt - right.createdAt)
  return messagesStore.set(record.conversationId, nextMessages)
}

export async function saveAgentMessages(records: AgentMessage[]) {
  const recordsByConversation = new Map<string, AgentMessage[]>()
  records.forEach((record) => {
    recordsByConversation.set(record.conversationId, [
      ...(recordsByConversation.get(record.conversationId) || []),
      record,
    ])
  })

  await Promise.all(Array.from(recordsByConversation.entries()).map(async ([conversationId, conversationRecords]) => {
    const messages = await listAgentMessages(conversationId)
    const nextById = new Map(messages.map((message) => [message.id, message]))
    conversationRecords.forEach((message) => nextById.set(message.id, message))
    await messagesStore.set(
      conversationId,
      Array.from(nextById.values()).sort((left, right) => left.createdAt - right.createdAt)
    )
  }))
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
  const references = await referencesStore.getAll()
  await conversationsStore.remove(conversationId)
  await draftsStore.remove(conversationId)
  await messagesStore.remove(conversationId)
  await documentSessionsStore.remove(conversationId)
  await executionTargetsStore.remove(conversationId)
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

export async function saveAgentDocumentSession(record: AgentDocumentSessionRecord) {
  return documentSessionsStore.set(record.conversationId, record)
}

export async function getAgentDocumentSession(conversationId: string) {
  return documentSessionsStore.get(conversationId)
}

export async function deleteAgentDocumentSession(conversationId: string) {
  return documentSessionsStore.remove(conversationId)
}

export async function listAgentDocumentSessions() {
  return (await documentSessionsStore.getAll())
    .map((entry) => entry.value)
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function saveAgentExecutionTarget(record: AgentExecutionTargetRecord) {
  return executionTargetsStore.set(record.conversationId, record)
}

export async function getAgentExecutionTarget(conversationId: string) {
  return executionTargetsStore.get(conversationId)
}

export async function deleteAgentExecutionTarget(conversationId: string) {
  return executionTargetsStore.remove(conversationId)
}

export async function listAgentExecutionTargets() {
  return (await executionTargetsStore.getAll())
    .map((entry) => entry.value)
    .sort((left, right) => right.updatedAt - left.updatedAt)
}
