'use client'

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import {
  createAgentConversationId,
  createDefaultAgentTools,
  deleteAgentConversation,
  deleteAgentExecutionTarget,
  deleteAgentReference,
  deleteAgentDocumentSession,
  getAgentExecutionTarget,
  getAgentDraft,
  getAgentDocumentSession,
  getAgentUiState,
  listAgentConversations,
  listAgentDocumentSessions,
  listAgentExecutionTargets,
  listAgentMessages,
  listAgentReferences,
  runAgentReActLoop,
  saveAgentConversation,
  saveAgentDocumentSession,
  saveAgentDraft,
  saveAgentExecutionTarget,
  saveAgentMessage,
  saveAgentMessages,
  saveAgentReference,
  saveAgentUiState,
  splitAssistantThinking,
  type AgentConversation,
  type AgentDocumentSessionRecord,
  type AgentDraft,
  type AgentExecutionTargetRecord,
  type AgentMessage,
} from '@/lib/agent'
import {
  createReferenceSnapshot,
  deriveConversationTitle,
  type AiDocReferenceSnapshot,
  type AiDocTaskType,
} from '@/lib/ai-doc-chat'
import { useAiDockStore } from './aiDockStore'
import { useDocumentStore } from './documentStore'
import { useFileSystemStore } from './fileSystemStore'
import { useGitStore } from './gitStore'
import { useHistoryStore } from './historyStore'
import { useSettingsStore } from './settingsStore'
import { useTabsStore } from './tabsStore'
import { saveDirtyEditors } from './unsavedChangesStore'
import {
  AI_DOCUMENT_EDIT_HISTORY_DESCRIPTION,
  AI_DOCUMENT_UNDO_HISTORY_DESCRIPTION,
} from '@/lib/ai-document-history'
import { applyMarkdownToDocument, persistMarkdownToActiveSource } from '@/lib/editor-persistence'
import { joinGitPath, normalizeGitPath } from '@/lib/git/utils'

export type AiReferenceRecord = AiDocReferenceSnapshot & {
  id: string
  conversationId: string
  documentId: string | null
  tabId: string | null
  sourceType?: 'local' | 'git' | 'unknown'
  stale: boolean
  createdAt: number
}

type DocumentIdentity = {
  documentId: string | null
  tabId: string | null
  sourceType: 'local' | 'git' | 'unknown'
}

type GeneratedDocumentStatus = 'streaming' | 'ready' | 'failed'

type GeneratedDocumentSession = {
  conversationId: string
  toolCallId: string
  fileName: string
  content: string
  tempFileId: string | null
  tempTabId: string | null
  gitTargetDirectory: string | null
  status: GeneratedDocumentStatus
  error: string | null
  createdAt: number
  updatedAt: number
}

type GeneratedDocumentPreviewSyncState = {
  timeoutId: ReturnType<typeof setTimeout> | null
  pendingContent: string | null
  lastAppliedAt: number
}

type UiConversationRecord = AgentConversation & {
  taskType: AiDocTaskType
  status: 'active'
  providerId: string
  model: string
  lastMessageAt: number
}

type VisibleAgentMessage = AgentMessage & {
  displayMessage?: string
  thinking?: string
}

export interface ToolUndoRecord {
  id: string
  conversationId: string
  toolCallId: string
  documentId: string | null
  tabId: string | null
  sourceType: 'local' | 'git' | 'unknown'
  fileName?: string | null
  previousMarkdown: string
  appliedMarkdown: string
  createdAt: number
  state: 'available' | 'undone' | 'dismissed'
}

interface AiChatStore {
  conversations: UiConversationRecord[]
  currentConversationId: string | null
  messagesByConversation: Record<string, AgentMessage[]>
  visibleMessagesByConversation: Record<string, VisibleAgentMessage[]>
  toolUndoStackByConversation: Record<string, ToolUndoRecord[]>
  referencesByConversation: Record<string, AiReferenceRecord[]>
  draftsByConversation: Record<string, AgentDraft>
  executionTargetsByConversation: Record<string, DocumentIdentity>
  generatedDocumentSessionsByConversation: Record<string, GeneratedDocumentSession>
  taskType: AiDocTaskType
  selectionCandidate: AiDocReferenceSnapshot | null
  draftInput: string
  selectedReferenceIds: string[]
  sendingConversationIds: string[]
  sendingStatus: string | null
  sendingConversationId: string | null
  chatTemperature: number
  chatMaxTokens: number
  chatHistoryRounds: number
  isLoading: boolean
  isSending: boolean
  error: string | null
  initialize: () => Promise<void>
  openConversation: (conversationId: string) => Promise<void>
  leaveConversation: () => Promise<void>
  createConversation: () => Promise<string | null>
  removeConversation: (conversationId: string) => Promise<void>
  renameConversation: (conversationId: string, title: string) => Promise<void>
  setDraftInput: (value: string) => Promise<void>
  setTaskType: (taskType: AiDocTaskType) => Promise<void>
  addEditorSelectionReference: (
    selectionStart: number,
    selectionEnd: number,
    markdownOverride?: string,
    versionOverride?: number
  ) => Promise<void>
  commitSelectionCandidate: () => Promise<boolean>
  clearSelectionCandidate: () => void
  removeReference: (referenceId: string) => Promise<void>
  sendMessage: () => Promise<void>
  stopSending: () => void
  setChatTemperature: (value: number) => Promise<void>
  setChatMaxTokens: (value: number) => Promise<void>
  setChatHistoryRounds: (value: number) => Promise<void>
  resolveGeneratedDocumentGitOffer: (conversationId: string, shouldStageToGit: boolean) => Promise<boolean>
  clearGeneratedDocumentSession: (conversationId: string) => void
  undoLastToolApply: () => Promise<boolean>
  dismissLastToolApply: () => void
  syncToolUndoStackWithMarkdown: (markdown: string) => void
}

const abortControllerByConversation = new Map<string, AbortController>()
const activeRunIdByConversation = new Map<string, string>()
const GENERATED_DOCUMENT_PREVIEW_THROTTLE_MS = 1500

function beginConversationRun(conversationId: string) {
  abortControllerByConversation.get(conversationId)?.abort()
  const controller = new AbortController()
  const runId = nanoid()
  abortControllerByConversation.set(conversationId, controller)
  activeRunIdByConversation.set(conversationId, runId)
  return { controller, runId }
}

function isConversationRunActive(conversationId: string, runId: string) {
  return activeRunIdByConversation.get(conversationId) === runId
}

function finishConversationRun(conversationId: string, runId: string) {
  if (!isConversationRunActive(conversationId, runId)) {
    return false
  }

  activeRunIdByConversation.delete(conversationId)
  abortControllerByConversation.delete(conversationId)
  return true
}

function isGitCreationAvailable() {
  const gitState = useGitStore.getState()
  return Boolean(gitState.connected && gitState.config.repo && gitState.config.branch)
}

function getCurrentDocumentIdentity() {
  const activeTab = useTabsStore.getState().getActiveTab()
  return normalizeDocumentIdentity({
    tabId: activeTab?.id || null,
    documentId: activeTab?.fileId || null,
    sourceType: activeTab?.sourceType || 'unknown',
  })
}

function normalizeDocumentIdentity(identity?: Partial<DocumentIdentity> | null): DocumentIdentity {
  return {
    documentId: typeof identity?.documentId === 'string' ? identity.documentId : null,
    tabId: typeof identity?.tabId === 'string' ? identity.tabId : null,
    sourceType:
      identity?.sourceType === 'local' || identity?.sourceType === 'git'
        ? identity.sourceType
        : 'unknown',
  }
}

function hasDocumentIdentity(identity?: Partial<DocumentIdentity> | null): identity is DocumentIdentity {
  return Boolean(identity?.documentId)
}

