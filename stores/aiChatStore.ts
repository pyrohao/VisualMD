'use client'

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import {
  createAgentConversationId,
  createDefaultAgentTools,
  deleteAgentConversation,
  deleteAgentReference,
  deleteAgentDocumentSession,
  getAgentDraft,
  getAgentDocumentSession,
  getAgentUiState,
  listAgentConversations,
  listAgentDocumentSessions,
  listAgentMessages,
  listAgentReferences,
  runAgentReActLoop,
  saveAgentConversation,
  saveAgentDocumentSession,
  saveAgentDraft,
  saveAgentMessage,
  saveAgentMessages,
  saveAgentReference,
  saveAgentUiState,
  splitAssistantThinking,
  type AgentConversation,
  type AgentDocumentSessionRecord,
  type AgentDraft,
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
import { getGitFileName, joinGitPath, normalizeGitPath } from '@/lib/git/utils'

export type AiReferenceRecord = AiDocReferenceSnapshot & {
  id: string
  conversationId: string
  documentId: string | null
  tabId: string | null
  stale: boolean
  createdAt: number
}

export type AiDocumentCreateTarget = 'local' | 'git'

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

type UiConversationRecord = AgentConversation & {
  documentId: string | null
  tabId: string | null
  sourceType: 'local' | 'git' | 'unknown'
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
  generatedDocumentSessionsByConversation: Record<string, GeneratedDocumentSession>
  taskType: AiDocTaskType
  selectionCandidate: AiDocReferenceSnapshot | null
  draftInput: string
  selectedReferenceIds: string[]
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
  chooseGeneratedDocumentSaveTarget: (conversationId: string, target: AiDocumentCreateTarget) => Promise<boolean>
  clearGeneratedDocumentSession: (conversationId: string) => void
  undoLastToolApply: () => Promise<boolean>
  dismissLastToolApply: () => void
  syncToolUndoStackWithMarkdown: (markdown: string) => void
}

let activeAbortController: AbortController | null = null

function isGitCreationAvailable() {
  const gitState = useGitStore.getState()
  return Boolean(gitState.connected && gitState.config.repo && gitState.config.branch)
}

function getCurrentDocumentIdentity() {
  const activeTab = useTabsStore.getState().getActiveTab()
  return {
    tabId: activeTab?.id || null,
    documentId: activeTab?.fileId || null,
    sourceType: activeTab?.sourceType || 'unknown',
  } as const
}

function toUiConversation(conversation: AgentConversation): UiConversationRecord {
  const settings = useSettingsStore.getState()
  const providerConfig = settings.getActiveProviderConfig()
  return {
    ...conversation,
    documentId: null,
    tabId: null,
    sourceType: 'unknown',
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
  return messages.filter(isVisibleMessage).map((message) => ({
    ...message,
    displayMessage: splitAssistantThinking(getDisplayMessage(message)).text || getDisplayMessage(message),
    thinking: message.role === 'assistant' ? splitAssistantThinking(getDisplayMessage(message)).thinking : undefined,
  }))
}

function createToolUndoRecord(args: {
  conversationId: string
  toolCallId: string
  previousMarkdown: string
  appliedMarkdown: string
}) {
  return {
    id: `tool-undo-${args.toolCallId}`,
    conversationId: args.conversationId,
    toolCallId: args.toolCallId,
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

function getReferenceFingerprint(reference: Pick<AiDocReferenceSnapshot, 'anchorPath' | 'startBlockIndex' | 'blockCount' | 'expectedText'>) {
  return JSON.stringify([
    reference.anchorPath,
    reference.startBlockIndex,
    reference.blockCount,
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
        `anchorPath: ${reference.anchorPath.join(' > ') || 'root'}`,
        `blockType: ${reference.blockType}`,
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
  return { fileId, tabId, fileName: normalizedName }
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
  const documentStore = useDocumentStore.getState()
  const activeTab = tabsStore.getActiveTab()
  const shouldSyncPreview = activeTab?.id === args.tempTabId

  let tempFileId = args.tempFileId || null
  let tempTabId = args.tempTabId || null

  if (!tempFileId || !tempTabId) {
    const created = await createGeneratedLocalTempFile(args.fileName, args.content)
    if (!created) {
      throw new Error('无法创建临时文档')
    }
    tempFileId = created.fileId
    tempTabId = created.tabId
  } else {
    useFileSystemStore.getState().saveFile(tempFileId, args.content)
    tabsStore.updateTabContent(tempTabId, args.content)
    tabsStore.markTabAsModified(tempTabId, true)
  }

  if (shouldSyncPreview || activeTab?.id === tempTabId) {
    documentStore.applyExternalMarkdown(args.content)
  }

  return { tempFileId, tempTabId, fileName: args.fileName, content: args.content }
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
  const tabsStore = useTabsStore.getState()
  const documentStore = useDocumentStore.getState()
  const fileSystemStore = useFileSystemStore.getState()
  const normalizedPath = normalizeGitPath(joinGitPath(session.gitTargetDirectory || '', session.fileName))

  await gitStore.createFile(normalizedPath, session.content, `Create ${normalizedPath}`)
  const nextGitState = useGitStore.getState()
  const draft = nextGitState.currentDocumentId ? nextGitState.drafts[nextGitState.currentDocumentId] : null
  if (draft) {
    const draftContent = draft.draftContent || session.content
    tabsStore.openGitFileInTab({
      fileName: draft.name || getGitFileName(normalizedPath),
      content: draftContent,
      savedContent: draftContent,
      isModified: draft.isDirty || Boolean(draft.isNew),
      isNew: draft.isNew,
      fileId: draft.documentId,
      sourceType: 'git',
      gitMeta: {
        provider: draft.provider,
        ownerOrNamespace: draft.ownerOrNamespace,
        repo: draft.repo,
        branch: draft.branch,
        path: draft.path,
        sha: draft.sha,
        fileKind: 'text',
      },
    })
    documentStore.loadDocument(draftContent, draft.name || getGitFileName(normalizedPath), draft.documentId)
  }

  if (session.tempFileId) {
    fileSystemStore.deleteFile(session.tempFileId)
  }
  if (session.tempTabId) {
    tabsStore.closeTab(session.tempTabId)
  }
}

async function syncMarkdownToActiveSource(
  nextMarkdown: string,
  nextFileName?: string,
  options: { markSaved?: boolean } = {}
) {
  const tabsStore = useTabsStore.getState()
  const activeTab = tabsStore.getActiveTab()
  if (!activeTab) return

  tabsStore.updateTabContent(activeTab.id, nextMarkdown)

  if (activeTab.sourceType === 'git' && activeTab.fileId) {
    useGitStore.getState().updateDraftContent(activeTab.fileId, nextMarkdown)
    if (options.markSaved) {
      tabsStore.markTabAsSaved(activeTab.id, nextFileName)
    } else {
      tabsStore.markTabAsModified(activeTab.id, true)
    }
    return
  }

  if (activeTab.fileId) {
    if (options.markSaved) {
      useFileSystemStore.getState().saveFileContent(activeTab.fileId, nextMarkdown)
    } else {
      useFileSystemStore.getState().saveFile(activeTab.fileId, nextMarkdown)
    }
    if (nextFileName) {
      useFileSystemStore.getState().renameFile(activeTab.fileId, nextFileName)
    }
    if (options.markSaved) {
      tabsStore.markTabAsSaved(activeTab.id, nextFileName)
    } else {
      tabsStore.markTabAsModified(activeTab.id, true)
    }
    return
  }

  if (options.markSaved) {
    tabsStore.markTabAsSaved(activeTab.id, nextFileName)
  } else {
    tabsStore.markTabAsModified(activeTab.id, true)
  }
}

async function applyMarkdownTransaction(
  nextMarkdown: string,
  nextFileName?: string,
  options: { markSaved?: boolean } = {}
) {
  const applied = useDocumentStore.getState().applyExternalMarkdown(nextMarkdown)
  if (!applied) {
    throw new Error('AI 工具写回失败：文档解析失败。')
  }

  const committedMarkdown = useDocumentStore.getState().getCurrentMarkdown()

  await syncMarkdownToActiveSource(committedMarkdown, nextFileName, options)

  if (options.markSaved) {
    useDocumentStore.getState().markAsSaved?.()
  }

  return committedMarkdown
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

function buildGeneratedGitPath(fileName: string) {
  return joinGitPath(getGitTargetDirectory(), fileName)
}

export const useAiChatStore = create<AiChatStore>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messagesByConversation: {},
  visibleMessagesByConversation: {},
  toolUndoStackByConversation: {},
  referencesByConversation: {},
  draftsByConversation: {},
  generatedDocumentSessionsByConversation: {},
  taskType: 'ask',
  selectionCandidate: null,
  draftInput: '',
  selectedReferenceIds: [],
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
      const [agentConversations, documentSessions, lastOpenConversationId, chatTemperature, chatMaxTokens, chatHistoryRounds] = await Promise.all([
        listAgentConversations(),
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
      const generatedDocumentSessionsByConversation: Record<string, GeneratedDocumentSession> = {}
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
    const messages = await listAgentMessages(conversationId)
    const references = (await listAgentReferences(conversationId)) as AiReferenceRecord[]
    const draft = await getAgentDraft(conversationId)
    const session = await getAgentDocumentSession(conversationId)
    set((state) => ({
      currentConversationId: conversationId,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: state.sendingConversationId === conversationId && state.messagesByConversation[conversationId]?.length
          ? state.messagesByConversation[conversationId]
          : messages,
      },
      visibleMessagesByConversation: {
        ...state.visibleMessagesByConversation,
        [conversationId]: state.sendingConversationId === conversationId && state.visibleMessagesByConversation[conversationId]?.length
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
    await deleteAgentConversation(conversationId)
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

  chooseGeneratedDocumentSaveTarget: async (conversationId, target) => {
    const session = get().generatedDocumentSessionsByConversation[conversationId]
    if (!session) return false

    try {
      if (target === 'git') {
        await moveGeneratedDocumentToGit(session)
      } else {
        await finalizeGeneratedDocumentAsLocal(session)
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
    if (get().selectionCandidate) return

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
      const nextFingerprint = getReferenceFingerprint(snapshot)
      const isDuplicate = hasDuplicateReference(snapshot, currentReferences)

      if (isDuplicate) {
        return {
          selectionCandidate: null,
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
    let messages: AgentMessage[] = []
    const generatedDocuments = new Map<string, GeneratedDocumentSession>()

    try {
      await saveDirtyEditors()

      const documentStore = useDocumentStore.getState()
      const document = documentStore.document
      if (!document) {
        set({ error: 'No active document' })
        return
      }

      const input = get().draftInput.trim()
      if (!input) return

      const settings = useSettingsStore.getState()
      const providerConfig = settings.getActiveProviderConfig()
      const apiKey = settings.getActiveProviderApiKey()
      if (!apiKey || !providerConfig.baseUrl || !providerConfig.model) {
        set({ error: 'AI provider is not configured' })
        return
      }

      conversationId = conversationId || (await get().createConversation())
      if (!conversationId) return

      set((state) => {
        const nextSessions = { ...state.generatedDocumentSessionsByConversation }
        delete nextSessions[conversationId]
        return {
          generatedDocumentSessionsByConversation: nextSessions,
        }
      })

      const selectedReferenceId = get().selectedReferenceIds.at(-1)
      const references = (get().referencesByConversation[conversationId] || []).filter((reference) =>
        reference.id === selectedReferenceId
      )
      const userMessage = buildUserAgentMessage({
        conversationId,
        taskType: get().taskType,
        input,
        references,
      })

      const existingMessages = get().messagesByConversation[conversationId] || []
      const userMessageIds = existingMessages
        .filter((message) => message.role === 'user')
        .slice(-Math.max(0, get().chatHistoryRounds - 1))
        .map((message) => message.id)
      const firstKeptUserIndex = existingMessages.findIndex((message) => userMessageIds.includes(message.id))
      const historyMessages = firstKeptUserIndex >= 0 ? existingMessages.slice(firstKeptUserIndex) : existingMessages
      const pendingAssistantMessage: VisibleAgentMessage = {
        id: nanoid(),
        conversationId,
        role: 'assistant',
        message: '',
        displayMessage: '',
        createdAt: Date.now() + 1,
        state: 'pending',
      }
      const runtimeMessages = [...historyMessages, userMessage]
      messages = [...existingMessages, userMessage]
      const displayMessages = [...messages, pendingAssistantMessage]

      const currentReferences = get().referencesByConversation[conversationId] || []

      await saveAgentMessage(userMessage)
      await Promise.all(currentReferences.map((reference) => deleteAgentReference(reference.id)))
      await saveAgentDraft(buildDraftRecord(conversationId, get().taskType, '', []))

      set((state) => ({
        draftInput: '',
        selectedReferenceIds: [],
        selectionCandidate: null,
        isSending: true,
        sendingConversationId: conversationId,
        sendingStatus: '正在连接 AI...',
        error: null,
        referencesByConversation: {
          ...state.referencesByConversation,
          [conversationId]: [],
        },
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: messages,
        },
        visibleMessagesByConversation: {
          ...state.visibleMessagesByConversation,
          [conversationId]: getVisibleMessages(displayMessages),
        },
      }))

      activeAbortController = new AbortController()
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
        markdown: documentStore.getCurrentMarkdown(),
        maxTurns: 5,
        signal: activeAbortController.signal,
        onGeneratedDocumentEvent: async (event) => {
          if (event.type === 'start') {
            const created = await createGeneratedLocalTempFile(event.fileName, '')
            if (!created) return
            const startedSession: GeneratedDocumentSession = {
              conversationId,
              toolCallId: event.toolCallId,
              fileName: created.fileName,
              content: '',
              tempFileId: created.fileId,
              tempTabId: created.tabId,
              gitTargetDirectory: isGitCreationAvailable() ? getGitTargetDirectory() : null,
              status: 'streaming',
              error: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
            generatedDocuments.set(event.toolCallId, startedSession)
            await persistGeneratedDocumentSession(startedSession)
            set({ sendingStatus: '正在生成新文档...' })
            return
          }

          const session = generatedDocuments.get(event.toolCallId)
          if (!session) return

          if (event.type === 'delta') {
            const nextSession = await syncGeneratedDocumentToTempFile({
              conversationId,
              toolCallId: event.toolCallId,
              fileName: session.fileName,
              content: event.content,
              tempFileId: session.tempFileId,
              tempTabId: session.tempTabId,
            })
            generatedDocuments.set(event.toolCallId, {
              ...session,
              ...nextSession,
              content: event.content,
              status: 'streaming',
              updatedAt: Date.now(),
            })
            await persistGeneratedDocumentSession({
              ...session,
              ...nextSession,
              content: event.content,
              status: 'streaming',
              updatedAt: Date.now(),
            })
            set({ sendingStatus: '正在生成新文档...' })
            return
          }

          if (event.type === 'error') {
            const failedSession: GeneratedDocumentSession = {
              ...session,
              content: session.content || '',
              status: 'failed',
              error: event.error,
              updatedAt: Date.now(),
            }
            generatedDocuments.set(event.toolCallId, failedSession)
            await finalizeGeneratedDocumentAsLocal(failedSession)
            await persistGeneratedDocumentSession(failedSession)
            set((state) => {
              const nextSessions = { ...state.generatedDocumentSessionsByConversation }
              delete nextSessions[conversationId]
              return {
                sendingStatus: null,
                generatedDocumentSessionsByConversation: nextSessions,
              }
            })
            return
          }

          const finalSession = await syncGeneratedDocumentToTempFile({
            conversationId,
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
          generatedDocuments.set(event.toolCallId, nextSession)
          await persistGeneratedDocumentSession(nextSession)

          if (isGitCreationAvailable()) {
            set({
              sendingStatus: null,
              generatedDocumentSessionsByConversation: {
                ...get().generatedDocumentSessionsByConversation,
                [conversationId]: nextSession,
              },
            })
            return
          }

          await finalizeGeneratedDocumentAsLocal(nextSession)
          await removeGeneratedDocumentSession(conversationId)
          set((state) => {
            const nextSessions = { ...state.generatedDocumentSessionsByConversation }
            delete nextSessions[conversationId]
            return {
              sendingStatus: null,
              generatedDocumentSessionsByConversation: nextSessions,
            }
          })
        },
        onAssistantTextDelta: (text) => {
          set((state) => ({
            sendingStatus: 'AI 正在回复...',
            visibleMessagesByConversation: {
              ...state.visibleMessagesByConversation,
              [conversationId]: getVisibleMessages([
                ...(state.messagesByConversation[conversationId] || messages),
                {
                  ...pendingAssistantMessage,
                  message: text,
                  displayMessage: text,
                },
              ]),
            },
          }))
        },
      })

      const newMessages = result.messages.slice(runtimeMessages.length)
      await saveAgentMessages(newMessages)
      const nextMessages = [...messages, ...newMessages]

      const appliedDocumentChanged = result.appliedMarkdown !== documentStore.getCurrentMarkdown()
      let toolUndoRecords: ToolUndoRecord[] = []
      if (appliedDocumentChanged) {
        set({ sendingStatus: '正在应用工具结果...' })
        useHistoryStore.getState().addHistory({
          type: 'batch',
          description: 'AI agent apply_tool',
        })
        const nextDocument = useDocumentStore.getState().document
        const committedMarkdown = await applyMarkdownTransaction(result.appliedMarkdown, nextDocument?.fileName, { markSaved: true })
        const appliedToolCallId = result.appliedTools.at(-1)?.toolCallId || result.appliedToolCallIds.at(-1)
        const previousMarkdown = result.appliedTools[0]?.previousMarkdown || result.previousMarkdown

        if (appliedToolCallId && previousMarkdown !== committedMarkdown) {
          toolUndoRecords = [
            createToolUndoRecord({
              conversationId,
              toolCallId: appliedToolCallId,
              previousMarkdown,
              appliedMarkdown: committedMarkdown,
            }),
          ]
        }
      }

      // Generated documents are handled through the streamed session state above.

      const now = Date.now()
      const conversation = get().conversations.find((item) => item.id === conversationId)
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
          conversations: [toUiConversation(nextConversation), ...state.conversations.filter((item) => item.id !== conversationId)],
        }))
      }

      set((state) => ({
        isSending: false,
        sendingConversationId: null,
        sendingStatus: null,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: nextMessages,
        },
        visibleMessagesByConversation: {
          ...state.visibleMessagesByConversation,
          [conversationId]: getVisibleMessages(nextMessages),
        },
        toolUndoStackByConversation: {
          ...state.toolUndoStackByConversation,
          [conversationId]: [
            ...(state.toolUndoStackByConversation[conversationId] || []),
            ...toolUndoRecords,
          ],
        },
      }))
      activeAbortController = null
    } catch (error) {
      const failedConversationId = conversationId || get().currentConversationId || ''
      const failedMessage = createFailedAssistantMessage(failedConversationId, error)
      if (failedConversationId) {
        await persistFailedMessage(failedMessage)
      }
      const nextMessages = [...messages, failedMessage]
      set((state) => ({
        isSending: false,
        sendingConversationId: null,
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
      activeAbortController = null
    }
  },

  stopSending: () => {
    activeAbortController?.abort()
    activeAbortController = null
    set({ isSending: false, sendingConversationId: null, sendingStatus: null, error: '已中断 AI 请求。' })
  },

  undoLastToolApply: async () => {
    const conversationId = get().currentConversationId
    if (!conversationId) return false

    const stack = get().toolUndoStackByConversation[conversationId] || []
    const target = [...stack].reverse().find((record) => record.state === 'available')
    if (!target) return false

    useHistoryStore.getState().addHistory({
      type: 'batch',
      description: 'Undo AI agent apply_tool',
    })
    const nextDocument = useDocumentStore.getState().document
    await applyMarkdownTransaction(target.previousMarkdown, nextDocument?.fileName, { markSaved: true })

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
