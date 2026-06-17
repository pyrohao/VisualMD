import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentDraft, AgentMessage } from '@/lib/agent'
import type { ProviderConfig } from '@/stores/settingsStore'

const storage = vi.hoisted(() => ({
  conversations: [] as AgentConversation[],
  messages: new Map<string, AgentMessage[]>(),
  drafts: new Map<string, AgentDraft>(),
  references: new Map<string, any[]>(),
  ui: new Map<string, string>(),
}))

const providerConfig: ProviderConfig = {
  id: 'custom',
  name: 'Custom',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test',
  model: 'test-model',
  temperature: 0,
  maxTokens: 1000,
  isTested: true,
}

vi.mock('@/lib/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent')>()
  return {
    ...actual,
    createAgentConversationId: vi.fn(() => 'conversation-1'),
    listAgentConversations: vi.fn(async () => storage.conversations),
    listAgentMessages: vi.fn(async (conversationId: string) => storage.messages.get(conversationId) || []),
    listAgentReferences: vi.fn(async (conversationId: string) => storage.references.get(conversationId) || []),
    getAgentDraft: vi.fn(async (conversationId: string) => storage.drafts.get(conversationId) || null),
    getAgentUiState: vi.fn(async (key: string) => storage.ui.get(key) || null),
    saveAgentConversation: vi.fn(async (conversation: AgentConversation) => {
      storage.conversations = [conversation, ...storage.conversations.filter((item) => item.id !== conversation.id)]
      return true
    }),
    saveAgentDraft: vi.fn(async (draft: AgentDraft) => {
      storage.drafts.set(draft.conversationId, draft)
      return true
    }),
    saveAgentMessage: vi.fn(async (message: AgentMessage) => {
      storage.messages.set(message.conversationId, [...(storage.messages.get(message.conversationId) || []), message])
      return true
    }),
    saveAgentMessages: vi.fn(async (messages: AgentMessage[]) => {
      messages.forEach((message) => {
        storage.messages.set(message.conversationId, [...(storage.messages.get(message.conversationId) || []), message])
      })
    }),
    saveAgentReference: vi.fn(async (reference: any) => {
      storage.references.set(reference.conversationId, [...(storage.references.get(reference.conversationId) || []), reference])
      return true
    }),
    deleteAgentReference: vi.fn(async (referenceId: string) => {
      storage.references.forEach((references, conversationId) => {
        storage.references.set(conversationId, references.filter((reference) => reference.id !== referenceId))
      })
    }),
    deleteAgentConversation: vi.fn(async (conversationId: string) => {
      storage.conversations = storage.conversations.filter((item) => item.id !== conversationId)
      storage.messages.delete(conversationId)
      storage.drafts.delete(conversationId)
      storage.references.delete(conversationId)
    }),
    saveAgentUiState: vi.fn(async (key: string, value: string) => {
      storage.ui.set(key, value)
      return true
    }),
    runAgentReActLoop: vi.fn(async (options: { messages: AgentMessage[]; markdown: string }) => ({
      messages: [
        ...options.messages,
        {
          id: 'assistant-tool-1',
          conversationId: options.messages[0]?.conversationId || 'conversation-1',
          role: 'assistant',
          message: '{"tool":"apply_tool","callId":"tool-call-1","argumentKeys":["oldString","newString"]}',
          createdAt: 2,
          toolCallId: 'tool-call-1',
          toolName: 'apply_tool',
          state: 'done',
        } satisfies AgentMessage,
        {
          id: 'tool-1',
          conversationId: options.messages[0]?.conversationId || 'conversation-1',
          role: 'tool',
          message: '{"ok":true,"message":"apply_tool succeeded","metadata":{"matchCount":1}}',
          createdAt: 3,
          toolCallId: 'tool-call-1',
          toolName: 'apply_tool',
          state: 'done',
        } satisfies AgentMessage,
        {
          id: 'assistant-1',
          conversationId: options.messages[0]?.conversationId || 'conversation-1',
          role: 'assistant',
          message: 'Done',
          createdAt: 4,
          state: 'done',
        } satisfies AgentMessage,
      ],
      appliedMarkdown: options.markdown,
      stoppedBecause: 'assistant-text',
    })),
  }
})

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      getActiveProviderConfig: () => providerConfig,
      getActiveProviderApiKey: () => 'test',
    }),
  },
}))

vi.mock('@/stores/documentStore', () => ({
  useDocumentStore: {
    getState: () => ({
      document: { version: 1, fileName: 'doc.md' },
      getCurrentMarkdown: () => '# Doc\n\nSelected text.',
      applyExternalMarkdown: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/tabsStore', () => ({
  useTabsStore: {
    getState: () => ({
      getActiveTab: () => ({ id: 'tab-1', fileId: 'file-1', sourceType: 'local' }),
      updateTabContent: vi.fn(),
      markTabAsModified: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/fileSystemStore', () => ({
  useFileSystemStore: {
    getState: () => ({
      saveFile: vi.fn(),
      renameFile: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/gitStore', () => ({
  useGitStore: {
    getState: () => ({
      updateDraftContent: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/historyStore', () => ({
  useHistoryStore: {
    getState: () => ({
      addHistory: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/aiDockStore', () => ({
  useAiDockStore: {
    getState: () => ({
      open: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: {
    getState: () => ({ currentLanguage: 'zh' }),
  },
}))

describe('ai chat store hook adapter', () => {
  beforeEach(async () => {
    storage.conversations = []
    storage.messages.clear()
    storage.drafts.clear()
    storage.references.clear()
    storage.ui.clear()
    vi.resetModules()
  })

  it('initializes from the new agent store only', async () => {
    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().initialize()

    expect(useAiChatStore.getState().conversations).toEqual([])
    expect(useAiChatStore.getState().currentConversationId).toBeNull()
  })

  it('creates conversations and commits selected references', async () => {
    const { useAiChatStore } = await import('@/stores/aiChatStore')
    const store = useAiChatStore.getState()

    const conversationId = await store.createConversation()
    expect(conversationId).toBe('conversation-1')

    await useAiChatStore.getState().addEditorSelectionReference(7, 20, '# Doc\n\nSelected text.', 1)
    const committed = await useAiChatStore.getState().commitSelectionCandidate()

    expect(committed).toBe(true)
    expect(useAiChatStore.getState().referencesByConversation['conversation-1']).toHaveLength(1)
    expect(storage.references.get('conversation-1')).toHaveLength(1)
  })

  it('sends user messages through the agent runtime', async () => {
    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().setDraftInput('润色')
    await useAiChatStore.getState().sendMessage()

    const messages = useAiChatStore.getState().messagesByConversation['conversation-1']
    const visibleMessages = useAiChatStore.getState().visibleMessagesByConversation['conversation-1']
    expect(messages.some((message) => message.role === 'user')).toBe(true)
    expect(messages.some((message) => message.role === 'tool' || message.toolName)).toBe(true)
    expect(visibleMessages.every((message) => message.role === 'assistant')).toBe(true)
    expect(messages.at(-1)?.message).toBe('Done')
    expect(visibleMessages.at(-1)?.message).toBe('Done')
    expect(useAiChatStore.getState().isSending).toBe(false)
  })
})
