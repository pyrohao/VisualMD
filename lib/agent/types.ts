export type AgentRole = 'developer' | 'user' | 'assistant' | 'tool'

export interface AgentMessage {
  id: string
  conversationId: string
  role: AgentRole
  message: string
  createdAt: number
  toolCallId?: string
  toolName?: string
  state?: 'pending' | 'done' | 'failed'
  error?: string | null
}

export interface AgentConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface AgentExecutionTargetRecord {
  conversationId: string
  documentId: string
  tabId: string | null
  sourceType: 'local' | 'git' | 'unknown'
  updatedAt: number
}

export interface AgentDraft {
  conversationId: string
  inputText: string
  taskType: string
  selectedReferenceIds: string[]
  providerId: string
  model: string
  updatedAt: number
}

export interface AgentReferenceRecord {
  id: string
  conversationId: string
  documentId: string | null
  tabId: string | null
  sourceType?: 'local' | 'git' | 'unknown'
  stale: boolean
  createdAt: number
  anchorPath: string[]
  blockType: string
  startBlockIndex: number
  blockCount: number
  startOffset: number
  endOffset: number
  expectedText: string
  excerpt: string
  locked: boolean
}

export interface AgentUiState {
  key: string
  value: string
  updatedAt: number
}

export interface AgentDocumentSessionRecord {
  conversationId: string
  toolCallId: string
  fileName: string
  content: string
  tempFileId: string | null
  tempTabId: string | null
  gitTargetDirectory: string | null
  status: 'streaming' | 'ready' | 'failed'
  error: string | null
  createdAt: number
  updatedAt: number
}

export interface AgentToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type AgentDocumentActionName = 'replace' | 'append'

export interface AgentDocumentAction {
  action: AgentDocumentActionName
  content: string
}

export interface AgentToolResult {
  ok: boolean
  message: string
  nextMarkdown?: string
  generatedFile?: {
    fileName: string
    content: string
  }
  metadata?: Record<string, unknown>
}

export type AgentGeneratedDocumentEvent =
  | { type: 'start'; toolCallId: string; fileName: string }
  | { type: 'delta'; toolCallId: string; fileName: string; delta: string; content: string }
  | { type: 'done'; toolCallId: string; fileName: string; content: string }
  | { type: 'error'; toolCallId: string; fileName: string; error: string }

export interface AgentToolContext {
  markdown: string
  lastFailedContext?: string | null
  selectedReference?: AgentReferenceContext | null
  providerConfig?: import('@/stores/settingsStore').ProviderConfig
  signal?: AbortSignal
  toolCallId?: string
  onGeneratedDocumentEvent?: (event: AgentGeneratedDocumentEvent) => void | Promise<void>
}

export interface AgentReferenceContext {
  id?: string
  startOffset?: number
  endOffset?: number
  anchorPath?: string[]
  blockType?: string
  excerpt?: string
  expectedText?: string
}