function getOpenTabForIdentity(identity?: Partial<DocumentIdentity> | null) {
  const normalized = normalizeDocumentIdentity(identity)
  const tabsState = useTabsStore.getState() as typeof useTabsStore extends { getState: () => infer T } ? T : never
  const activeTab = typeof (tabsState as { getActiveTab?: () => unknown }).getActiveTab === 'function'
    ? (tabsState as { getActiveTab: () => { id: string; fileId?: string | null; sourceType?: string } | null }).getActiveTab()
    : null

  if (
    activeTab?.fileId === normalized.documentId &&
    (normalized.sourceType === 'unknown' || (activeTab.sourceType || 'unknown') === normalized.sourceType)
  ) {
    return activeTab
  }

  const tabs = Array.isArray((tabsState as { tabs?: unknown[] }).tabs)
    ? ((tabsState as { tabs?: Array<{ id: string; fileId?: string | null; sourceType?: string }> }).tabs || [])
    : []

  if (normalized.tabId) {
    const matchedById = tabs.find((tab) => tab.id === normalized.tabId) || null
    if (matchedById) {
      return matchedById
    }
  }

  if (!normalized.documentId) {
    return null
  }

  if (typeof (tabsState as { findTabByFileId?: (fileId: string) => unknown }).findTabByFileId === 'function') {
    const matched = (tabsState as { findTabByFileId: (fileId: string) => unknown }).findTabByFileId(normalized.documentId)
    if (matched) {
      return matched as typeof tabs[number]
    }
  }

  return tabs.find((tab) =>
    tab.fileId === normalized.documentId &&
    (normalized.sourceType === 'unknown' || (tab.sourceType || 'unknown') === normalized.sourceType)
  ) || null
}

function resolveMarkdownForIdentity(identity?: Partial<DocumentIdentity> | null) {
  const normalized = normalizeDocumentIdentity(identity)
  if (!normalized.documentId) {
    return ''
  }

  const tabsState = useTabsStore.getState()
  const activeTab = tabsState.getActiveTab()
  if (
    activeTab?.fileId === normalized.documentId &&
    normalizeDocumentIdentity(activeTab).sourceType === normalized.sourceType
  ) {
    return useDocumentStore.getState().getCurrentMarkdown()
  }

  const targetTab = getOpenTabForIdentity(normalized) as {
    content?: string
    isModified?: boolean
    sourceType?: string
  } | null
  if (targetTab && typeof targetTab.content === 'string' && (targetTab.isModified || normalized.sourceType === 'unknown')) {
    return targetTab.content
  }

  const gitDraft = useGitStore.getState().drafts[normalized.documentId]
  if (gitDraft) {
    return gitDraft.draftContent
  }

  const localFiles = Array.isArray((useFileSystemStore.getState() as { files?: unknown }).files)
    ? ((useFileSystemStore.getState() as { files: Array<{ id: string; content: string }> }).files || [])
    : []
  const localFile = localFiles.find((item) => item.id === normalized.documentId)
  return localFile?.content || targetTab?.content || ''
}

function resolveFileNameForIdentity(identity?: Partial<DocumentIdentity> | null) {
  const normalized = normalizeDocumentIdentity(identity)
  if (!normalized.documentId) {
    return null
  }

  if (
    isIdentityCurrentlyActive(normalized) &&
    useDocumentStore.getState().document?.fileName
  ) {
    return useDocumentStore.getState().document?.fileName || null
  }

  const targetTab = getOpenTabForIdentity(normalized) as { fileName?: string } | null
  if (targetTab?.fileName) {
    return targetTab.fileName
  }

  const gitDraft = useGitStore.getState().drafts[normalized.documentId]
  if (gitDraft?.name) {
    return gitDraft.name
  }

  const localFiles = Array.isArray((useFileSystemStore.getState() as { files?: unknown }).files)
    ? ((useFileSystemStore.getState() as { files: Array<{ id: string; name: string }> }).files || [])
    : []
  const localFile = localFiles.find((item) => item.id === normalized.documentId)
  return localFile?.name || null
}

function isIdentityCurrentlyActive(identity?: Partial<DocumentIdentity> | null) {
  const normalized = normalizeDocumentIdentity(identity)
  if (!normalized.documentId) {
    return false
  }

  const activeTab = useTabsStore.getState().getActiveTab()
  const activeIdentity = normalizeDocumentIdentity(activeTab)
  return activeTab?.fileId === normalized.documentId && activeIdentity.sourceType === normalized.sourceType
}

function documentIdentityExists(identity?: Partial<DocumentIdentity> | null) {
  const normalized = normalizeDocumentIdentity(identity)
  if (!normalized.documentId) {
    return false
  }

  if (isIdentityCurrentlyActive(normalized) || getOpenTabForIdentity(normalized)) {
    return true
  }

  if (normalized.sourceType === 'git') {
    return Boolean(useGitStore.getState().drafts[normalized.documentId])
  }

  const fileSystemState = useFileSystemStore.getState() as { files?: Array<{ id: string }> }
  return (fileSystemState.files || []).some((file) => file.id === normalized.documentId)
}

function toExecutionTargetRecord(
  conversationId: string,
  identity?: Partial<DocumentIdentity> | null
): AgentExecutionTargetRecord | null {
  const normalized = normalizeDocumentIdentity(identity)
  if (!normalized.documentId) {
    return null
  }

  return {
    conversationId,
    documentId: normalized.documentId,
    tabId: normalized.tabId,
    sourceType: normalized.sourceType,
    updatedAt: Date.now(),
  }
}

function fromExecutionTargetRecord(record?: AgentExecutionTargetRecord | null) {
  return normalizeDocumentIdentity(record)
}

function toUiConversation(conversation: AgentConversation): UiConversationRecord {
  const settings = useSettingsStore.getState()
  const providerConfig = settings.getActiveProviderConfig()
  return {
    ...conversation,
    taskType: 'ask',
    status: 'active',
    providerId: providerConfig.id,
    model: providerConfig.model,
    lastMessageAt: conversation.updatedAt,
  }
}

function getDisplayMessage(message: AgentMessage) {
  const visibleMessage = message as VisibleAgentMessage
  if (typeof visibleMessage.displayMessage === 'string') {
    return visibleMessage.displayMessage
  }

  if (message.role === 'user') {
    const match = message.message.match(/User request:\n([\s\S]*?)\n\nSelected document text:/)
    return match?.[1]?.trim() || message.message
  }

  return message.message
}

function isVisibleMessage(message: AgentMessage) {
  if (message.role === 'user') {
    return Boolean(getDisplayMessage(message).trim())
  }

  return message.role === 'assistant' &&
    !message.toolName &&
    (message.state === 'done' || message.state === 'pending') &&
    (message.state === 'pending' || Boolean(getDisplayMessage(message).trim())) &&
    !getDisplayMessage(message).trim().startsWith('{')
}

function getVisibleMessages(messages: AgentMessage[]): VisibleAgentMessage[] {
  const visibleMessages = messages.filter(isVisibleMessage).map((message) => {
    const displaySource = getDisplayMessage(message)
    const parsed = message.role === 'assistant'
      ? splitAssistantThinking(displaySource)
      : { text: displaySource, thinking: '' }

    return {
      ...message,
      displayMessage: parsed.text,
      thinking: message.role === 'assistant' ? parsed.thinking : undefined,
    }
  })

  return visibleMessages.reduce<VisibleAgentMessage[]>((accumulator, message) => {
    const previousMessage = accumulator.at(-1)
    if (
      previousMessage &&
      previousMessage.role === 'assistant' &&
      message.role === 'assistant'
    ) {
      const mergedDisplayMessage = [
        previousMessage.displayMessage || previousMessage.message,
        message.displayMessage || message.message,
      ]
        .filter(Boolean)
        .join('\n\n')
      const mergedThinking = [
        previousMessage.thinking || '',
        message.thinking || '',
      ]
        .filter(Boolean)
        .join('\n\n')

      accumulator[accumulator.length - 1] = {
        ...message,
        id: previousMessage.id,
        createdAt: previousMessage.createdAt,
        message: mergedDisplayMessage,
        displayMessage: mergedDisplayMessage,
        thinking: mergedThinking || undefined,
      }
      return accumulator
    }

    accumulator.push(message)
    return accumulator
  }, [])
}

function createToolUndoRecord(args: {
  conversationId: string
  toolCallId: string
  identity: DocumentIdentity
  fileName?: string | null
  previousMarkdown: string
  appliedMarkdown: string
}) {
  return {
    id: `tool-undo-${args.toolCallId}`,
    conversationId: args.conversationId,
    toolCallId: args.toolCallId,
    documentId: args.identity.documentId,
    tabId: args.identity.tabId,
    sourceType: args.identity.sourceType,
    fileName: args.fileName || null,
    previousMarkdown: args.previousMarkdown,
    appliedMarkdown: args.appliedMarkdown,
    createdAt: Date.now(),
    state: 'available',
  } satisfies ToolUndoRecord
}

