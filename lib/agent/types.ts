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

export interface AgentToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
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

export interface AgentToolContext {
  markdown: string
  lastFailedContext?: string | null
  providerConfig?: import('@/stores/settingsStore').ProviderConfig
}

export interface AgentReferenceContext {
  id?: string
  anchorPath?: string[]
  blockType?: string
  excerpt?: string
  expectedText?: string
}
