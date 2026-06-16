'use client'

import { create } from 'zustand'
import { nanoid } from 'nanoid'
import {
  applyDocumentChatAction,
  buildTrackedRangeFromReference,
  collectReferencePreview,
  createReferenceSnapshot,
  createReferenceSnapshotFromBlockIndex,
  deriveConversationTitle,
  isReferenceStale,
  parseDocumentChatResponse,
  recalculateReferenceOffsets,
  updateTrackedRangeForEdit,
  type AiDocAction,
  type AiDocReferenceSnapshot,
  type AiDocTaskType,
  type AiDocTextEdit,
  type AiDocTrackedRange,
} from '@/lib/ai-doc-chat'
import {
  deleteAiConversationCascade,
  deleteAiReference,
  getAiDraft,
  getAiUiState,
  listAiConversations,
  listAiMessages,
  listAiReferences,
  saveAiConversation,
  saveAiDraft,
  saveAiMessage,
  saveAiReference,
  saveAiUiState,
  type AiConversationRecord,
  type AiDraftRecord,
  type AiMessageRecord,
  type AiReferenceRecord,
} from '@/lib/ai-chat-storage'
import { useDocumentStore } from './documentStore'
import { useSettingsStore } from './settingsStore'
import { useTabsStore } from './tabsStore'
import { createAIService } from '@/lib/ai-service'
import { useGitStore } from './gitStore'
import { useFileSystemStore } from './fileSystemStore'
import { useHistoryStore } from './historyStore'
import { useAiDockStore } from './aiDockStore'
import { useLanguageStore } from './languageStore'

interface PendingReplaceState {
  messageId: string
  action: Extract<AiDocAction, { action: 'replace' }>
  referenceId: string | null
  previewMarkdown: string
}

export type AiReplaceApplyMode = 'manual' | 'auto'

interface AiChatStore {
  conversations: AiConversationRecord[]
  currentConversationId: string | null
  messagesByConversation: Record<string, AiMessageRecord[]>
  referencesByConversation: Record<string, AiReferenceRecord[]>
  draftsByConversation: Record<string, AiDraftRecord>
  taskType: AiDocTaskType
  applyMode: AiReplaceApplyMode
  selectionCandidate: AiDocReferenceSnapshot | null
  draftInput: string
  selectedReferenceIds: string[]
  selectionHint: string | null
  pendingReplace: PendingReplaceState | null
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
  applyPendingReplace: () => Promise<boolean>
  discardPendingReplace: () => void
  clearSelectionHint: () => void
  refreshReferenceStaleState: () => Promise<void>
  getPendingTrackedRange: () => AiDocTrackedRange | null
  validateEditForPendingReplace: (edit: AiDocTextEdit) => { allowed: boolean; reason?: string }
}

function getCurrentDocumentIdentity() {
  const activeTab = useTabsStore.getState().getActiveTab()
  return {
    tabId: activeTab?.id || null,
    documentId: activeTab?.fileId || null,
    sourceType: activeTab?.sourceType || 'unknown',
  } as const
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
  } satisfies AiDraftRecord
}

