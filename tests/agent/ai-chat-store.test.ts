import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentDraft, AgentMessage } from '@/lib/agent'
import type { ProviderConfig } from '@/stores/settingsStore'

const storage = vi.hoisted(() => ({
  conversations: [] as AgentConversation[],
  messages: new Map<string, AgentMessage[]>(),
  drafts: new Map<string, AgentDraft>(),
  references: new Map<string, any[]>(),
  ui: new Map<string, string>(),
  documentSessions: new Map<string, any>(),
  documentMarkdown: '# Doc\n\nSelected text.',
  applyExternalMarkdown: vi.fn((markdown: string) => {
    storage.documentMarkdown = markdown
    return true
  }),
  markAsSaved: vi.fn(),
  importFile: vi.fn(),
  loadDocument: vi.fn(),
  saveFile: vi.fn(),
  saveFileContent: vi.fn(),
  openFileInTab: vi.fn(),
  updateTabContent: vi.fn(),
  markTabAsModified: vi.fn(),
  markTabAsSaved: vi.fn(),
  openGitFileInTab: vi.fn(),
  createGitFile: vi.fn(),
  updateDraftContent: vi.fn(),
  currentFileId: null as string | null,
  files: [] as Array<{ id: string; name: string }>,
  gitConnected: false,
  currentGitDocumentId: null as string | null,
  gitDrafts: {} as Record<string, any>,
}))

const providerConfig: ProviderConfig = {
  id: 'custom',
  name: 'Custom',
  protocol: 'openai-compatible',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test',
  model: 'test-model',
  models: [],
  modelDiscovery: { type: 'openai-models', path: '/models' },
  authType: 'bearer',
  openAIEndpoint: 'chat-completions',
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
      const grouped = new Map<string, AgentMessage[]>()
      messages.forEach((message) => {
        grouped.set(message.conversationId, [...(grouped.get(message.conversationId) || []), message])
      })
      grouped.forEach((records, conversationId) => {
        const nextById = new Map((storage.messages.get(conversationId) || []).map((message) => [message.id, message]))
        records.forEach((message) => nextById.set(message.id, message))
        storage.messages.set(conversationId, Array.from(nextById.values()).sort((left, right) => left.createdAt - right.createdAt))
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
    saveAgentDocumentSession: vi.fn(async (session: any) => {
      storage.documentSessions.set(session.conversationId, session)
      return true
    }),
    getAgentDocumentSession: vi.fn(async (conversationId: string) => storage.documentSessions.get(conversationId) || null),
    listAgentDocumentSessions: vi.fn(async () => Array.from(storage.documentSessions.values())),
    deleteAgentDocumentSession: vi.fn(async (conversationId: string) => {
      storage.documentSessions.delete(conversationId)
    }),
    runAgentReActLoop: vi.fn(async (options: {
      messages: AgentMessage[]
      markdown: string
      onAssistantTextDelta?: (text: string) => void
    }) => {
      options.onAssistantTextDelta?.('Do')
      options.onAssistantTextDelta?.('Done')
      return {
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
        appliedMarkdown: '# Doc\n\nChanged text.',
        previousMarkdown: options.markdown,
        appliedToolCallIds: ['tool-call-1'],
        appliedTools: [
          {
            toolCallId: 'tool-call-1',
            previousMarkdown: options.markdown,
            appliedMarkdown: '# Doc\n\nChanged text.',
          },
        ],
        generatedFiles: [],
        stoppedBecause: 'assistant-text',
      }
    }),
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
      getCurrentMarkdown: () => storage.documentMarkdown,
      applyExternalMarkdown: storage.applyExternalMarkdown,
      markAsSaved: storage.markAsSaved,
      loadDocument: storage.loadDocument,
    }),
  },
}))

vi.mock('@/stores/tabsStore', () => ({
  useTabsStore: {
    getState: () => ({
      getActiveTab: () => ({ id: 'tab-1', fileId: 'file-1', sourceType: 'local' }),
      openFileInTab: storage.openFileInTab,
      openGitFileInTab: storage.openGitFileInTab,
      updateTabContent: storage.updateTabContent,
      markTabAsModified: storage.markTabAsModified,
      markTabAsSaved: storage.markTabAsSaved,
    }),
  },
}))

vi.mock('@/stores/fileSystemStore', () => ({
  useFileSystemStore: {
    getState: () => ({
      currentFileId: storage.currentFileId,
      saveFile: storage.saveFile,
      saveFileContent: storage.saveFileContent,
      renameFile: vi.fn(),
      importFile: storage.importFile,
    }),
  },
}))