function formatAgentError(error: unknown) {
  const message = error instanceof Error ? error.message : 'AI request failed'
  const lower = message.toLowerCase()

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return '请求被限流，请稍后重试。'
  }

  if (lower.includes('503')) {
    return 'AI 服务暂时不可用（503），请稍后重试。'
  }

  if (lower.includes('500')) {
    return 'AI 服务内部错误（500），请稍后重试。'
  }

  if (lower.includes('cors') || lower.includes('failed to fetch') || lower.includes('authorization、content-type、post、options')) {
    return '浏览器无法访问 AI 服务，可能是 CORS 跨域限制。请在 AI 网关后台允许当前站点跨域访问，并允许 Authorization、Content-Type、POST、OPTIONS。'
  }

  if (lower.includes('network') || lower.includes('terminated') || lower.includes('aborted')) {
    return '连接中断，请检查网络或稍后重试。'
  }

  if (lower.includes('api返回内容为空') || lower.includes('empty')) {
    return 'AI 返回内容为空，请重试。'
  }

  return message
}

function createFailedAssistantMessage(conversationId: string, error: unknown): AgentMessage {
  return {
    id: nanoid(),
    conversationId,
    role: 'assistant',
    message: '',
    createdAt: Date.now(),
    state: 'failed',
    error: formatAgentError(error),
  }
}

async function persistFailedMessage(message: AgentMessage) {
  try {
    await saveAgentMessage(message)
  } catch {
    // The UI error state is more important than surfacing a secondary persistence failure.
  }
}

function buildDraftRecord(
  conversationId: string,
  taskType: AiDocTaskType,
  inputText: string,
  selectedReferenceIds: string[]
) {
  const settings = useSettingsStore.getState()
  const providerConfig = settings.getActiveProviderConfig()

  return {
    conversationId,
    inputText,
    taskType,
    selectedReferenceIds: selectedReferenceIds.slice(-1),
    providerId: providerConfig.id,
    model: providerConfig.model,
    updatedAt: Date.now(),
  } satisfies AgentDraft
}

function getReferenceFingerprint(reference: Pick<AiDocReferenceSnapshot, 'startOffset' | 'endOffset' | 'expectedText'>) {
  return JSON.stringify([
    reference.startOffset,
    reference.endOffset,
    reference.expectedText,
  ])
}

function hasDuplicateReference(reference: AiDocReferenceSnapshot, references: AiReferenceRecord[]) {
  const fingerprint = getReferenceFingerprint(reference)
  return references.some((item) => getReferenceFingerprint(item) === fingerprint)
}

function buildReferenceRecord(snapshot: AiDocReferenceSnapshot, conversationId: string): AiReferenceRecord {
  const identity = getCurrentDocumentIdentity()
  return {
    ...snapshot,
    id: nanoid(),
    conversationId,
    documentId: identity.documentId,
    tabId: identity.tabId,
    sourceType: identity.sourceType,
    stale: false,
    createdAt: Date.now(),
  }
}

function buildUserAgentMessage(args: {
  conversationId: string
  taskType: AiDocTaskType
  input: string
  references: AiReferenceRecord[]
}) {
  const referenceText = args.references
    .map((reference, index) => {
      return [
        `Reference ${index + 1}`,
        `startOffset: ${reference.startOffset}`,
        `endOffset: ${reference.endOffset}`,
        '<selected_text>',
        reference.expectedText,
        '</selected_text>',
      ].join('\n')
    })
    .join('\n\n')

  return {
    id: nanoid(),
    conversationId: args.conversationId,
    role: 'user',
    message: [
      `Task type: ${args.taskType}`,
      'User request:',
      args.input,
      '',
      'Selected document text:',
      referenceText || 'None',
    ].join('\n'),
    createdAt: Date.now(),
    state: 'done',
  } satisfies AgentMessage
}

async function syncCurrentDraft(store: Pick<AiChatStore, 'currentConversationId' | 'draftInput' | 'taskType' | 'selectedReferenceIds'>) {
  if (!store.currentConversationId) return
  await saveAgentDraft(buildDraftRecord(store.currentConversationId, store.taskType, store.draftInput, store.selectedReferenceIds))
}

async function persistExecutionTarget(
  conversationId: string,
  identity?: Partial<DocumentIdentity> | null
) {
  const record = toExecutionTargetRecord(conversationId, identity)
  if (record) {
    await saveAgentExecutionTarget(record)
  } else {
    await deleteAgentExecutionTarget(conversationId)
  }

  const nextIdentity = record ? fromExecutionTargetRecord(record) : normalizeDocumentIdentity(null)
  useAiChatStore.setState((state) => ({
    executionTargetsByConversation: record
      ? {
          ...state.executionTargetsByConversation,
          [conversationId]: nextIdentity,
        }
      : Object.fromEntries(
          Object.entries(state.executionTargetsByConversation).filter(([key]) => key !== conversationId)
        ),
  }))
}

function uniqueGeneratedFileName(fileName: string) {
  const fileSystemStore = useFileSystemStore.getState()
  const existingFiles = Array.isArray((fileSystemStore as { files?: { name: string }[] }).files)
    ? (fileSystemStore as { files?: { name: string }[] }).files || []
    : []
  const existingNames = new Set(existingFiles.map((file) => file.name))
  if (!existingNames.has(fileName)) return fileName

  const dotIndex = fileName.lastIndexOf('.')
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : ''

  let suffix = 1
  let nextName = `${baseName} (${suffix})${extension}`
  while (existingNames.has(nextName)) {
    suffix += 1
    nextName = `${baseName} (${suffix})${extension}`
  }

  return nextName
}

function normalizeGeneratedFileName(fileName: string) {
  const trimmed = fileName.trim()
  if (!trimmed) return 'AI生成文档.md'
  if (/\.(md|markdown)$/i.test(trimmed)) return trimmed
  return `${trimmed}.md`
}

function toGeneratedDocumentRecord(session: GeneratedDocumentSession) {
  return {
    conversationId: session.conversationId,
    toolCallId: session.toolCallId,
    fileName: session.fileName,
    content: session.content,
    tempFileId: session.tempFileId,
    tempTabId: session.tempTabId,
    gitTargetDirectory: session.gitTargetDirectory,
    status: session.status,
    error: session.error,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  } satisfies AgentDocumentSessionRecord
}

function fromGeneratedDocumentRecord(record: AgentDocumentSessionRecord): GeneratedDocumentSession {
  return {
    ...record,
  }
}

async function createGeneratedLocalTempFile(fileName: string, content: string) {
  const fileSystemStore = useFileSystemStore.getState()
  const tabsStore = useTabsStore.getState()
  const documentStore = useDocumentStore.getState()
  const normalizedName = uniqueGeneratedFileName(normalizeGeneratedFileName(fileName))

  fileSystemStore.importFile(normalizedName, content, null)
  const fileId = useFileSystemStore.getState().currentFileId
  if (!fileId) return null

  const tabId = tabsStore.openFileInTab(normalizedName, content, fileId)
  documentStore.loadDocument(content, normalizedName, fileId)
  requestAiGeneratedDocumentLivePreview()
  return { fileId, tabId, fileName: normalizedName }
}

function syncGeneratedDocumentPreview(session: Pick<GeneratedDocumentSession, 'fileName' | 'tempFileId' | 'tempTabId'>, content: string) {
  if (!session.tempFileId || !session.tempTabId) {
    return false
  }

  const tabsStore = useTabsStore.getState()
  const documentStore = useDocumentStore.getState()
  const activeTab = tabsStore.getActiveTab()
  if (activeTab?.id !== session.tempTabId) {
    return false
  }

  if (documentStore.document?.fileId !== session.tempFileId) {
    documentStore.loadDocument(content, session.fileName, session.tempFileId)
    return true
  }

  return documentStore.applyExternalMarkdown(content)
}

function cancelGeneratedDocumentPreviewSync(
  previewSyncStateByToolCall: Map<string, GeneratedDocumentPreviewSyncState>,
  toolCallId: string
) {
  const syncState = previewSyncStateByToolCall.get(toolCallId)
  if (!syncState) return

  if (syncState.timeoutId) {
    clearTimeout(syncState.timeoutId)
  }

  previewSyncStateByToolCall.delete(toolCallId)
}