function normalizeApplyMode(value: string | null): AiReplaceApplyMode {
  return value === 'auto' ? 'auto' : 'manual'
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

function syncCurrentDraft(store: Pick<AiChatStore, 'currentConversationId' | 'draftInput' | 'taskType' | 'selectedReferenceIds'>) {
  if (!store.currentConversationId) return Promise.resolve()
  return saveAiDraft(buildDraftRecord(store.currentConversationId, store.taskType, store.draftInput, store.selectedReferenceIds))
}

function updateOpenConversationUiState(conversationId: string | null) {
  if (!conversationId) return Promise.resolve()
  return saveAiUiState('last_open_conversation_id', conversationId)
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

function buildConversationRecord(title: string, taskType: AiDocTaskType): AiConversationRecord {
  const identity = getCurrentDocumentIdentity()
  const settings = useSettingsStore.getState()
  const providerConfig = settings.getActiveProviderConfig()
  const now = Date.now()

  return {
    id: nanoid(),
    title,
    documentId: identity.documentId,
    tabId: identity.tabId,
    sourceType: identity.sourceType === 'git' || identity.sourceType === 'local' ? identity.sourceType : 'unknown',
    taskType,
    status: 'active',
    providerId: providerConfig.id,
    model: providerConfig.model,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    messageCount: 0,
  }
}

function formatSelectionHint(snapshot: AiDocReferenceSnapshot) {
  const language = useLanguageStore.getState().currentLanguage
  const preview = collectReferencePreview(snapshot)
  const targetLabel =
    preview.titlePath[preview.titlePath.length - 1] ||
    preview.excerpt.slice(0, 24) ||
    (language === 'zh' ? '当前块' : 'Current block')

  return language === 'zh' ? `已加入对话：${targetLabel}` : `Added to chat: ${targetLabel}`
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

function buildPrompt(args: {
  taskType: AiDocTaskType
  input: string
  markdown: string
  references: AiReferenceRecord[]
}) {
  const referenceText = args.references
    .map((reference, index) => {
      return [
        `Reference ${index + 1}`,
        `anchorPath: ${reference.anchorPath.join(' > ') || 'root'}`,
        `blockType: ${reference.blockType}`,
        `blockCount: ${reference.blockCount}`,
        'excerpt:',
        reference.excerpt,
      ].join('\n')
    })
    .join('\n\n')

  return [
    `Task type: ${args.taskType}`,
    'User request:',
    args.input,
    '',
    'Document excerpt references:',
    referenceText || 'None',
    '',
    'Current markdown:',
    args.markdown,
  ].join('\n')
}

function buildSystemPrompt() {
  return [
    'You are an AI document editing assistant for Markdown.',
    'Return JSON only.',
    'Schema:',
    '{"action":"answer|replace","answer?":"string","content?":"string"}',
    'Rules:',
    '- Use action="answer" for pure Q&A, explanation, analysis, review comments, or any request that should not modify the document.',
    '- Use action="replace" only when the user clearly wants to modify the selected content.',
    '- For action="replace", return the full replacement content for the selected target range.',
    '- Do not return diff, patch metadata, line numbers, or offsets.',
  ].join('\n')
}

function syncLockedReferenceState(
  referencesByConversation: Record<string, AiReferenceRecord[]>,
  conversationId: string,
  lockedReferenceId: string | null
) {
  const currentReferences = referencesByConversation[conversationId] || []
  const nextReferences = currentReferences.map((reference) => {
    const nextLocked = lockedReferenceId ? reference.id === lockedReferenceId : false
    if (reference.locked === nextLocked) {
      return reference
    }

    return {
      ...reference,
      locked: nextLocked,
    }
  })

  return {
    nextReferencesByConversation: {
      ...referencesByConversation,
      [conversationId]: nextReferences,
    },
    changedReferences: nextReferences.filter((reference, index) => reference !== currentReferences[index]),
  }
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
  referencesByConversation: {},
  draftsByConversation: {},
  taskType: 'ask',
  applyMode: 'manual',
  selectionCandidate: null,
  draftInput: '',
  selectedReferenceIds: [],
  selectionHint: null,
  pendingReplace: null,
  isLoading: false,
  isSending: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null })
    try {
      const [conversations, lastOpenConversationId] = await Promise.all([
        listAiConversations(),
        getAiUiState('last_open_conversation_id'),
      ])
      const applyMode = normalizeApplyMode(await getAiUiState('replace_apply_mode'))

      const currentConversationId =
        lastOpenConversationId === ''
          ? null
          : lastOpenConversationId && conversations.some((item) => item.id === lastOpenConversationId)
            ? lastOpenConversationId
            : null

      const messagesByConversation: Record<string, AiMessageRecord[]> = {}
      const referencesByConversation: Record<string, AiReferenceRecord[]> = {}
      const draftsByConversation: Record<string, AiDraftRecord> = {}

      if (currentConversationId) {
        messagesByConversation[currentConversationId] = await listAiMessages(currentConversationId)
        referencesByConversation[currentConversationId] = await listAiReferences(currentConversationId)
        const draft = await getAiDraft(currentConversationId)
        if (draft) {
          draftsByConversation[currentConversationId] = draft
        }
      }

      const currentDraft = currentConversationId ? draftsByConversation[currentConversationId] : undefined

      set({
        conversations,
        currentConversationId,
        messagesByConversation,
        referencesByConversation,
        draftsByConversation,
        taskType: currentDraft?.taskType || 'ask',
        applyMode,
        selectionCandidate: null,
        draftInput: currentDraft?.inputText || '',
        selectedReferenceIds: currentDraft?.selectedReferenceIds || [],
        selectionHint: null,
        isLoading: false,
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize AI chat',
      })
    }
  },

  openConversation: async (conversationId) => {
    const existingMessages = get().messagesByConversation[conversationId]
    const existingReferences = get().referencesByConversation[conversationId]
    const existingDraft = get().draftsByConversation[conversationId]

    const [messages, references, draft] = await Promise.all([
      existingMessages ? Promise.resolve(existingMessages) : listAiMessages(conversationId),
      existingReferences ? Promise.resolve(existingReferences) : listAiReferences(conversationId),
      existingDraft ? Promise.resolve(existingDraft) : getAiDraft(conversationId),
    ])

    set((state) => ({
      currentConversationId: conversationId,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: messages,
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
      taskType: draft?.taskType || 'ask',
      draftInput: draft?.inputText || '',
      selectedReferenceIds: draft?.selectedReferenceIds || references.map((reference) => reference.id),
      selectionCandidate: null,
      pendingReplace: null,
      error: null,
    }))

    await updateOpenConversationUiState(conversationId)
  },

  leaveConversation: async () => {
    set({
      currentConversationId: null,
      selectionCandidate: null,
      pendingReplace: null,
    })
    await saveAiUiState('last_open_conversation_id', '')
  },

  createConversation: async () => {
    const title = deriveConversationTitle(get().draftInput, 'New chat')
    const conversation = buildConversationRecord(title, get().taskType)

    await saveAiConversation(conversation)
    const draft = buildDraftRecord(conversation.id, get().taskType, get().draftInput, [])
    await saveAiDraft(draft)

    set((state) => ({
      conversations: [conversation, ...state.conversations],
      currentConversationId: conversation.id,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversation.id]: [],
      },
      referencesByConversation: {
        ...state.referencesByConversation,
        [conversation.id]: [],
      },
      draftsByConversation: {
        ...state.draftsByConversation,
        [conversation.id]: draft,
      },
      selectedReferenceIds: [],
      selectionCandidate: null,
    }))

    await updateOpenConversationUiState(conversation.id)
    return conversation.id
  },

  removeConversation: async (conversationId) => {
    await deleteAiConversationCascade(conversationId)
    set((state) => {
      const nextMessages = { ...state.messagesByConversation }
      delete nextMessages[conversationId]
      const nextReferences = { ...state.referencesByConversation }
      delete nextReferences[conversationId]
      const nextDrafts = { ...state.draftsByConversation }
      delete nextDrafts[conversationId]
      const nextConversations = state.conversations.filter((item) => item.id !== conversationId)
      const nextCurrentConversationId =
        state.currentConversationId === conversationId ? nextConversations[0]?.id || null : state.currentConversationId

      return {
        conversations: nextConversations,
        currentConversationId: nextCurrentConversationId,
        messagesByConversation: nextMessages,
        referencesByConversation: nextReferences,
        draftsByConversation: nextDrafts,
        draftInput: nextCurrentConversationId ? nextDrafts[nextCurrentConversationId]?.inputText || '' : '',
        selectedReferenceIds: nextCurrentConversationId ? nextDrafts[nextCurrentConversationId]?.selectedReferenceIds || [] : [],
        selectionCandidate: null,
        pendingReplace: null,
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
    await saveAiUiState('replace_apply_mode', applyMode)
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

  commitSelectionCandidate: async () => {
    const snapshot = get().selectionCandidate
    if (!snapshot) {
      return false
    }

    const conversationId = get().currentConversationId || (await get().createConversation())
    if (!conversationId) {
      return false
    }

    const currentReferences = get().referencesByConversation[conversationId] || []
    if (hasDuplicateReference(snapshot, currentReferences)) {
      set({
        currentConversationId: conversationId,
        selectionCandidate: null,
        selectionHint: formatDuplicateHint(),
      })
      useAiDockStore.getState().open()
      return false
    }

    const record = buildReferenceRecord(snapshot, conversationId)
    await saveAiReference(record)

    set((state) => {
      const references = [...(state.referencesByConversation[conversationId] || []), record]
      const selectedReferenceIds = Array.from(new Set([...state.selectedReferenceIds, record.id]))
      return {
        currentConversationId: conversationId,
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

    await deleteAiReference(referenceId)

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

    const unlockedBeforeSend = syncLockedReferenceState(get().referencesByConversation, conversationId, null)
    if (unlockedBeforeSend.changedReferences.length > 0) {
      await Promise.all(unlockedBeforeSend.changedReferences.map((reference) => saveAiReference(reference)))
      set({
        referencesByConversation: unlockedBeforeSend.nextReferencesByConversation,
        pendingReplace: null,
      })
    }

    const references = (get().referencesByConversation[conversationId] || []).filter((reference) =>
      get().selectedReferenceIds.includes(reference.id)
    )

    const userMessage: AiMessageRecord = {
      id: nanoid(),
      conversationId,
      role: 'user',
      content: input,
      createdAt: Date.now(),
      state: 'done',
      action: null,
      referenceIds: references.map((reference) => reference.id),
    }

    const assistantMessage: AiMessageRecord = {
      id: nanoid(),
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: Date.now() + 1,
      state: 'pending',
      action: null,
      referenceIds: references.map((reference) => reference.id),
    }

    const nextConversation = {
      ...(get().conversations.find((item) => item.id === conversationId) || buildConversationRecord(deriveConversationTitle(input), get().taskType)),
      id: conversationId,
      title: deriveConversationTitle(input),
      updatedAt: Date.now(),
      lastMessageAt: Date.now(),
      messageCount: (get().messagesByConversation[conversationId] || []).length + 2,
      taskType: get().taskType,
    } satisfies AiConversationRecord

    await Promise.all([
      saveAiMessage(userMessage),
      saveAiMessage(assistantMessage),
      saveAiConversation(nextConversation),
    ])

    set((state) => ({
      conversations: [nextConversation, ...state.conversations.filter((item) => item.id !== conversationId)],
      currentConversationId: conversationId,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: [...(state.messagesByConversation[conversationId] || []), userMessage, assistantMessage],
      },
      isSending: true,
      error: null,
      pendingReplace: null,
    }))

    await saveAiDraft(buildDraftRecord(conversationId, get().taskType, '', get().selectedReferenceIds))
    set({ draftInput: '' })

    try {
      const service = createAIService({
        ...providerConfig,
        apiKey,
      })

      const response = await service.chatDocument({
        prompt: buildPrompt({
          taskType: get().taskType,
          input,
          markdown: documentStore.getCurrentMarkdown(),
          references,
        }),
        systemPrompt: buildSystemPrompt(),
      })

      const parsed = parseDocumentChatResponse(response)
      const appliedReference = references[0] || null
      let previewMarkdown = documentStore.getCurrentMarkdown()

      if (appliedReference && parsed.action.action === 'replace' && !isReferenceStale(appliedReference, previewMarkdown, document.version)) {
        previewMarkdown = applyDocumentChatAction(previewMarkdown, appliedReference, parsed.action, document.version)
      }

      const finalAssistantMessage: AiMessageRecord = {
        ...assistantMessage,
        content: parsed.action.action === 'answer' ? parsed.action.answer || '' : parsed.action.content || '',
        state: 'done',
        action: parsed.action,
      }

      await saveAiMessage(finalAssistantMessage)

      let nextReferencesByConversation = get().referencesByConversation
      if (parsed.action.action === 'replace' && appliedReference) {
        const lockedState = syncLockedReferenceState(nextReferencesByConversation, conversationId, appliedReference.id)
        nextReferencesByConversation = lockedState.nextReferencesByConversation
        if (lockedState.changedReferences.length > 0) {
          await Promise.all(lockedState.changedReferences.map((reference) => saveAiReference(reference)))
        }
      }

      set((state) => ({
        isSending: false,
        referencesByConversation: nextReferencesByConversation,
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: (state.messagesByConversation[conversationId] || []).map((message) =>
            message.id === assistantMessage.id ? finalAssistantMessage : message
          ),
        },
        pendingReplace:
          parsed.action.action === 'replace' && appliedReference
            ? {
                messageId: finalAssistantMessage.id,
                action: parsed.action,
                referenceId: appliedReference.id,
                previewMarkdown,
              }
            : null,
      }))

      if (parsed.action.action === 'replace' && appliedReference && get().applyMode === 'auto') {
        await get().applyPendingReplace()
      }
    } catch (error) {
      const failedAssistantMessage: AiMessageRecord = {
        ...assistantMessage,
        state: 'failed',
        error: error instanceof Error ? error.message : 'AI request failed',
      }

      await saveAiMessage(failedAssistantMessage)

      set((state) => ({
        isSending: false,
        error: failedAssistantMessage.error || 'AI request failed',
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: (state.messagesByConversation[conversationId] || []).map((message) =>
            message.id === assistantMessage.id ? failedAssistantMessage : message
          ),
        },
      }))
    }
  },

  applyPendingReplace: async () => {
    const pendingReplace = get().pendingReplace
    const conversationId = get().currentConversationId
    const documentStore = useDocumentStore.getState()
    const document = documentStore.document
    if (!pendingReplace || !conversationId || !document) {
      return false
    }

    const reference = (get().referencesByConversation[conversationId] || []).find((item) => item.id === pendingReplace.referenceId)
    if (!reference) {
      set({ error: 'Reference not found for apply' })
      return false
    }

    const latestMarkdown = documentStore.getCurrentMarkdown()
    const latestVersion = document.version
    if (isReferenceStale(reference, latestMarkdown, latestVersion)) {
      set({ error: 'Reference is stale and cannot be applied' })
      return false
    }

    const nextMarkdown = applyDocumentChatAction(latestMarkdown, reference, pendingReplace.action, latestVersion)
    if (nextMarkdown === latestMarkdown) {
      set({ error: 'Replace action could not be applied' })
      return false
    }

    useHistoryStore.getState().addHistory({
      type: 'batch',
      description: 'AI replace apply',
    })
    documentStore.applyExternalMarkdown(nextMarkdown)

    const nextDocument = useDocumentStore.getState().document
    await syncMarkdownToActiveSource(nextMarkdown, nextDocument?.fileName)

    const unlockedAfterApply = syncLockedReferenceState(get().referencesByConversation, conversationId, null)
    if (unlockedAfterApply.changedReferences.length > 0) {
      await Promise.all(unlockedAfterApply.changedReferences.map((item) => saveAiReference(item)))
    }

    set({
      pendingReplace: null,
      error: null,
      referencesByConversation: unlockedAfterApply.nextReferencesByConversation,
    })
    await get().refreshReferenceStaleState()
    return true
  },

  discardPendingReplace: () => {
    const conversationId = get().currentConversationId
    if (!conversationId) {
      set({ pendingReplace: null })
      return
    }

    const unlocked = syncLockedReferenceState(get().referencesByConversation, conversationId, null)
    void Promise.all(unlocked.changedReferences.map((reference) => saveAiReference(reference)))

    set({
      pendingReplace: null,
      referencesByConversation: unlocked.nextReferencesByConversation,
    })
  },

  clearSelectionHint: () => {
    set({ selectionHint: null })
  },

  getPendingTrackedRange: () => {
    const pendingReplace = get().pendingReplace
    const conversationId = get().currentConversationId
    if (!pendingReplace || !conversationId || !pendingReplace.referenceId) {
      return null
    }

    const reference = (get().referencesByConversation[conversationId] || []).find(
      (item) => item.id === pendingReplace.referenceId
    )
    if (!reference || reference.stale) {
      return null
    }

    return buildTrackedRangeFromReference(reference)
  },

  validateEditForPendingReplace: (edit) => {
    const trackedRange = get().getPendingTrackedRange()
    if (!trackedRange) {
      return { allowed: true }
    }

    const nextRange = updateTrackedRangeForEdit(trackedRange, edit)
    if (nextRange.blocked) {
      return {
        allowed: false,
        reason: useLanguageStore.getState().currentLanguage === 'zh'
          ? 'AI 待应用区块已锁定，请先应用或取消本次替换。'
          : 'The pending AI replace target is locked. Apply or discard it first.',
      }
    }

    return { allowed: true }
  },

  refreshReferenceStaleState: async () => {
    const documentStore = useDocumentStore.getState()
    const document = documentStore.document
    if (!document) return

    const markdown = documentStore.getCurrentMarkdown()
    const version = document.version

    const updates: Array<Promise<unknown>> = []

    set((state) => {
      const nextReferencesByConversation = { ...state.referencesByConversation }

      Object.entries(nextReferencesByConversation).forEach(([conversationId, references]) => {
        nextReferencesByConversation[conversationId] = references.map((reference) => {
          const refreshedReference = recalculateReferenceOffsets(reference, markdown, version)
          const stale = refreshedReference ? false : true
          const nextReference: AiReferenceRecord = {
            ...reference,
            ...(refreshedReference || {}),
            stale,
          }
          const changed =
            stale !== reference.stale ||
            nextReference.startOffset !== reference.startOffset ||
            nextReference.endOffset !== reference.endOffset ||
            nextReference.expectedText !== reference.expectedText ||
            nextReference.version !== reference.version

          if (changed) {
            updates.push(saveAiReference(nextReference))
          }

          return nextReference
        })
      })

      return {
        referencesByConversation: nextReferencesByConversation,
      }
    })

    await Promise.all(updates)
  },
}))