vi.mock('@/stores/gitStore', () => ({
  useGitStore: {
    getState: () => ({
      connected: storage.gitConnected,
      config: {
        provider: 'github',
        ownerOrNamespace: 'owner',
        repo: 'repo',
        branch: 'main',
      },
      currentDocumentId: storage.currentGitDocumentId,
      drafts: storage.gitDrafts,
      createFile: storage.createGitFile,
      updateDraftContent: storage.updateDraftContent,
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
    storage.documentSessions.clear()
    storage.documentMarkdown = '# Doc\n\nSelected text.'
    storage.applyExternalMarkdown.mockClear()
    storage.markAsSaved.mockClear()
    storage.currentFileId = null
    storage.files = []
    storage.importFile.mockClear()
    storage.loadDocument.mockClear()
    storage.saveFile.mockClear()
    storage.saveFileContent.mockClear()
    storage.openFileInTab.mockClear()
    storage.updateTabContent.mockClear()
    storage.markTabAsModified.mockClear()
    storage.markTabAsSaved.mockClear()
    storage.openGitFileInTab.mockClear()
    storage.createGitFile.mockClear()
    storage.updateDraftContent.mockClear()
    storage.gitConnected = false
    storage.currentGitDocumentId = null
    storage.gitDrafts = {}
    storage.importFile.mockImplementation((name: string) => {
      storage.currentFileId = 'generated-file-1'
      storage.files = [...storage.files, { id: 'generated-file-1', name }]
    })
    storage.openFileInTab.mockReturnValue('generated-tab-1')
    storage.openGitFileInTab.mockReturnValue('generated-git-tab-1')
    storage.createGitFile.mockImplementation(async (path: string, content: string) => {
      storage.currentGitDocumentId = `git:github:owner/repo:main:${path}`
      storage.gitDrafts[storage.currentGitDocumentId] = {
        documentId: storage.currentGitDocumentId,
        path,
        name: path.split('/').pop() || path,
        provider: 'github',
        ownerOrNamespace: 'owner',
        repo: 'repo',
        branch: 'main',
        draftContent: content,
        originalContent: '',
        isDirty: Boolean(content),
        isNew: true,
      }
    })
    storage.updateDraftContent.mockImplementation((documentId: string, content: string) => {
      storage.gitDrafts[documentId] = {
        ...storage.gitDrafts[documentId],
        draftContent: content,
        content,
        isDirty: true,
      }
    })
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

  it('keeps one pending selection candidate until it is added or cleared', async () => {
    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()

    await useAiChatStore.getState().addEditorSelectionReference(7, 20, '# Doc\n\nSelected text.', 1)
    const firstCandidate = useAiChatStore.getState().selectionCandidate
    expect(firstCandidate?.expectedText).toBe('Selected text')

    await useAiChatStore.getState().addEditorSelectionReference(2, 5, '# Doc\n\nSelected text.', 1)
    const secondCandidate = useAiChatStore.getState().selectionCandidate
    expect(secondCandidate?.expectedText).toBe('Selected text')
    expect(useAiChatStore.getState().referencesByConversation['conversation-1']).toHaveLength(0)

    useAiChatStore.getState().clearSelectionCandidate()
    await useAiChatStore.getState().addEditorSelectionReference(2, 5, '# Doc\n\nSelected text.', 1)
    expect(useAiChatStore.getState().selectionCandidate?.expectedText).toBe('Doc')

    const committed = await useAiChatStore.getState().commitSelectionCandidate()
    expect(committed).toBe(true)
    expect(useAiChatStore.getState().selectionCandidate).toBeNull()
    expect(useAiChatStore.getState().referencesByConversation['conversation-1']).toHaveLength(1)
    expect(useAiChatStore.getState().referencesByConversation['conversation-1']?.[0]?.expectedText).toBe('Doc')
  })

  it('replaces the previous committed reference instead of keeping multiple blocks', async () => {
    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()

    await useAiChatStore.getState().addEditorSelectionReference(7, 20, '# Doc\n\nSelected text.', 1)
    await useAiChatStore.getState().commitSelectionCandidate()
    const firstReferenceId = useAiChatStore.getState().selectedReferenceIds[0]

    await useAiChatStore.getState().addEditorSelectionReference(2, 5, '# Doc\n\nSelected text.', 1)
    await useAiChatStore.getState().commitSelectionCandidate()
    const state = useAiChatStore.getState()

    expect(state.referencesByConversation['conversation-1']).toHaveLength(1)
    expect(state.referencesByConversation['conversation-1']?.[0]?.expectedText).toBe('Doc')
    expect(state.selectedReferenceIds).toHaveLength(1)
    expect(state.selectedReferenceIds[0]).not.toBe(firstReferenceId)
  })

  it('sends user messages through the agent runtime', async () => {
    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().addEditorSelectionReference(7, 20, '# Doc\n\nSelected text.', 1)
    await useAiChatStore.getState().commitSelectionCandidate()
    await useAiChatStore.getState().setDraftInput('润色')
    await useAiChatStore.getState().sendMessage()

    const messages = useAiChatStore.getState().messagesByConversation['conversation-1']
    const visibleMessages = useAiChatStore.getState().visibleMessagesByConversation['conversation-1']
    expect(messages.some((message) => message.role === 'user')).toBe(true)
    expect(messages.some((message) => message.role === 'tool' || message.toolName)).toBe(true)
    expect(visibleMessages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(visibleMessages[0]?.displayMessage).toBe('润色')
    expect(messages.at(-1)?.message).toBe('Done')
    expect(visibleMessages[1]?.message).toBe('Done')
    expect(storage.documentMarkdown).toBe('# Doc\n\nChanged text.')
    expect(storage.applyExternalMarkdown).toHaveBeenCalledWith('# Doc\n\nChanged text.')
    expect(storage.updateTabContent).toHaveBeenCalledWith('tab-1', '# Doc\n\nChanged text.')
    expect(storage.saveFileContent).toHaveBeenCalledWith('file-1', '# Doc\n\nChanged text.')
    expect(storage.markTabAsSaved).toHaveBeenCalledWith('tab-1', 'doc.md')
    expect(storage.markAsSaved).toHaveBeenCalled()
    expect(useAiChatStore.getState().toolUndoStackByConversation['conversation-1']).toHaveLength(1)
    expect(messages[0]?.message).toContain('Selected text')
    expect(useAiChatStore.getState().selectedReferenceIds).toEqual([])
    expect(useAiChatStore.getState().referencesByConversation['conversation-1']).toEqual([])
    expect(storage.references.get('conversation-1')).toEqual([])
    expect(storage.drafts.get('conversation-1')?.selectedReferenceIds).toEqual([])
    expect(Array.from(storage.messages.keys())).toEqual(['conversation-1'])
    expect(storage.messages.get('conversation-1')).toHaveLength(messages.length)
    expect(new Set(storage.messages.get('conversation-1')?.map((message) => message.id))).toEqual(
      new Set(messages.map((message) => message.id))
    )
    expect(useAiChatStore.getState().isSending).toBe(false)
  })

  it('undoes the last automatically applied tool change from the stack', async () => {
    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().setDraftInput('润色')
    await useAiChatStore.getState().sendMessage()

    expect(storage.documentMarkdown).toBe('# Doc\n\nChanged text.')
    expect(useAiChatStore.getState().toolUndoStackByConversation['conversation-1']).toHaveLength(1)

    storage.saveFileContent.mockClear()
    storage.markTabAsSaved.mockClear()
    const undone = await useAiChatStore.getState().undoLastToolApply()

    expect(undone).toBe(true)
    expect(storage.documentMarkdown).toBe('# Doc\n\nSelected text.')
    expect(storage.saveFileContent).toHaveBeenCalledWith('file-1', '# Doc\n\nSelected text.')
    expect(storage.markTabAsSaved).toHaveBeenCalledWith('tab-1', 'doc.md')
    expect(
      useAiChatStore.getState().toolUndoStackByConversation['conversation-1']?.[0]?.state
    ).toBe('undone')
  })

  it('dismisses the latest available tool undo prompt without changing the document', async () => {
    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().setDraftInput('润色')
    await useAiChatStore.getState().sendMessage()

    expect(storage.documentMarkdown).toBe('# Doc\n\nChanged text.')
    useAiChatStore.getState().dismissLastToolApply()

    expect(storage.documentMarkdown).toBe('# Doc\n\nChanged text.')
    expect(
      useAiChatStore.getState().toolUndoStackByConversation['conversation-1']?.[0]?.state
    ).toBe('dismissed')
  })

  it('syncs tool undo prompt state when document history undo or redo changes markdown', async () => {
    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().setDraftInput('润色')
    await useAiChatStore.getState().sendMessage()

    useAiChatStore.getState().syncToolUndoStackWithMarkdown('# Doc\n\nSelected text.')
    expect(
      useAiChatStore.getState().toolUndoStackByConversation['conversation-1']?.[0]?.state
    ).toBe('undone')

    useAiChatStore.getState().syncToolUndoStackWithMarkdown('# Doc\n\nChanged text.')
    expect(
      useAiChatStore.getState().toolUndoStackByConversation['conversation-1']?.[0]?.state
    ).toBe('available')
  })

  it('reports a failed assistant message when document writeback cannot be applied', async () => {
    storage.applyExternalMarkdown.mockImplementationOnce(() => false)

    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().setDraftInput('润色')
    await useAiChatStore.getState().sendMessage()

    const state = useAiChatStore.getState()
    const messages = state.messagesByConversation['conversation-1']
    expect(messages.at(-1)?.role).toBe('assistant')
    expect(messages.at(-1)?.state).toBe('failed')
    expect(messages.at(-1)?.error).toContain('AI 工具写回失败')
    expect(state.toolUndoStackByConversation['conversation-1']).toHaveLength(0)
    expect(storage.saveFileContent).not.toHaveBeenCalledWith('file-1', '# Doc\n\nChanged text.')
  })

  it('renames conversations', async () => {
    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().renameConversation('conversation-1', '新标题')

    expect(useAiChatStore.getState().conversations[0]?.title).toBe('新标题')
    expect(storage.conversations[0]?.title).toBe('新标题')
  })

  it('imports files generated by agent tools', async () => {
    const agent = await import('@/lib/agent')
    vi.mocked(agent.runAgentReActLoop).mockResolvedValueOnce({
      messages: [
        {
          id: 'user-1',
          conversationId: 'conversation-1',
          role: 'user',
          message: 'Task type: ask\nUser request:\n生成文档\n\nSelected document text:\nNone',
          createdAt: 1,
          state: 'done',
        },
        {
          id: 'assistant-1',
          conversationId: 'conversation-1',
          role: 'assistant',
          message: '已生成',
          createdAt: 2,
          state: 'done',
        },
      ],
      appliedMarkdown: '# Doc\n\nSelected text.',
      previousMarkdown: '# Doc\n\nSelected text.',
      appliedToolCallIds: [],
      appliedTools: [],
      stoppedBecause: 'assistant-text',
    })

    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().setDraftInput('生成文档')
    await useAiChatStore.getState().sendMessage()

    expect(storage.importFile).not.toHaveBeenCalled()
    expect(storage.loadDocument).not.toHaveBeenCalled()
    expect(useAiChatStore.getState().generatedDocumentSessionsByConversation['conversation-1']).toBeUndefined()
  })

  it('streams generated documents into a temp local file and opens them immediately', async () => {
    const agent = await import('@/lib/agent')
    vi.mocked(agent.runAgentReActLoop).mockClear()
    vi.mocked(agent.runAgentReActLoop).mockImplementationOnce(async (options: any) => {
      await options.onGeneratedDocumentEvent?.({ type: 'start', toolCallId: 'tool-call-generate', fileName: 'Live.md' })
      await options.onGeneratedDocumentEvent?.({
        type: 'delta',
        toolCallId: 'tool-call-generate',
        fileName: 'Live.md',
        delta: '# Live',
        content: '# Live',
      })
      await options.onGeneratedDocumentEvent?.({
        type: 'done',
        toolCallId: 'tool-call-generate',
        fileName: 'Live.md',
        content: '# Live',
      })
      return {
        messages: [
          ...options.messages,
          {
            id: 'assistant-1',
            conversationId: 'conversation-1',
            role: 'assistant',
            message: '已生成',
            createdAt: 2,
            state: 'done',
          },
        ],
        appliedMarkdown: '# Doc\n\nSelected text.',
        previousMarkdown: '# Doc\n\nSelected text.',
        appliedToolCallIds: [],
        appliedTools: [],
        stoppedBecause: 'assistant-text',
      }
    })
    const { useAiChatStore } = await import('@/stores/aiChatStore')

    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().setDraftInput('生成文档')
    await useAiChatStore.getState().sendMessage()

    expect(storage.importFile).toHaveBeenCalledWith('Live.md', '', null)
    expect(storage.loadDocument).toHaveBeenCalledWith('', 'Live.md', 'generated-file-1')
    expect(storage.saveFileContent).toHaveBeenCalledWith('generated-file-1', '# Live')
    expect(useAiChatStore.getState().generatedDocumentSessionsByConversation['conversation-1']).toBeUndefined()
  })

  it('offers a post-generation git save choice when git is connected', async () => {
    storage.gitConnected = true
    const agent = await import('@/lib/agent')
    vi.mocked(agent.runAgentReActLoop).mockClear()
    vi.mocked(agent.runAgentReActLoop).mockImplementationOnce(async (options: any) => {
      await options.onGeneratedDocumentEvent?.({ type: 'start', toolCallId: 'tool-call-generate', fileName: 'GitDoc.md' })
      await options.onGeneratedDocumentEvent?.({
        type: 'done',
        toolCallId: 'tool-call-generate',
        fileName: 'GitDoc.md',
        content: '# Git Doc',
      })
      return {
        messages: [
          ...options.messages,
          {
            id: 'assistant-1',
            conversationId: 'conversation-1',
            role: 'assistant',
            message: '已生成',
            createdAt: 2,
            state: 'done',
          },
        ],
        appliedMarkdown: '# Doc\n\nSelected text.',
        previousMarkdown: '# Doc\n\nSelected text.',
        appliedToolCallIds: [],
        appliedTools: [],
        stoppedBecause: 'assistant-text',
      }
    })

    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().setDraftInput('生成文档')
    await useAiChatStore.getState().sendMessage()

    expect(useAiChatStore.getState().generatedDocumentSessionsByConversation['conversation-1']).toEqual(
      expect.objectContaining({
        fileName: 'GitDoc.md',
        status: 'ready',
        content: '# Git Doc',
      })
    )
    await useAiChatStore.getState().chooseGeneratedDocumentSaveTarget('conversation-1', 'git')
    expect(storage.createGitFile).toHaveBeenCalledWith('GitDoc.md', '# Git Doc', 'Create GitDoc.md')
  })

  it('restores a generated document session after reinitialization', async () => {
    storage.documentSessions.set('conversation-1', {
      conversationId: 'conversation-1',
      toolCallId: 'tool-call-generate',
      fileName: 'Restore.md',
      content: '# Restore',
      tempFileId: 'generated-file-1',
      tempTabId: 'generated-tab-1',
      gitTargetDirectory: null,
      status: 'ready',
      error: null,
      createdAt: 1,
      updatedAt: 2,
    })

    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().initialize()

    expect(useAiChatStore.getState().generatedDocumentSessionsByConversation['conversation-1']).toEqual(
      expect.objectContaining({
        fileName: 'Restore.md',
        status: 'ready',
      })
    )
  })

  it('streams generated document tool output into a new file and tab', async () => {
    const agent = await import('@/lib/agent')
    vi.mocked(agent.runAgentReActLoop).mockImplementationOnce(async (options: any) => {
      await options.onGeneratedDocumentEvent?.({ type: 'start', toolCallId: 'tool-call-generate', fileName: 'Live.md' })
      await options.onGeneratedDocumentEvent?.({
        type: 'delta',
        toolCallId: 'tool-call-generate',
        fileName: 'Live.md',
        delta: '# Live',
        content: '# Live',
      })
      await options.onGeneratedDocumentEvent?.({
        type: 'done',
        toolCallId: 'tool-call-generate',
        fileName: 'Live.md',
        content: '# Live',
      })
      return {
        messages: [
          ...options.messages,
          {
            id: 'assistant-1',
            conversationId: 'conversation-1',
            role: 'assistant',
            message: '已生成',
            createdAt: 2,
            state: 'done',
          },
        ],
        appliedMarkdown: '# Doc\n\nSelected text.',
        previousMarkdown: '# Doc\n\nSelected text.',
        appliedToolCallIds: [],
        appliedTools: [],
        generatedFiles: [{ toolCallId: 'tool-call-generate', fileName: 'Live.md', content: '# Live' }],
        stoppedBecause: 'assistant-text',
      }
    })

    const { useAiChatStore } = await import('@/stores/aiChatStore')
    await useAiChatStore.getState().createConversation()
    await useAiChatStore.getState().setDraftInput('生成一个新文档')
    await useAiChatStore.getState().sendMessage()

    expect(storage.importFile).toHaveBeenCalledWith('Live.md', '', null)
    expect(storage.openFileInTab).toHaveBeenCalledWith('Live.md', '', 'generated-file-1')
    expect(storage.saveFileContent).toHaveBeenCalledWith('generated-file-1', '# Live')
    expect(storage.updateTabContent).toHaveBeenCalledWith('generated-tab-1', '# Live')
    expect(storage.importFile).toHaveBeenCalledTimes(1)
  })
})
