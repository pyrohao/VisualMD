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
  type AgentConversation,
  type AgentDraft,
  type AgentMessage,
} from '@/lib/agent'
import {
  collectReferencePreview,
  createReferenceSnapshot,
  createReferenceSnapshotFromBlockIndex,
  deriveConversationTitle,
  recalculateReferenceOffsets,
  type AiDocReferenceSnapshot,
  type AiDocTaskType,
} from '@/lib/ai-doc-chat'
import { useAiDockStore } from './aiDockStore'
import { useDocumentStore } from './documentStore'
import { useFileSystemStore } from './fileSystemStore'
import { useGitStore } from './gitStore'
import { useHistoryStore } from './historyStore'
import { useLanguageStore } from './languageStore'
import { useSettingsStore } from './settingsStore'
import { useTabsStore } from './tabsStore'

export type AiReplaceApplyMode = 'manual' | 'auto'

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

interface AiChatStore {
  conversations: UiConversationRecord[]
  currentConversationId: string | null
  messagesByConversation: Record<string, AgentMessage[]>
  visibleMessagesByConversation: Record<string, AgentMessage[]>
  referencesByConversation: Record<string, AiReferenceRecord[]>
  draftsByConversation: Record<string, AgentDraft>
  taskType: AiDocTaskType
  applyMode: AiReplaceApplyMode
  selectionCandidate: AiDocReferenceSnapshot | null
  draftInput: string
  selectedReferenceIds: string[]
  selectionHint: string | null
  isLoading: boolean
  isSending: boolean
  error: string | null
  initialize: () => Promise<void>
  openConversation: (conversationId: string) => Promise<void>
  leaveConversation: () => Promise<void>
  createConversation: () => Promise<string | null>
  removeConversation: (conversationId: string) => Promise<void>
  setDraftInput: (value: string) => Promise<void>
  setTaskType: (taskType: AiDocTaskType) => Promise<void>
  setApplyMode: (mode: AiReplaceApplyMode) => Promise<void>
  addEditorSelectionReference: (
    selectionStart: number,
    selectionEnd: number,
    markdownOverride?: string,
    versionOverride?: number
  ) => Promise<void>
  addPreviewReference: (clickedText: string, clickedTagName?: string, blockIndex?: number | null) => Promise<void>
  commitSelectionCandidate: () => Promise<boolean>
  clearSelectionCandidate: () => void
  removeReference: (referenceId: string) => Promise<void>
  sendMessage: () => Promise<void>
  clearSelectionHint: () => void
  refreshReferenceStaleState: () => Promise<void>
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

function isVisibleAssistantMessage(message: AgentMessage) {
  return message.role === 'assistant' &&
    !message.toolName &&
    message.state === 'done' &&
    Boolean(message.message.trim()) &&
    !message.message.trim().startsWith('{')
}

function getVisibleMessages(messages: AgentMessage[]) {
  return messages.filter(isVisibleAssistantMessage)
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
    selectedReferenceIds,
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

function formatAddedSelectionHint(snapshot: AiDocReferenceSnapshot) {
  const language = useLanguageStore.getState().currentLanguage
  const preview = collectReferencePreview(snapshot)
  const targetLabel =
    preview.titlePath[preview.titlePath.length - 1] ||
    preview.excerpt.slice(0, 24) ||
    'Current block'

  return language === 'zh' ? `已加入对话：${targetLabel}` : `Added to chat: ${targetLabel}`
}

function formatCandidateHint(snapshot: AiDocReferenceSnapshot) {
  const language = useLanguageStore.getState().currentLanguage
  const preview = collectReferencePreview(snapshot)
  const targetLabel =
    preview.titlePath[preview.titlePath.length - 1] ||
    preview.excerpt.slice(0, 24) ||
    'Current block'

  return language === 'zh'
    ? `已选择段落：${targetLabel}，点击加入对话或按 Ctrl+K`
    : `Selected block: ${targetLabel}. Add to chat or press Ctrl+K`
}

function formatDuplicateHint() {
  return useLanguageStore.getState().currentLanguage === 'zh'
    ? '该段内容已在当前对话中'
    : 'This block is already in the current chat'
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
  applyMode: 'auto',
  selectionCandidate: null,
  draftInput: '',
  selectedReferenceIds: [],
  selectionHint: null,
  isLoading: false,
  isSending: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null })
    try {
      const [agentConversations, lastOpenConversationId, applyModeValue] = await Promise.all([
        listAgentConversations(),
        getAgentUiState('last_open_conversation_id'),
        getAgentUiState('replace_apply_mode'),
      ])
      const conversations = agentConversations.map(toUiConversation)
      const currentConversationId =
        lastOpenConversationId && conversations.some((item) => item.id === lastOpenConversationId)
          ? lastOpenConversationId
          : conversations[0]?.id || null

      const messagesByConversation: Record<string, AgentMessage[]> = {}
      const visibleMessagesByConversation: Record<string, AgentMessage[]> = {}
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
        applyMode: applyModeValue === 'manual' ? 'manual' : 'auto',
        draftInput: currentDraft?.inputText || '',
        selectedReferenceIds: currentDraft?.selectedReferenceIds || [],
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
        [conversationId]: messages,
      },
      visibleMessagesByConversation: {
        ...state.visibleMessagesByConversation,
        [conversationId]: getVisibleMessages(messages),
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
      selectedReferenceIds: draft?.selectedReferenceIds || [],
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
        selectedReferenceIds: currentConversationId ? nextDrafts[currentConversationId]?.selectedReferenceIds || [] : [],
      }
    })
  },

  setDraftInput: async (value) => {
    set({ draftInput: value })
    await syncCurrentDraft(get())
  },

  setTaskType: async (taskType) => {
    set({ taskType })
    await syncCurrentDraft(get())
  },

  setApplyMode: async (applyMode) => {
    set({ applyMode })
    await saveAgentUiState('replace_apply_mode', applyMode)
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
      const currentFingerprint = state.selectionCandidate ? getReferenceFingerprint(state.selectionCandidate) : null
      const nextFingerprint = getReferenceFingerprint(snapshot)

      if (currentFingerprint === nextFingerprint || hasDuplicateReference(snapshot, currentReferences)) {
        return {
          selectionCandidate: snapshot,
          selectionHint: hasDuplicateReference(snapshot, currentReferences)
            ? formatDuplicateHint()
            : formatCandidateHint(snapshot),
        }
      }

      return {
        selectionCandidate: snapshot,
        selectionHint: formatCandidateHint(snapshot),
      }
    })
  },

  addPreviewReference: async (clickedText, clickedTagName, blockIndex) => {
    const markdown = useDocumentStore.getState().getCurrentMarkdown()
    const document = useDocumentStore.getState().document
    if (!document) return

    const snapshot =
      typeof blockIndex === 'number'
        ? createReferenceSnapshotFromBlockIndex(markdown, blockIndex, document.version)
        : createReferenceSnapshot({
            markdown,
            clickedText,
            clickedTagName,
            version: document.version,
          })
    if (!snapshot) return

    set({ selectionCandidate: snapshot, selectionHint: formatCandidateHint(snapshot) })
  },

  commitSelectionCandidate: async () => {
    const snapshot = get().selectionCandidate
    if (!snapshot) return false

    const conversationId = get().currentConversationId || (await get().createConversation())
    if (!conversationId) return false

    const currentReferences = get().referencesByConversation[conversationId] || []
    if (hasDuplicateReference(snapshot, currentReferences)) {
      set({ selectionCandidate: null, selectionHint: formatDuplicateHint() })
      useAiDockStore.getState().open()
      return false
    }

    const record = buildReferenceRecord(snapshot, conversationId)
    await saveAgentReference(record)
    set((state) => {
      const references = [...(state.referencesByConversation[conversationId] || []), record]
      const selectedReferenceIds = Array.from(new Set([...state.selectedReferenceIds, record.id]))
      return {
        referencesByConversation: {
          ...state.referencesByConversation,
          [conversationId]: references,
        },
        selectedReferenceIds,
        selectionCandidate: null,
        selectionHint: formatAddedSelectionHint(snapshot),
      }
    })

    useAiDockStore.getState().open()
    await syncCurrentDraft(get())
    return true
  },

  clearSelectionCandidate: () => {
    set({ selectionCandidate: null })
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

    const references = (get().referencesByConversation[conversationId] || []).filter((reference) =>
      get().selectedReferenceIds.includes(reference.id)
    )
    const userMessage = buildUserAgentMessage({
      conversationId,
      taskType: get().taskType,
      input,
      references,
    })

    const existingMessages = get().messagesByConversation[conversationId] || []
    const messages = [...existingMessages, userMessage]

    await saveAgentMessage(userMessage)
    await saveAgentDraft(buildDraftRecord(conversationId, get().taskType, '', get().selectedReferenceIds))

    set((state) => ({
      draftInput: '',
      isSending: true,
      error: null,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: messages,
      },
      visibleMessagesByConversation: {
        ...state.visibleMessagesByConversation,
        [conversationId]: getVisibleMessages(messages),
      },
    }))

    try {
      const result = await runAgentReActLoop({
        providerConfig: {
          ...providerConfig,
          apiKey,
        },
        apiKey,
        messages,
        tools: createDefaultAgentTools(),
        markdown: documentStore.getCurrentMarkdown(),
        maxTurns: 5,
      })

      const newMessages = result.messages.slice(messages.length)
      await saveAgentMessages(newMessages)

      if (result.appliedMarkdown !== documentStore.getCurrentMarkdown()) {
        useHistoryStore.getState().addHistory({
          type: 'batch',
          description: 'AI agent apply_tool',
        })
        documentStore.applyExternalMarkdown(result.appliedMarkdown)
        const nextDocument = useDocumentStore.getState().document
        await syncMarkdownToActiveSource(result.appliedMarkdown, nextDocument?.fileName)
      }

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
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: result.messages,
        },
        visibleMessagesByConversation: {
          ...state.visibleMessagesByConversation,
          [conversationId]: getVisibleMessages(result.messages),
        },
      }))
    } catch (error) {
      const failedMessage: AgentMessage = {
        id: nanoid(),
        conversationId,
        role: 'assistant',
        message: '',
        createdAt: Date.now(),
        state: 'failed',
        error: error instanceof Error ? error.message : 'AI request failed',
      }
      await saveAgentMessage(failedMessage)
      const nextMessages = [...messages, failedMessage]
      set((state) => ({
        isSending: false,
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
    }
  },

  clearSelectionHint: () => {
    set({ selectionHint: null })
  },

  refreshReferenceStaleState: async () => {
    const documentStore = useDocumentStore.getState()
    const document = documentStore.document
    if (!document) return

    const markdown = documentStore.getCurrentMarkdown()
    const version = document.version

    set((state) => {
      const nextReferencesByConversation = { ...state.referencesByConversation }
      Object.entries(nextReferencesByConversation).forEach(([conversationId, references]) => {
        nextReferencesByConversation[conversationId] = references.map((reference) => {
          const refreshedReference = recalculateReferenceOffsets(reference, markdown, version)
          return {
            ...reference,
            ...(refreshedReference || {}),
            stale: !refreshedReference,
          }
        })
      })
      return { referencesByConversation: nextReferencesByConversation }
    })
  },
}))