function scheduleGeneratedDocumentPreviewSync(args: {
  previewSyncStateByToolCall: Map<string, GeneratedDocumentPreviewSyncState>
  generatedDocuments: Map<string, GeneratedDocumentSession>
  toolCallId: string
  session: GeneratedDocumentSession
  content: string
}) {
  if (!args.session.tempFileId || !args.session.tempTabId) {
    return
  }

  const existingState = args.previewSyncStateByToolCall.get(args.toolCallId) || {
    timeoutId: null,
    pendingContent: null,
    lastAppliedAt: 0,
  }
  const now = Date.now()
  const elapsed = now - existingState.lastAppliedAt

  if (!existingState.timeoutId && (existingState.lastAppliedAt === 0 || elapsed >= GENERATED_DOCUMENT_PREVIEW_THROTTLE_MS)) {
    const applied = syncGeneratedDocumentPreview(args.session, args.content)
    args.previewSyncStateByToolCall.set(args.toolCallId, {
      timeoutId: null,
      pendingContent: null,
      lastAppliedAt: applied ? now : existingState.lastAppliedAt,
    })
    return
  }

  if (existingState.timeoutId) {
    clearTimeout(existingState.timeoutId)
  }

  const waitMs = Math.max(0, GENERATED_DOCUMENT_PREVIEW_THROTTLE_MS - elapsed)
  const nextState: GeneratedDocumentPreviewSyncState = {
    timeoutId: null,
    pendingContent: args.content,
    lastAppliedAt: existingState.lastAppliedAt,
  }

  nextState.timeoutId = setTimeout(() => {
    const latestState = args.previewSyncStateByToolCall.get(args.toolCallId)
    const latestSession = args.generatedDocuments.get(args.toolCallId)
    if (!latestState || !latestSession || latestState.pendingContent == null) {
      args.previewSyncStateByToolCall.delete(args.toolCallId)
      return
    }

    const applied = syncGeneratedDocumentPreview(latestSession, latestState.pendingContent)
    args.previewSyncStateByToolCall.set(args.toolCallId, {
      timeoutId: null,
      pendingContent: null,
      lastAppliedAt: applied ? Date.now() : latestState.lastAppliedAt,
    })
  }, waitMs)

  args.previewSyncStateByToolCall.set(args.toolCallId, nextState)
}

function flushGeneratedDocumentPreviewSync(args: {
  previewSyncStateByToolCall: Map<string, GeneratedDocumentPreviewSyncState>
  toolCallId: string
  session: GeneratedDocumentSession
  content?: string
}) {
  const existingState = args.previewSyncStateByToolCall.get(args.toolCallId)
  const nextContent = args.content ?? existingState?.pendingContent ?? args.session.content

  if (existingState?.timeoutId) {
    clearTimeout(existingState.timeoutId)
  }

  args.previewSyncStateByToolCall.delete(args.toolCallId)

  if (nextContent == null) {
    return false
  }

  return syncGeneratedDocumentPreview(args.session, nextContent)
}

async function syncGeneratedDocumentToTempFile(args: {
  conversationId: string
  toolCallId: string
  fileName: string
  content: string
  tempFileId?: string | null
  tempTabId?: string | null
}) {
  const tabsStore = useTabsStore.getState()

  let tempFileId = args.tempFileId || null
  let tempTabId = args.tempTabId || null
  let nextFileName = args.fileName

  if (!tempFileId || !tempTabId) {
    const created = await createGeneratedLocalTempFile(args.fileName, args.content)
    if (!created) {
      throw new Error('无法创建临时文档')
    }
    tempFileId = created.fileId
    tempTabId = created.tabId
    nextFileName = created.fileName
  } else {
    useFileSystemStore.getState().saveFile(tempFileId, args.content)
    tabsStore.updateTabContent(tempTabId, args.content)
    tabsStore.markTabAsModified(tempTabId, true)
  }

  return { tempFileId, tempTabId, fileName: nextFileName, content: args.content }
}

async function finalizeGeneratedDocumentAsLocal(session: GeneratedDocumentSession) {
  const fileSystemStore = useFileSystemStore.getState()
  const tabsStore = useTabsStore.getState()

  if (session.tempFileId) {
    fileSystemStore.saveFileContent(session.tempFileId, session.content)
    if (session.tempTabId) {
      tabsStore.markTabAsSaved(session.tempTabId, session.fileName)
    }
  }
}

async function persistGeneratedDocumentSession(session: GeneratedDocumentSession | null) {
  if (!session) return
  await saveAgentDocumentSession(toGeneratedDocumentRecord(session))
}

async function removeGeneratedDocumentSession(conversationId: string) {
  await deleteAgentDocumentSession(conversationId)
}

async function moveGeneratedDocumentToGit(session: GeneratedDocumentSession) {
  const gitStore = useGitStore.getState()
  const normalizedPath = normalizeGitPath(joinGitPath(session.gitTargetDirectory || '', session.fileName))

  if (session.tempFileId) {
    gitStore.stageLocalFile(session.tempFileId, normalizedPath)
    return
  }

  const created = await createGeneratedLocalTempFile(session.fileName, session.content)
  if (!created) {
    throw new Error('无法创建本地文档以加入 Git')
  }

  const nextSession = {
    ...session,
    tempFileId: created.fileId,
    tempTabId: created.tabId,
    fileName: created.fileName,
  }
  await finalizeGeneratedDocumentAsLocal(nextSession)
  useGitStore.getState().stageLocalFile(created.fileId, normalizedPath)
}

function syncTabPersistState(args: {
  identity: DocumentIdentity
  markdown: string
  fileName?: string | null
  markSaved: boolean
}) {
  const targetTab = getOpenTabForIdentity(args.identity) as {
    id: string
    fileName?: string
  } | null
  if (!targetTab) {
    return
  }

  const tabsStore = useTabsStore.getState()
  tabsStore.updateTabContent(targetTab.id, args.markdown)
  if (args.markSaved) {
    tabsStore.markTabAsSaved(targetTab.id, args.fileName || targetTab.fileName)
    return
  }

  tabsStore.markTabAsModified(targetTab.id, true)
}

async function persistMarkdownToTargetIdentity(
  markdown: string,
  identity: DocumentIdentity,
  fileName?: string | null,
  options: { markSaved?: boolean; markDocumentSaved?: boolean } = {}
) {
  if (!identity.documentId) {
    return false
  }

  if (!documentIdentityExists(identity)) {
    throw new Error('AI 工具写回失败：目标文档已不存在，可能已被删除。请重新打开文档或重新选择内容。')
  }

  const markSaved = options.markSaved === true
  const markDocumentSaved = options.markDocumentSaved ?? markSaved
  const nextFileName = fileName || resolveFileNameForIdentity(identity)
  const isActiveTarget = isIdentityCurrentlyActive(identity)

  if (isActiveTarget) {
    const applied = applyMarkdownToDocument(markdown, { external: true })
    if (!applied) {
      return false
    }
  }

  if (identity.sourceType === 'git') {
    const gitStore = useGitStore.getState()
    if (!gitStore.drafts[identity.documentId]) {
      gitStore.setCurrentDocumentId(identity.documentId)
    }
    gitStore.updateDraftContent(identity.documentId, markdown)
  } else {
    const fileStore = useFileSystemStore.getState()
    if (markSaved) {
      fileStore.saveFileContent(identity.documentId, markdown)
    } else {
      fileStore.saveFile(identity.documentId, markdown)
    }
  }

  syncTabPersistState({
    identity,
    markdown,
    fileName: nextFileName,
    markSaved,
  })

  if (isActiveTarget) {
    if (markDocumentSaved) {
      useDocumentStore.getState().markAsSaved()
    }
  }

  return true
}

async function applyMarkdownTransaction(
  nextMarkdown: string,
  identity: DocumentIdentity,
  nextFileName?: string,
  options: { markSaved?: boolean } = {}
) {
  const normalizedIdentity = normalizeDocumentIdentity(identity)
  if (normalizedIdentity.documentId) {
    const persisted = await persistMarkdownToTargetIdentity(nextMarkdown, normalizedIdentity, nextFileName, {
      markSaved: options.markSaved,
      markDocumentSaved: options.markSaved,
    })
    if (!persisted) {
      throw new Error('AI 工具写回失败：目标文档写回失败。')
    }
    return nextMarkdown
  }

  const applied = applyMarkdownToDocument(nextMarkdown, { external: true })
  if (!applied) {
    throw new Error('AI 工具写回失败：文档解析失败。')
  }

  await persistMarkdownToActiveSource(nextMarkdown, nextFileName, options)
  return nextMarkdown
}

function getGitTargetDirectory() {
  const activeTab = useTabsStore.getState().getActiveTab()
  if (activeTab?.sourceType === 'git' && activeTab.gitMeta?.path) {
    return normalizeGitPath(activeTab.gitMeta.path.split('/').slice(0, -1).join('/'))
  }

  const gitStore = useGitStore.getState()
  const currentDraft = gitStore.currentDocumentId ? gitStore.drafts[gitStore.currentDocumentId] : null
  if (currentDraft?.path) {
    return normalizeGitPath(currentDraft.path.split('/').slice(0, -1).join('/'))
  }

  return ''
}

