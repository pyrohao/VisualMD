'use client'

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import {
  createAgentConversationId,
  createDefaultAgentTools,
  deleteAgentConversation,
  deleteAgentReference,
  getAgentDraft,
  getAgentUiState,
  listAgentConversations,
  listAgentMessages,
  listAgentReferences,
  runAgentReActLoop,
  saveAgentConversation,
  saveAgentDraft,
  saveAgentMessage,
  saveAgentMessages,
  saveAgentReference,
  saveAgentUiState,
  splitAssistantThinking,
  type AgentConversation,
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

export type AiReferenceRecord = AiDocReferenceSnapshot & {
  id: string
  conversationId: string
  documentId: string | null
  tabId: string | null
  stale: boolean
  createdAt: number
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
  action?: {
    type: 'tool_apply'
    status: 'pending' | 'confirmed' | 'undone'
    previousMarkdown: string
    appliedMarkdown: string
  }
}

interface AiChatStore {
  conversations: UiConversationRecord[]
  currentConversationId: string | null
  messagesByConversation: Record<string, AgentMessage[]>
  visibleMessagesByConversation: Record<string, VisibleAgentMessage[]>
  referencesByConversation: Record<string, AiReferenceRecord[]>
  draftsByConversation: Record<string, AgentDraft>
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
  confirmToolApply: (messageId: string) => Promise<void>
  undoToolApply: (messageId: string) => Promise<boolean>
}

let activeAbortController: AbortController | null = null

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

function createToolApplyVisibleMessage(args: {
  conversationId: string
  toolCallId: string
  previousMarkdown: string
  appliedMarkdown: string
}) {
  return {
    id: `tool-apply-${args.toolCallId}`,
    conversationId: args.conversationId,
    role: 'assistant',
    message: '工具已应用到文档',
    displayMessage: '工具已应用到文档',
    createdAt: Date.now(),
    state: 'done',
    action: {
      type: 'tool_apply',
      status: 'pending',
      previousMarkdown: args.previousMarkdown,
      appliedMarkdown: args.appliedMarkdown,
    },
  } satisfies VisibleAgentMessage
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

async function syncMarkdownToActiveSource(nextMarkdown: string, nextFileName?: string) {
  const tabsStore = useTabsStore.getState()
  const activeTab = tabsStore.getActiveTab()
  if (!activeTab) return

  tabsStore.updateTabContent(activeTab.id, nextMarkdown)
  tabsStore.markTabAsModified(activeTab.id, true)

  if (activeTab.sourceType === 'git' && activeTab.fileId) {
    useGitStore.getState().updateDraftContent(activeTab.fileId, nextMarkdown)
    return
  }

  if (activeTab.fileId) {
    useFileSystemStore.getState().saveFile(activeTab.fileId, nextMarkdown)
    if (nextFileName) {
      useFileSystemStore.getState().renameFile(activeTab.fileId, nextFileName)
    }
  }
}

export const useAiChatStore = create<AiChatStore>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messagesByConversation: {},
  visibleMessagesByConversation: {},
  referencesByConversation: {},
  draftsByConversation: {},
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
      const [agentConversations, lastOpenConversationId, chatTemperature, chatMaxTokens, chatHistoryRounds] = await Promise.all([
        listAgentConversations(),
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
        draftsByConversation,
        referencesByConversation,
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
      const nextReferences = { ...state.referencesByConversation }
      delete nextReferences[conversationId]
      const nextDrafts = { ...state.draftsByConversation }
      delete nextDrafts[conversationId]
      const conversations = state.conversations.filter((item) => item.id !== conversationId)
      const currentConversationId = state.currentConversationId === conversationId ? conversations[0]?.id || null : state.currentConversationId
      return {
        conversations,
        currentConversationId,
        messagesByConversation: nextMessages,
        visibleMessagesByConversation: nextVisibleMessages,
        referencesByConversation: nextReferences,
        draftsByConversation: nextDrafts,
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

    const conversationId = get().currentConversationId || (await get().createConversation())
    if (!conversationId) return

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
    const messages = [...existingMessages, userMessage]
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

    try {
      activeAbortController = new AbortController()
      const streamingGeneratedFiles = new Map<string, { fileId: string; tabId: string; fileName: string }>()
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
        onGeneratedDocumentEvent: (event) => {
          const fileSystemStore = useFileSystemStore.getState()
          const tabsStore = useTabsStore.getState()

          if (event.type === 'start') {
            fileSystemStore.importFile(event.fileName, '', null)
            const fileId = useFileSystemStore.getState().currentFileId
            if (!fileId) return
            const tabId = tabsStore.openFileInTab(event.fileName, '', fileId)
            streamingGeneratedFiles.set(event.toolCallId, { fileId, tabId, fileName: event.fileName })
            set({ sendingStatus: '正在生成新文档...' })
            return
          }

          const target = streamingGeneratedFiles.get(event.toolCallId)
          if (!target || event.type === 'error') return

          if (event.type === 'delta') {
            set({ sendingStatus: '正在生成新文档...' })
            return
          }

          fileSystemStore.saveFileContent(target.fileId, event.content)
          tabsStore.updateTabContent(target.tabId, event.content)
          tabsStore.markTabAsSaved(target.tabId, target.fileName)
          set({ sendingStatus: '正在写入新文档...' })
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

      const toolApplyMessages = result.appliedToolCallIds.map((toolCallId) =>
        createToolApplyVisibleMessage({
          conversationId,
          toolCallId,
          previousMarkdown: result.previousMarkdown,
          appliedMarkdown: result.appliedMarkdown,
        })
      )

      if (result.appliedMarkdown !== documentStore.getCurrentMarkdown()) {
        set({ sendingStatus: '正在应用工具结果...' })
        useHistoryStore.getState().addHistory({
          type: 'batch',
          description: 'AI agent apply_tool',
        })
        documentStore.applyExternalMarkdown(result.appliedMarkdown)
        const nextDocument = useDocumentStore.getState().document
        await syncMarkdownToActiveSource(result.appliedMarkdown, nextDocument?.fileName)
      }

      result.generatedFiles.forEach((file) => {
        if (streamingGeneratedFiles.has(file.toolCallId)) return
        useFileSystemStore.getState().importFile(file.fileName, file.content, null)
      })

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
          [conversationId]: [...getVisibleMessages(nextMessages), ...toolApplyMessages],
        },
      }))
      activeAbortController = null
    } catch (error) {
      const failedMessage: AgentMessage = {
        id: nanoid(),
        conversationId,
        role: 'assistant',
        message: '',
        createdAt: Date.now(),
        state: 'failed',
        error: formatAgentError(error),
      }
      await saveAgentMessage(failedMessage)
      const nextMessages = [...messages, failedMessage]
      set((state) => ({
        isSending: false,
        sendingConversationId: null,
        sendingStatus: null,
        error: failedMessage.error || 'AI request failed',
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: nextMessages,
        },
        visibleMessagesByConversation: {
          ...state.visibleMessagesByConversation,
          [conversationId]: getVisibleMessages(nextMessages),
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

  confirmToolApply: async (messageId) => {
    const conversationId = get().currentConversationId
    if (!conversationId) return
    const target = (get().visibleMessagesByConversation[conversationId] || []).find((message) => message.id === messageId)
    if (target?.action?.type === 'tool_apply') {
      const nextDocument = useDocumentStore.getState().document
      await syncMarkdownToActiveSource(target.action.appliedMarkdown, nextDocument?.fileName)
    }

    set((state) => ({
      visibleMessagesByConversation: {
        ...state.visibleMessagesByConversation,
        [conversationId]: (state.visibleMessagesByConversation[conversationId] || []).map((message) =>
          message.id === messageId && message.action?.type === 'tool_apply'
            ? {
                ...message,
                displayMessage: '工具应用已确认',
                action: { ...message.action, status: 'confirmed' },
              }
            : message
        ),
      },
    }))
  },

  undoToolApply: async (messageId) => {
    const conversationId = get().currentConversationId
    if (!conversationId) return false

    const target = (get().visibleMessagesByConversation[conversationId] || []).find((message) => message.id === messageId)
    if (!target?.action || target.action.type !== 'tool_apply' || target.action.status !== 'pending') {
      return false
    }

    useHistoryStore.getState().addHistory({
      type: 'batch',
      description: 'Undo AI agent apply_tool',
    })
    useDocumentStore.getState().applyExternalMarkdown(target.action.previousMarkdown)
    const nextDocument = useDocumentStore.getState().document
    await syncMarkdownToActiveSource(target.action.previousMarkdown, nextDocument?.fileName)

    set((state) => ({
      visibleMessagesByConversation: {
        ...state.visibleMessagesByConversation,
        [conversationId]: (state.visibleMessagesByConversation[conversationId] || []).map((message) =>
          message.id === messageId && message.action?.type === 'tool_apply'
            ? {
                ...message,
                displayMessage: '工具应用已撤销',
                action: { ...message.action, status: 'undone' },
              }
            : message
        ),
      },
    }))

    return true
  },
}))