function requestAiGeneratedDocumentLivePreview() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem('visualmd-preview-mode', 'live')
  window.dispatchEvent(new CustomEvent('visualmd:open-preview', {
    detail: {
      mode: 'live',
    },
  }))
}

export const useAiChatStore = create<AiChatStore>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messagesByConversation: {},
  visibleMessagesByConversation: {},
  toolUndoStackByConversation: {},
  referencesByConversation: {},
  draftsByConversation: {},
  executionTargetsByConversation: {},
  generatedDocumentSessionsByConversation: {},
  taskType: 'ask',
  selectionCandidate: null,
  draftInput: '',
  selectedReferenceIds: [],
  sendingConversationIds: [],
  sendingStatus: null,
  sendingConversationId: null,
  chatTemperature: 0.7,
  chatMaxTokens: 4096,
  chatHistoryRounds: 10,
  isLoading: false,
  isSending: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null })
    try {
      const [agentConversations, executionTargets, documentSessions, lastOpenConversationId, chatTemperature, chatMaxTokens, chatHistoryRounds] = await Promise.all([
        listAgentConversations(),
        listAgentExecutionTargets(),
        listAgentDocumentSessions(),
        getAgentUiState('last_open_conversation_id'),
        getAgentUiState('chat_temperature'),
        getAgentUiState('chat_max_tokens'),
        getAgentUiState('chat_history_rounds'),
      ])
      const conversations = agentConversations.map(toUiConversation)
      const currentConversationId =
        lastOpenConversationId && conversations.some((item) => item.id === lastOpenConversationId)
          ? lastOpenConversationId
          : conversations[0]?.id || null

      const messagesByConversation: Record<string, AgentMessage[]> = {}
      const visibleMessagesByConversation: Record<string, VisibleAgentMessage[]> = {}
      const referencesByConversation: Record<string, AiReferenceRecord[]> = {}
      const draftsByConversation: Record<string, AgentDraft> = {}
      const executionTargetsByConversation: Record<string, DocumentIdentity> = {}
      const generatedDocumentSessionsByConversation: Record<string, GeneratedDocumentSession> = {}
      for (const executionTarget of executionTargets) {
        executionTargetsByConversation[executionTarget.conversationId] = fromExecutionTargetRecord(executionTarget)
      }
      for (const session of documentSessions) {
        generatedDocumentSessionsByConversation[session.conversationId] = fromGeneratedDocumentRecord(session)
      }
      if (currentConversationId) {
        const messages = await listAgentMessages(currentConversationId)
        messagesByConversation[currentConversationId] = messages
        visibleMessagesByConversation[currentConversationId] = getVisibleMessages(messages)
        referencesByConversation[currentConversationId] = (await listAgentReferences(currentConversationId)) as AiReferenceRecord[]
        const draft = await getAgentDraft(currentConversationId)
        if (draft) {
          draftsByConversation[currentConversationId] = draft
        }
      }

      const currentDraft = currentConversationId ? draftsByConversation[currentConversationId] : undefined
      set({
        conversations,
        currentConversationId,
        messagesByConversation,
        visibleMessagesByConversation,
        toolUndoStackByConversation: {},
        draftsByConversation,
        referencesByConversation,
        executionTargetsByConversation,
        generatedDocumentSessionsByConversation,
        taskType: (currentDraft?.taskType as AiDocTaskType) || 'ask',
        draftInput: currentDraft?.inputText || '',
        selectedReferenceIds: currentDraft?.selectedReferenceIds?.slice(-1) || [],
        chatTemperature: chatTemperature ? Number(chatTemperature) : 0.7,
        chatMaxTokens: chatMaxTokens ? Number(chatMaxTokens) : 4096,
        chatHistoryRounds: chatHistoryRounds ? Number(chatHistoryRounds) : 10,
        isLoading: false,
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize AI agent',
      })
    }
  },

  openConversation: async (conversationId) => {
    const [messages, references, draft, session, executionTarget] = await Promise.all([
      listAgentMessages(conversationId),
      listAgentReferences(conversationId) as Promise<AiReferenceRecord[]>,
      getAgentDraft(conversationId),
      getAgentDocumentSession(conversationId),
      getAgentExecutionTarget(conversationId),
    ])
    set((state) => ({
      currentConversationId: conversationId,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: state.sendingConversationIds.includes(conversationId) && state.messagesByConversation[conversationId]?.length
          ? state.messagesByConversation[conversationId]
          : messages,
      },
      visibleMessagesByConversation: {
        ...state.visibleMessagesByConversation,
        [conversationId]: state.sendingConversationIds.includes(conversationId) && state.visibleMessagesByConversation[conversationId]?.length
          ? state.visibleMessagesByConversation[conversationId]
          : getVisibleMessages(messages),
      },
      toolUndoStackByConversation: {
        ...state.toolUndoStackByConversation,
        [conversationId]: state.toolUndoStackByConversation[conversationId] || [],
      },
      referencesByConversation: {
        ...state.referencesByConversation,
        [conversationId]: references,
      },
      executionTargetsByConversation: executionTarget
        ? {
            ...state.executionTargetsByConversation,
            [conversationId]: fromExecutionTargetRecord(executionTarget),
          }
        : Object.fromEntries(
            Object.entries(state.executionTargetsByConversation).filter(([key]) => key !== conversationId)
          ),
      draftsByConversation: draft
        ? {
            ...state.draftsByConversation,
            [conversationId]: draft,
          }
        : state.draftsByConversation,
      generatedDocumentSessionsByConversation: session
        ? {
            ...state.generatedDocumentSessionsByConversation,
            [conversationId]: fromGeneratedDocumentRecord(session),
          }
        : state.generatedDocumentSessionsByConversation,
      draftInput: draft?.inputText || '',
      selectedReferenceIds: draft?.selectedReferenceIds?.slice(-1) || [],
      taskType: (draft?.taskType as AiDocTaskType) || 'ask',
      selectionCandidate: null,
      error: null,
    }))
    await saveAgentUiState('last_open_conversation_id', conversationId)
  },

  leaveConversation: async () => {
    set({ currentConversationId: null, selectionCandidate: null })
    await saveAgentUiState('last_open_conversation_id', '')
  },

  createConversation: async () => {
    const id = createAgentConversationId()
    const title = deriveConversationTitle(get().draftInput, 'New chat')
    const now = Date.now()
    const conversation: AgentConversation = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    }
    const draft = buildDraftRecord(id, get().taskType, get().draftInput, [])

    await Promise.all([
      saveAgentConversation(conversation),
      saveAgentDraft(draft),
      saveAgentUiState('last_open_conversation_id', id),
    ])

    set((state) => ({
      conversations: [toUiConversation(conversation), ...state.conversations],
      currentConversationId: id,
      messagesByConversation: { ...state.messagesByConversation, [id]: [] },
      visibleMessagesByConversation: { ...state.visibleMessagesByConversation, [id]: [] },
      toolUndoStackByConversation: { ...state.toolUndoStackByConversation, [id]: [] },
      referencesByConversation: { ...state.referencesByConversation, [id]: [] },
      draftsByConversation: { ...state.draftsByConversation, [id]: draft },
      selectedReferenceIds: [],
      selectionCandidate: null,
    }))

    return id
  },

  removeConversation: async (conversationId) => {
    await Promise.all([
      deleteAgentConversation(conversationId),
      deleteAgentDocumentSession(conversationId),
      deleteAgentExecutionTarget(conversationId),
    ])
    set((state) => {
      const nextMessages = { ...state.messagesByConversation }
      delete nextMessages[conversationId]
      const nextVisibleMessages = { ...state.visibleMessagesByConversation }
      delete nextVisibleMessages[conversationId]
      const nextToolUndoStack = { ...state.toolUndoStackByConversation }
      delete nextToolUndoStack[conversationId]
      const nextReferences = { ...state.referencesByConversation }
      delete nextReferences[conversationId]
      const nextDrafts = { ...state.draftsByConversation }
      delete nextDrafts[conversationId]
      const nextExecutionTargets = { ...state.executionTargetsByConversation }
      delete nextExecutionTargets[conversationId]
      const nextGeneratedDocumentSessions = { ...state.generatedDocumentSessionsByConversation }
      delete nextGeneratedDocumentSessions[conversationId]
      const conversations = state.conversations.filter((item) => item.id !== conversationId)
      const currentConversationId = state.currentConversationId === conversationId ? conversations[0]?.id || null : state.currentConversationId
      return {
        conversations,
        currentConversationId,
        messagesByConversation: nextMessages,
        visibleMessagesByConversation: nextVisibleMessages,
        toolUndoStackByConversation: nextToolUndoStack,
        referencesByConversation: nextReferences,
        draftsByConversation: nextDrafts,
        executionTargetsByConversation: nextExecutionTargets,
        generatedDocumentSessionsByConversation: nextGeneratedDocumentSessions,
        draftInput: currentConversationId ? nextDrafts[currentConversationId]?.inputText || '' : '',
        selectedReferenceIds: currentConversationId ? nextDrafts[currentConversationId]?.selectedReferenceIds?.slice(-1) || [] : [],
        selectionCandidate: null,
      }
    })
  },

  renameConversation: async (conversationId, title) => {
    const nextTitle = title.trim()
    if (!nextTitle) return

    const current = get().conversations.find((conversation) => conversation.id === conversationId)
    if (!current) return

    const nextConversation: AgentConversation = {
      id: current.id,
      title: nextTitle,
      createdAt: current.createdAt,
      updatedAt: Date.now(),
      messageCount: current.messageCount,
    }
    await saveAgentConversation(nextConversation)
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId ? toUiConversation(nextConversation) : conversation
      ),
    }))
  },

  setDraftInput: async (value) => {
    set({ draftInput: value })
    await syncCurrentDraft(get())
  },

  setTaskType: async (taskType) => {
    set({ taskType })
    await syncCurrentDraft(get())
  },

  setChatTemperature: async (value) => {
    const nextValue = Math.max(0, Math.min(2, value))
    set({ chatTemperature: nextValue })
    await saveAgentUiState('chat_temperature', String(nextValue))
  },

  setChatMaxTokens: async (value) => {
    const nextValue = Math.max(256, Math.min(200000, Math.round(value)))
    set({ chatMaxTokens: nextValue })
    await saveAgentUiState('chat_max_tokens', String(nextValue))
  },

  setChatHistoryRounds: async (value) => {
    const nextValue = Math.max(1, Math.min(100, Math.round(value)))
    set({ chatHistoryRounds: nextValue })
    await saveAgentUiState('chat_history_rounds', String(nextValue))
  },

  resolveGeneratedDocumentGitOffer: async (conversationId, shouldStageToGit) => {
    const session = get().generatedDocumentSessionsByConversation[conversationId]
    if (!session) return false

    try {
      if (shouldStageToGit) {
        await moveGeneratedDocumentToGit(session)
      }
    } catch (error) {
      await finalizeGeneratedDocumentAsLocal(session)
    } finally {
      await removeGeneratedDocumentSession(conversationId)
      set((state) => {
        const nextSessions = { ...state.generatedDocumentSessionsByConversation }
        delete nextSessions[conversationId]
        return {
          generatedDocumentSessionsByConversation: nextSessions,
        }
      })
    }

    return true
  },

  clearGeneratedDocumentSession: (conversationId) => {
    set((state) => {
      const nextSessions = { ...state.generatedDocumentSessionsByConversation }
      delete nextSessions[conversationId]
      return {
        generatedDocumentSessionsByConversation: nextSessions,
      }
    })
    void removeGeneratedDocumentSession(conversationId)
  },

  addEditorSelectionReference: async (selectionStart, selectionEnd, markdownOverride, versionOverride) => {
    const markdown = markdownOverride ?? useDocumentStore.getState().getCurrentMarkdown()
    const document = useDocumentStore.getState().document
    if (!document) return

    const snapshot = createReferenceSnapshot({
      markdown,
      selectionStart,
      selectionEnd,
      version: versionOverride ?? document.version,
    })
    if (!snapshot) return

    set((state) => {
      const currentConversationId = state.currentConversationId
      const currentReferences = currentConversationId ? state.referencesByConversation[currentConversationId] || [] : []
      const isDuplicate = hasDuplicateReference(snapshot, currentReferences)

      if (isDuplicate) {
        return {
          selectionCandidate: null,
        }
      }

      if (state.selectionCandidate) {
        return {
          selectionCandidate: state.selectionCandidate,
        }
      }

      return {
        selectionCandidate: snapshot,
      }
    })
  },

  commitSelectionCandidate: async () => {
    const snapshot = get().selectionCandidate
    if (!snapshot) return false

    const conversationId = get().currentConversationId || (await get().createConversation())
    if (!conversationId) return false

    const currentReferences = get().referencesByConversation[conversationId] || []
    if (hasDuplicateReference(snapshot, currentReferences)) {
      set({ selectionCandidate: null })
      useAiDockStore.getState().open()
      return false
    }

    const record = buildReferenceRecord(snapshot, conversationId)
    await Promise.all(currentReferences.map((reference) => deleteAgentReference(reference.id)))
    await saveAgentReference(record)
    await persistExecutionTarget(conversationId, record)
    set((state) => {
      return {
        referencesByConversation: {
          ...state.referencesByConversation,
          [conversationId]: [record],
        },
        selectedReferenceIds: [record.id],
        selectionCandidate: null,
      }
    })

    useAiDockStore.getState().open()
    await syncCurrentDraft(get())
    return true
  },

  clearSelectionCandidate: () => {
    set({ selectionCandidate: null })
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges()
    }
  },

  removeReference: async (referenceId) => {
    const { currentConversationId } = get()
    if (!currentConversationId) return
    await deleteAgentReference(referenceId)
    set((state) => ({
      referencesByConversation: {
        ...state.referencesByConversation,
        [currentConversationId]: (state.referencesByConversation[currentConversationId] || []).filter((item) => item.id !== referenceId),
      },
      selectedReferenceIds: state.selectedReferenceIds.filter((id) => id !== referenceId),
    }))
    await syncCurrentDraft(get())
  },

  sendMessage: async () => {
    let conversationId = get().currentConversationId
    let runId: string | null = null
    let messages: AgentMessage[] = []
    const generatedDocuments = new Map<string, GeneratedDocumentSession>()
    const generatedDocumentPreviewSyncStateByToolCall = new Map<string, GeneratedDocumentPreviewSyncState>()
    let streamedAssistantText = ''
    let streamFlushTimer: ReturnType<typeof setTimeout> | null = null

    try {
      await saveDirtyEditors()

      const input = get().draftInput.trim()
      if (!input) return

      if (get().selectionCandidate) {
        await get().commitSelectionCandidate()
        conversationId = get().currentConversationId
      }

      const settings = useSettingsStore.getState()
      const providerConfig = settings.getActiveProviderConfig()
      const apiKey = settings.getActiveProviderApiKey()
      if (!apiKey || !providerConfig.baseUrl || !providerConfig.model) {
        set({ error: 'AI provider is not configured' })
        return
      }

      conversationId = conversationId || (await get().createConversation())
      if (!conversationId) return
      const activeConversationId = conversationId

      const selectedReferenceId = get().selectedReferenceIds.at(-1)
      const references = (get().referencesByConversation[activeConversationId] || []).filter((reference) =>
        reference.id === selectedReferenceId
      )
      const activeIdentity = getCurrentDocumentIdentity()
      const referenceIdentity = references.at(-1)
        ? normalizeDocumentIdentity(references.at(-1))
        : null
      const targetIdentity = hasDocumentIdentity(referenceIdentity)
        ? normalizeDocumentIdentity(referenceIdentity)
        : hasDocumentIdentity(activeIdentity)
            ? normalizeDocumentIdentity(activeIdentity)
            : normalizeDocumentIdentity(null)
      const targetMarkdown = hasDocumentIdentity(targetIdentity)
        ? resolveMarkdownForIdentity(targetIdentity)
        : ''
      const targetFileName = resolveFileNameForIdentity(targetIdentity)

      if (hasDocumentIdentity(referenceIdentity)) {
        await persistExecutionTarget(activeConversationId, referenceIdentity)
      }

      if (hasDocumentIdentity(targetIdentity) && !documentIdentityExists(targetIdentity)) {
        throw new Error('当前对话绑定的目标文档已不存在，可能已被删除。请重新打开文档或重新选择内容后再试。')
      }

      const runContext = beginConversationRun(activeConversationId)
      const currentRunId = runContext.runId
      runId = currentRunId
      const isCurrentRun = () => isConversationRunActive(activeConversationId, currentRunId)

      await removeGeneratedDocumentSession(activeConversationId)
      set((state) => {
        const nextSessions = { ...state.generatedDocumentSessionsByConversation }
        delete nextSessions[activeConversationId]
        return {
          generatedDocumentSessionsByConversation: nextSessions,
        }
      })

      const userMessage = buildUserAgentMessage({
        conversationId: activeConversationId,
        taskType: get().taskType,
        input,
        references,
      })

      const existingMessages = get().messagesByConversation[activeConversationId] || []
      const userMessageIds = existingMessages
        .filter((message) => message.role === 'user')
        .slice(-Math.max(0, get().chatHistoryRounds - 1))
        .map((message) => message.id)
      const firstKeptUserIndex = existingMessages.findIndex((message) => userMessageIds.includes(message.id))
      const historyMessages = firstKeptUserIndex >= 0 ? existingMessages.slice(firstKeptUserIndex) : existingMessages
      const pendingAssistantMessage: VisibleAgentMessage = {
        id: nanoid(),
        conversationId: activeConversationId,
        role: 'assistant',
        message: '',
        displayMessage: '',
        createdAt: Date.now() + 1,
        state: 'pending',
      }
      const runtimeMessages = [...historyMessages, userMessage]
      messages = [...existingMessages, userMessage]
      const displayMessages = [...messages, pendingAssistantMessage]

      const currentReferences = get().referencesByConversation[activeConversationId] || []

      await saveAgentMessage(userMessage)
      await Promise.all(currentReferences.map((reference) => deleteAgentReference(reference.id)))
      await saveAgentDraft(buildDraftRecord(activeConversationId, get().taskType, '', []))

      set((state) => ({
        draftInput: '',
        selectedReferenceIds: [],
        selectionCandidate: null,
        isSending: true,
        sendingConversationIds: state.sendingConversationIds.includes(activeConversationId)
          ? state.sendingConversationIds
          : [...state.sendingConversationIds, activeConversationId],
        sendingConversationId: activeConversationId,
        sendingStatus: '正在连接 AI...',
        error: null,
        referencesByConversation: {
          ...state.referencesByConversation,
          [activeConversationId]: [],
        },
        messagesByConversation: {
          ...state.messagesByConversation,
          [activeConversationId]: messages,
        },
        visibleMessagesByConversation: {
          ...state.visibleMessagesByConversation,
          [activeConversationId]: getVisibleMessages(displayMessages),
        },
      }))

      const flushStreamedAssistantText = (force = false) => {
        const nextText = streamedAssistantText
        if (!nextText && !force) {
          return
        }

        set((state) => ({
          sendingStatus: 'AI 姝ｅ湪鍥炲...',
          visibleMessagesByConversation: {
            ...state.visibleMessagesByConversation,
            [activeConversationId]: getVisibleMessages([
              ...(state.messagesByConversation[activeConversationId] || messages),
              {
                ...pendingAssistantMessage,
                message: nextText,
              },
            ]),
          },
        }))
      }

      const result = await runAgentReActLoop({
        providerConfig: {
          ...providerConfig,
          apiKey,
          temperature: get().chatTemperature,
          maxTokens: get().chatMaxTokens,
        },
        apiKey,
        messages: runtimeMessages,
        tools: createDefaultAgentTools(),
        markdown: targetMarkdown,
        selectedReference: references.at(-1)
          ? {
              id: references.at(-1)?.id,
              startOffset: references.at(-1)?.startOffset,
              endOffset: references.at(-1)?.endOffset,
              expectedText: references.at(-1)?.expectedText,
              excerpt: references.at(-1)?.excerpt,
            }
          : null,
        maxTurns: 5,
        signal: runContext.controller.signal,
        onGeneratedDocumentEvent: async (event) => {
          if (!isCurrentRun()) return

          if (event.type === 'start') {
            const startedSession: GeneratedDocumentSession = {
              conversationId: activeConversationId,
              toolCallId: event.toolCallId,
              fileName: normalizeGeneratedFileName(event.fileName),
              content: '',
              tempFileId: null,
              tempTabId: null,
              gitTargetDirectory: isGitCreationAvailable() ? getGitTargetDirectory() : null,
              status: 'streaming',
              error: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
            generatedDocuments.set(event.toolCallId, startedSession)
            await persistGeneratedDocumentSession(startedSession)
            if (!isCurrentRun()) return
            set({ sendingStatus: '正在生成新文档...' })
            return
          }

          const session = generatedDocuments.get(event.toolCallId)
          if (!session) return

          if (event.type === 'delta') {
            const didCreateTempDocument = !session.tempFileId || !session.tempTabId
            const nextSession = await syncGeneratedDocumentToTempFile({
              conversationId: activeConversationId,
              toolCallId: event.toolCallId,
              fileName: session.fileName,
              content: event.content,
              tempFileId: session.tempFileId,
              tempTabId: session.tempTabId,
            })
            const streamedSession: GeneratedDocumentSession = {
              ...session,
              ...nextSession,
              content: event.content,
              status: 'streaming',
              updatedAt: Date.now(),
            }
            if (!isCurrentRun()) return
            generatedDocuments.set(event.toolCallId, streamedSession)
            if (didCreateTempDocument) {
              generatedDocumentPreviewSyncStateByToolCall.set(event.toolCallId, {
                timeoutId: null,
                pendingContent: null,
                lastAppliedAt: Date.now(),
              })
            } else {
              scheduleGeneratedDocumentPreviewSync({
                previewSyncStateByToolCall: generatedDocumentPreviewSyncStateByToolCall,
                generatedDocuments,
                toolCallId: event.toolCallId,
                session: streamedSession,
                content: event.content,
              })
            }
            await persistGeneratedDocumentSession(streamedSession)
            if (!isCurrentRun()) return
            set({ sendingStatus: '正在生成新文档...' })
            return
          }

          if (event.type === 'error') {
            cancelGeneratedDocumentPreviewSync(generatedDocumentPreviewSyncStateByToolCall, event.toolCallId)
            const failedSession: GeneratedDocumentSession = {
              ...session,
              content: session.content || '',
              status: 'failed',
              error: event.error,
              updatedAt: Date.now(),
            }
            if (!isCurrentRun()) return
            generatedDocuments.set(event.toolCallId, failedSession)
            await finalizeGeneratedDocumentAsLocal(failedSession)
            await persistGeneratedDocumentSession(failedSession)
            if (!isCurrentRun()) return
            set((state) => {
              const nextSessions = { ...state.generatedDocumentSessionsByConversation }
              delete nextSessions[activeConversationId]
              const nextSendingConversationIds = state.sendingConversationIds.filter((id) => id !== activeConversationId)
              return {
                isSending: nextSendingConversationIds.length > 0,
                sendingConversationIds: nextSendingConversationIds,
                sendingConversationId: nextSendingConversationIds.at(-1) || null,
                sendingStatus: null,
                generatedDocumentSessionsByConversation: nextSessions,
              }
            })
            return
          }

          const didCreateTempDocument = !session.tempFileId || !session.tempTabId
          const finalSession = await syncGeneratedDocumentToTempFile({
            conversationId: activeConversationId,
            toolCallId: event.toolCallId,
            fileName: session.fileName,
            content: event.content,
            tempFileId: session.tempFileId,
            tempTabId: session.tempTabId,
          })
          const nextSession: GeneratedDocumentSession = {
            ...session,
            ...finalSession,
            content: event.content,
            status: 'ready',
            error: null,
            updatedAt: Date.now(),
          }
          if (!isCurrentRun()) return
          generatedDocuments.set(event.toolCallId, nextSession)
          if (didCreateTempDocument) {
            cancelGeneratedDocumentPreviewSync(generatedDocumentPreviewSyncStateByToolCall, event.toolCallId)
          } else {
            flushGeneratedDocumentPreviewSync({
              previewSyncStateByToolCall: generatedDocumentPreviewSyncStateByToolCall,
              toolCallId: event.toolCallId,
              session: nextSession,
              content: event.content,
            })
          }
          await finalizeGeneratedDocumentAsLocal(nextSession)
          await persistGeneratedDocumentSession(nextSession)
          if (!isCurrentRun()) return

          if (isGitCreationAvailable()) {
            set({
              sendingStatus: null,
              generatedDocumentSessionsByConversation: {
                ...get().generatedDocumentSessionsByConversation,
                [activeConversationId]: nextSession,
              },
            })
            return
          }

          await removeGeneratedDocumentSession(activeConversationId)
          set((state) => {
            const nextSessions = { ...state.generatedDocumentSessionsByConversation }
            delete nextSessions[activeConversationId]
            return {
              sendingStatus: null,
              generatedDocumentSessionsByConversation: nextSessions,
            }
          })
        },
        onAssistantTextDelta: (text) => {
          if (!isCurrentRun()) return
          streamedAssistantText = text
          if (streamFlushTimer) {
            return
          }

          streamFlushTimer = setTimeout(() => {
            streamFlushTimer = null
            flushStreamedAssistantText()
          }, 48)
        },
      })

      if (streamFlushTimer) {
        clearTimeout(streamFlushTimer)
        streamFlushTimer = null
      }
      flushStreamedAssistantText(true)

      if (!isCurrentRun()) {
        return
      }

      const newMessages = result.messages.slice(runtimeMessages.length)
      await saveAgentMessages(newMessages)
      if (!isCurrentRun()) {
        return
      }
      const nextMessages = [...messages, ...newMessages]

      const appliedDocumentChanged = result.appliedMarkdown !== result.previousMarkdown
      let toolUndoRecords: ToolUndoRecord[] = []
      if (appliedDocumentChanged && result.appliedTools.length > 0) {
        set({ sendingStatus: '正在应用工具结果...' })
        useHistoryStore.getState().addHistory({
          type: 'batch',
          description: AI_DOCUMENT_EDIT_HISTORY_DESCRIPTION,
        })
        if (!hasDocumentIdentity(targetIdentity)) {
          throw new Error('AI 工具写回失败：当前没有激活文档。无选区编辑或追加内容时，请先打开目标文档。')
        }
        const committedMarkdown = await applyMarkdownTransaction(
          result.appliedMarkdown,
          targetIdentity,
          targetFileName ?? undefined,
          { markSaved: true }
        )
        const appliedToolCallId = result.appliedTools.at(-1)?.toolCallId || result.appliedToolCallIds.at(-1)
        const previousMarkdown = result.appliedTools[0]?.previousMarkdown || result.previousMarkdown

        if (appliedToolCallId && previousMarkdown !== committedMarkdown) {
          toolUndoRecords = [
            createToolUndoRecord({
              conversationId: activeConversationId,
              toolCallId: appliedToolCallId,
              identity: targetIdentity,
              fileName: targetFileName,
              previousMarkdown,
              appliedMarkdown: committedMarkdown,
            }),
          ]
        }
      }

      // Generated documents are handled through the streamed session state above.

      const now = Date.now()
      const conversation = get().conversations.find((item) => item.id === activeConversationId)
      if (conversation) {
        const nextConversation: AgentConversation = {
          id: conversation.id,
          title: deriveConversationTitle(input, conversation.title),
          createdAt: conversation.createdAt,
          updatedAt: now,
          messageCount: result.messages.length,
        }
        await saveAgentConversation(nextConversation)
        set((state) => ({
          conversations: [toUiConversation(nextConversation), ...state.conversations.filter((item) => item.id !== activeConversationId)],
        }))
      }

      set((state) => ({
        isSending: state.sendingConversationIds.filter((id) => id !== activeConversationId).length > 0,
        sendingConversationIds: state.sendingConversationIds.filter((id) => id !== activeConversationId),
        sendingConversationId: state.sendingConversationIds.filter((id) => id !== activeConversationId).at(-1) || null,
        sendingStatus: null,
        messagesByConversation: {
          ...state.messagesByConversation,
          [activeConversationId]: nextMessages,
        },
        visibleMessagesByConversation: {
          ...state.visibleMessagesByConversation,
          [activeConversationId]: getVisibleMessages(nextMessages),
        },
        toolUndoStackByConversation: {
          ...state.toolUndoStackByConversation,
          [activeConversationId]: [
            ...(state.toolUndoStackByConversation[activeConversationId] || []),
            ...toolUndoRecords,
          ],
        },
      }))
    } catch (error) {
      if (streamFlushTimer) {
        clearTimeout(streamFlushTimer)
        streamFlushTimer = null
      }
      generatedDocumentPreviewSyncStateByToolCall.forEach((_, toolCallId) => {
        cancelGeneratedDocumentPreviewSync(generatedDocumentPreviewSyncStateByToolCall, toolCallId)
      })
      if (!conversationId) {
        return
      }
      if (runId && !isConversationRunActive(conversationId, runId)) {
        return
      }
      const failedConversationId = conversationId || get().currentConversationId || ''
      const failedMessage = createFailedAssistantMessage(failedConversationId, error)
      if (failedConversationId) {
        await persistFailedMessage(failedMessage)
      }
      const nextMessages = [...messages, failedMessage]
      set((state) => ({
        isSending: state.sendingConversationIds.filter((id) => id !== failedConversationId).length > 0,
        sendingConversationIds: state.sendingConversationIds.filter((id) => id !== failedConversationId),
        sendingConversationId: state.sendingConversationIds.filter((id) => id !== failedConversationId).at(-1) || null,
        sendingStatus: null,
        error: failedMessage.error || 'AI request failed',
        messagesByConversation: {
          ...state.messagesByConversation,
          ...(failedConversationId ? { [failedConversationId]: nextMessages } : {}),
        },
        visibleMessagesByConversation: {
          ...state.visibleMessagesByConversation,
          ...(failedConversationId ? { [failedConversationId]: getVisibleMessages(nextMessages) } : {}),
        },
      }))
    } finally {
      if (streamFlushTimer) {
        clearTimeout(streamFlushTimer)
        streamFlushTimer = null
      }
      generatedDocumentPreviewSyncStateByToolCall.forEach((_, toolCallId) => {
        cancelGeneratedDocumentPreviewSync(generatedDocumentPreviewSyncStateByToolCall, toolCallId)
      })
      if (conversationId && runId) {
        finishConversationRun(conversationId, runId)
      }
    }
  },

  stopSending: () => {
    const targetConversationId = get().currentConversationId || get().sendingConversationId
    if (targetConversationId) {
      abortControllerByConversation.get(targetConversationId)?.abort()
      abortControllerByConversation.delete(targetConversationId)
      activeRunIdByConversation.delete(targetConversationId)
    }
    set((state) => {
      const nextSendingConversationIds = targetConversationId
        ? state.sendingConversationIds.filter((id) => id !== targetConversationId)
        : state.sendingConversationIds

      return {
        isSending: nextSendingConversationIds.length > 0,
        sendingConversationIds: nextSendingConversationIds,
        sendingConversationId: nextSendingConversationIds.at(-1) || null,
        sendingStatus: null,
        error: '已中断 AI 请求。',
      }
    })
  },

  undoLastToolApply: async () => {
    const conversationId = get().currentConversationId
    if (!conversationId) return false

    const stack = get().toolUndoStackByConversation[conversationId] || []
    const target = [...stack].reverse().find((record) => record.state === 'available')
    if (!target) return false

    useHistoryStore.getState().addHistory({
      type: 'batch',
      description: AI_DOCUMENT_UNDO_HISTORY_DESCRIPTION,
    })
    await applyMarkdownTransaction(
      target.previousMarkdown,
      normalizeDocumentIdentity(target),
      target.fileName ?? undefined,
      { markSaved: true }
    )

    set((state) => ({
      toolUndoStackByConversation: {
        ...state.toolUndoStackByConversation,
        [conversationId]: (state.toolUndoStackByConversation[conversationId] || []).map((record) =>
          record.id === target.id ? { ...record, state: 'undone' } : record
        ),
      },
    }))

    return true
  },

  dismissLastToolApply: () => {
    const conversationId = get().currentConversationId
    if (!conversationId) return

    const stack = get().toolUndoStackByConversation[conversationId] || []
    const target = [...stack].reverse().find((record) => record.state === 'available')
    if (!target) return

    set((state) => ({
      toolUndoStackByConversation: {
        ...state.toolUndoStackByConversation,
        [conversationId]: (state.toolUndoStackByConversation[conversationId] || []).map((record) =>
          record.id === target.id ? { ...record, state: 'dismissed' } : record
        ),
      },
    }))
  },

  syncToolUndoStackWithMarkdown: (markdown) => {
    const conversationId = get().currentConversationId
    if (!conversationId) return

    const stack = get().toolUndoStackByConversation[conversationId] || []
    if (!stack.length) return

    set((state) => ({
      toolUndoStackByConversation: {
        ...state.toolUndoStackByConversation,
        [conversationId]: (state.toolUndoStackByConversation[conversationId] || []).map((record) => {
          if (record.state === 'available' && record.previousMarkdown === markdown) {
            return { ...record, state: 'undone' }
          }

          if (record.state === 'undone' && record.appliedMarkdown === markdown) {
            return { ...record, state: 'available' }
          }

          return record
        }),
      },
    }))
  },
}))
