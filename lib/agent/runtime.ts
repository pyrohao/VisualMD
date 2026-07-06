import { nanoid } from 'nanoid'
import type { ProviderConfig } from '@/stores/settingsStore'
import { createAIService } from '@/lib/ai-service'
import { buildAgentTranscript } from './model'
import { parseAgentModelResponse } from './json'
import { buildAgentSystemPrompt, buildAgentToolsPrompt } from './prompt'
import type {
  AgentDocumentAction,
  AgentGeneratedDocumentEvent,
  AgentMessage,
  AgentRecoveryCandidate,
  AgentReferenceContext,
  AgentToolContext,
  AgentToolResult,
} from './types'
import { buildInvalidToolArgumentsResult, validateToolArguments, type AgentTool } from './tools'

const MAX_TOOL_CALLS = 3
const MAX_FIND_TOOL_CALLS = 2
const MAX_STRUCTURED_RESPONSE_RETRIES = 2
const MAX_RECOVERY_CHAINS = 1

type RequiredResponseMode = 'document-action' | 'tool' | null
type RuntimePhase =
  | 'planning'
  | 'need-document-action'
  | 'need-tool-recovery'
  | 'tool-executing'
  | 'need-user-confirmation'
  | 'done'

export interface AgentRuntimeTurnOptions {
  providerConfig: ProviderConfig
  apiKey: string
  messages: AgentMessage[]
  tools: AgentTool[]
  markdown: string
  selectedReference?: AgentReferenceContext | null
  maxTurns?: number
  onAssistantTextDelta?: (text: string) => void
  onGeneratedDocumentEvent?: (event: AgentGeneratedDocumentEvent) => void | Promise<void>
  signal?: AbortSignal
}

export interface AgentRuntimeTurnResult {
  messages: AgentMessage[]
  appliedMarkdown: string
  previousMarkdown: string
  appliedToolCallIds: string[]
  appliedTools: Array<{ toolCallId: string; previousMarkdown: string; appliedMarkdown: string }>
  generatedFiles: Array<{ toolCallId: string; fileName: string; content: string }>
  stoppedBecause: 'assistant-text' | 'tool-limit' | 'invalid-tool'
}

function buildToolSystemPrompt(tools: AgentTool[]) {
  return [
    buildAgentSystemPrompt([]),
    '',
    buildAgentToolsPrompt(tools),
  ].join('\n').trim()
}

async function runTool(tool: AgentTool | undefined, args: Record<string, unknown>, context: AgentToolContext) {
  if (!tool) {
    return { ok: false, message: 'Unknown tool' } satisfies AgentToolResult
  }

  const validation = validateToolArguments(tool, args)
  if (!validation.ok) {
    return buildInvalidToolArgumentsResult(tool, validation)
  }

  return tool.execute(args, context)
}

function serializeToolResultForHistory(toolName: string, result: AgentToolResult) {
  return JSON.stringify({
    ok: result.ok,
    message: result.ok ? `${toolName} succeeded` : result.message,
    metadata: sanitizeToolMetadata(result.metadata),
  })
}

function serializeToolCallForHistory(toolCall: { name: string; id: string; arguments: Record<string, unknown> }) {
  return JSON.stringify({
    tool: toolCall.name,
    callId: toolCall.id,
    argumentKeys: Object.keys(toolCall.arguments),
  })
}

function serializeDocumentActionForHistory(actionCallId: string, action: AgentDocumentAction) {
  return JSON.stringify({
    action: action.action,
    callId: actionCallId,
    contentLength: action.content.length,
  })
}

function sanitizeToolMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return undefined

  const sanitized: Record<string, unknown> = {}
  Object.entries(metadata).forEach(([key, value]) => {
    if (typeof value === 'string') {
      sanitized[`${key}Length`] = value.length
      return
    }

    if (Array.isArray(value)) {
      sanitized[`${key}Count`] = value.length
      sanitized[`${key}Lengths`] = value.map((item) => typeof item === 'string' ? item.length : null)
      return
    }

    sanitized[key] = value
  })

  return sanitized
}

function serializeToolCallForModel(toolCall: { name: string; arguments: Record<string, unknown> }) {
  return JSON.stringify({ tool: toolCall.name, arguments: toolCall.arguments })
}

function serializeToolResultForModel(result: AgentToolResult) {
  return JSON.stringify({
    ok: result.ok,
    message: result.message,
    metadata: result.metadata,
  })
}

function serializeDocumentActionForModel(action: AgentDocumentAction) {
  return JSON.stringify(action)
}

function getLatestUserMessage(messages: AgentMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'user')?.message || ''
}

function hasSelectedText(messages: AgentMessage[]) {
  return /Selected document text:\s*[\s\S]*?<selected_text>[\s\S]+?<\/selected_text>/i.test(getLatestUserMessage(messages))
}

function hasLiveSelectedReference(selectedReference?: AgentReferenceContext | null) {
  return (
    typeof selectedReference?.startOffset === 'number' &&
    typeof selectedReference?.endOffset === 'number' &&
    selectedReference.startOffset >= 0 &&
    selectedReference.endOffset >= selectedReference.startOffset &&
    typeof selectedReference?.expectedText === 'string' &&
    selectedReference.expectedText.length > 0
  )
}

function initialRequiredResponseMode(messages: AgentMessage[], selectedReference?: AgentReferenceContext | null): RequiredResponseMode {
  return hasLiveSelectedReference(selectedReference) || hasSelectedText(messages)
    ? 'document-action'
    : null
}

function initialRuntimePhase(messages: AgentMessage[], selectedReference?: AgentReferenceContext | null): RuntimePhase {
  return initialRequiredResponseMode(messages, selectedReference) === 'document-action'
    ? 'need-document-action'
    : 'planning'
}

function canConsumeDocumentAction(
  action: AgentDocumentAction,
  _messages: AgentMessage[],
  selectedReference?: AgentReferenceContext | null
) {
  if (action.action === 'append') {
    return true
  }

  return hasLiveSelectedReference(selectedReference)
}

function createStructuredFeedbackMessage(
  conversationId: string,
  mode: Exclude<RequiredResponseMode, null>,
  reason: string
): AgentMessage {
  return {
    id: nanoid(),
    conversationId,
    role: 'tool',
    message: JSON.stringify({
      ok: false,
      message: reason,
      metadata: { expectedResponse: mode },
    }),
    createdAt: Date.now(),
    toolName: mode === 'document-action' ? 'document_action' : 'tool_validator',
    state: 'failed',
    error: reason,
  }
}

function createInvalidStructuredResponseMessage(conversationId: string, reason: string): AgentMessage {
  return {
    id: nanoid(),
    conversationId,
    role: 'assistant',
    message: reason,
    createdAt: Date.now(),
    state: 'failed',
    error: reason,
  }
}

function latestSelectedText(messages: AgentMessage[]) {
  const latestUser = getLatestUserMessage(messages)
  const match = latestUser.match(/<selected_text>\s*([\s\S]*?)\s*<\/selected_text>/i)
  return match?.[1]?.trim() || ''
}

type StreamedResponseKind = 'undecided' | 'text' | 'structured'

function classifyBufferedResponsePrefix(value: string): StreamedResponseKind {
  const trimmed = value.trimStart()
  if (!trimmed) {
    return 'undecided'
  }

  if (trimmed.startsWith('{')) {
    return 'structured'
  }

  if (trimmed.startsWith('```')) {
    const fenceMatch = trimmed.match(/^```(?:json)?\s*/)
    if (!fenceMatch) {
      return 'text'
    }

    const afterFence = trimmed.slice(fenceMatch[0].length)
    if (!afterFence) {
      return 'undecided'
    }

    return afterFence.startsWith('{') ? 'structured' : 'text'
  }

  return 'text'
}

function appendContentToDocument(markdown: string, content: string) {
  const normalizedContent = content.trim()
  if (!markdown.trim()) {
    return `${normalizedContent}\n`
  }

  const base = markdown.replace(/\s+$/, '')
  return `${base}\n\n${normalizedContent}\n`
}

function appendContentAfterOffset(markdown: string, content: string, offset: number) {
  const normalizedContent = content.trim()
  const before = markdown.slice(0, offset).replace(/\s+$/, '')
  const after = markdown.slice(offset).replace(/^\s+/, '')

  if (!before) {
    return after
      ? `${normalizedContent}\n\n${after}`
      : `${normalizedContent}\n`
  }

  if (!after) {
    return `${before}\n\n${normalizedContent}\n`
  }

  return `${before}\n\n${normalizedContent}\n\n${after}`
}

function executeDocumentAction(
  action: AgentDocumentAction,
  markdown: string,
  selectedReference?: AgentReferenceContext | null
): AgentToolResult {
  if (!action.content.trim()) {
    return {
      ok: false,
      message: `document_action failed: "content" must be a non-empty string for ${action.action}. Return the same JSON again with valid content.`,
      metadata: {
        validationError: {
          code: 'empty-string',
          field: 'content',
          expectedType: 'string',
          actualType: 'empty-string',
        },
        action: action.action,
      },
    }
  }

  if (action.action === 'append') {
    const selectedStart = typeof selectedReference?.startOffset === 'number' ? selectedReference.startOffset : null
    const selectedEnd = typeof selectedReference?.endOffset === 'number' ? selectedReference.endOffset : null
    const expectedText = typeof selectedReference?.expectedText === 'string' ? selectedReference.expectedText : ''
    const hasValidSelectionAnchor = (
      selectedStart !== null &&
      selectedEnd !== null &&
      selectedStart >= 0 &&
      selectedEnd >= selectedStart &&
      expectedText.length > 0 &&
      markdown.slice(selectedStart, selectedEnd) === expectedText
    )

    return {
      ok: true,
      message: hasValidSelectionAnchor
        ? 'document_action append succeeded. The new content has been inserted after the selected content anchor in the current document. Do not repeat the same append. Next, briefly confirm the change to the user.'
        : 'document_action append succeeded. The new section has been appended to the end of the current document. Do not repeat the same append. Next, briefly confirm the change to the user.',
      nextMarkdown: hasValidSelectionAnchor
        ? appendContentAfterOffset(markdown, action.content, selectedEnd)
        : appendContentToDocument(markdown, action.content),
      metadata: {
        action: action.action,
        shouldReplyToUser: true,
        selectedStart: hasValidSelectionAnchor ? selectedStart : undefined,
        selectedEnd: hasValidSelectionAnchor ? selectedEnd : undefined,
        nextStep: 'Briefly confirm the append to the user.',
        usedSelectionAnchor: hasValidSelectionAnchor,
      },
    }
  }

  const selectedStart = typeof selectedReference?.startOffset === 'number' ? selectedReference.startOffset : null
  const selectedEnd = typeof selectedReference?.endOffset === 'number' ? selectedReference.endOffset : null
  const expectedText = typeof selectedReference?.expectedText === 'string' ? selectedReference.expectedText : ''

  if (
    selectedStart === null ||
    selectedEnd === null ||
    selectedStart < 0 ||
    selectedEnd < selectedStart ||
    !expectedText
  ) {
    return {
      ok: false,
      message: 'document_action replace failed: no live selected text is available. Use find_tool with the exact target text, then use apply_tool with one exact returned candidate range by mapping startOffset/endOffset to offset.start/offset.end.',
      metadata: {
        action: action.action,
        failedText: expectedText,
        nextStep: 'Call find_tool with the exact target text, then use apply_tool with one exact returned candidate range by mapping startOffset/endOffset to offset.start/offset.end.',
      },
    }
  }

  const currentSelectedText = markdown.slice(selectedStart, selectedEnd)
  if (currentSelectedText !== expectedText) {
    return {
      ok: false,
      message: 'document_action replace failed: the selected text is stale or no longer matches the current document. Use find_tool with the exact previously selected text, then use apply_tool with one exact returned candidate range by mapping startOffset/endOffset to offset.start/offset.end.',
      metadata: {
        action: action.action,
        failedText: expectedText,
        selectedStart,
        selectedEnd,
        nextStep: 'Call find_tool with the exact previously selected text, then use apply_tool with one exact returned candidate range by mapping startOffset/endOffset to offset.start/offset.end.',
      },
    }
  }

  return {
    ok: true,
    message: 'document_action replace succeeded using the live selection anchor. The current document markdown has been updated. Do not repeat the same edit. Next, briefly confirm the change to the user.',
    nextMarkdown: `${markdown.slice(0, selectedStart)}${action.content}${markdown.slice(selectedEnd)}`,
    metadata: {
      action: action.action,
      shouldReplyToUser: true,
      selectedStart,
      selectedEnd,
      nextStep: 'Briefly confirm the edit to the user.',
      usedSelectionAnchor: true,
    },
  }
}

function isToolValidationFailure(result: AgentToolResult) {
  return Boolean(result.metadata && 'validationError' in result.metadata)
}

function isRetryableStructuredToolFailure(tool: AgentTool | undefined, result: AgentToolResult) {
  return Boolean(tool) && isToolValidationFailure(result)
}

function createBudgetFailureMessage(conversationId: string, message: string): AgentMessage {
  return {
    id: nanoid(),
    conversationId,
    role: 'assistant',
    message,
    createdAt: Date.now(),
    state: 'failed',
    error: message,
  }
}

export async function runAgentReActLoop(options: AgentRuntimeTurnOptions): Promise<AgentRuntimeTurnResult> {
  const conversationId = options.messages[0]?.conversationId || ''
  const service = createAIService(options.providerConfig)
  const systemPrompt = buildToolSystemPrompt(options.tools)
  const messages: AgentMessage[] = [...options.messages]
  const modelMessages: AgentMessage[] = [...options.messages]
  const previousMarkdown = options.markdown
  const appliedToolCallIds: string[] = []
  const appliedTools: AgentRuntimeTurnResult['appliedTools'] = []
  const generatedFiles: AgentRuntimeTurnResult['generatedFiles'] = []
  const selectedTextHint = latestSelectedText(options.messages)
  let markdown = options.markdown
  let stopReason: AgentRuntimeTurnResult['stoppedBecause'] = 'tool-limit'
  let lastFailedContext: string | null = null
  let lastFindCandidates: AgentRecoveryCandidate[] = []
  let toolCallCount = 0
  let consecutiveFindToolCalls = 0
  let recoveryChainCount = 0
  let structuredRetryCount = 0
  let requiredResponseMode: RequiredResponseMode = initialRequiredResponseMode(options.messages, options.selectedReference)
  let phase: RuntimePhase = initialRuntimePhase(options.messages, options.selectedReference)

  const failStructuredResponse = (reason: string) => {
    const failedMessage = createInvalidStructuredResponseMessage(conversationId, reason)
    messages.push(failedMessage)
    modelMessages.push(failedMessage)
    return {
      messages,
      appliedMarkdown: markdown,
      previousMarkdown,
      appliedToolCallIds,
      appliedTools,
      generatedFiles,
      stoppedBecause: 'invalid-tool' as const,
    }
  }

  const failBudget = (message: string) => {
    const failedMessage = createBudgetFailureMessage(conversationId, message)
    messages.push(failedMessage)
    modelMessages.push(failedMessage)
    return {
      messages,
      appliedMarkdown: markdown,
      previousMarkdown,
      appliedToolCallIds,
      appliedTools,
      generatedFiles,
      stoppedBecause: 'tool-limit' as const,
    }
  }

  const enterRecoveryPhase = (reason: string) => {
    if (phase !== 'need-tool-recovery') {
      recoveryChainCount += 1
      if (recoveryChainCount > MAX_RECOVERY_CHAINS) {
        return failBudget(
          'Recovery step limit reached. The model already used one find/apply recovery chain and must now stop and ask the user for a more precise target.'
        )
      }
    }

    requiredResponseMode = 'tool'
    phase = 'need-tool-recovery'
    lastFailedContext = reason || lastFailedContext
    return null
  }

  for (;;) {
    if (options.signal?.aborted) {
      throw new Error('AI request aborted')
    }

    const requestMessages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: buildAgentTranscript(modelMessages) },
    ]
    let streamedResponseKind: StreamedResponseKind = 'undecided'
    let lastAssistantTextDelta = ''
    const emitAssistantTextDelta = (text: string) => {
      if (!text || text === lastAssistantTextDelta) {
        return
      }

      lastAssistantTextDelta = text
      options.onAssistantTextDelta?.(text)
    }
    const response = typeof service.chatMessagesStream === 'function'
      ? await service.chatMessagesStream({
          messages: requestMessages,
          onDelta: (_delta, fullText) => {
            if (streamedResponseKind === 'structured') {
              return
            }

            const nextKind = classifyBufferedResponsePrefix(fullText)
            if (nextKind === 'undecided') {
              return
            }

            streamedResponseKind = nextKind
            if (streamedResponseKind === 'text') {
              emitAssistantTextDelta(fullText)
            }
          },
          signal: options.signal,
        })
      : await service.chatMessages({
          messages: requestMessages,
        })

    const responseKind = streamedResponseKind === 'undecided'
      ? classifyBufferedResponsePrefix(response)
      : streamedResponseKind
    const parsed = responseKind === 'text'
      ? { kind: 'text' as const, text: response }
      : parseAgentModelResponse(response)

    if (parsed.kind === 'text') {
      const text = parsed.text.trim()
      if (requiredResponseMode) {
        phase = requiredResponseMode === 'document-action' ? 'need-document-action' : 'need-tool-recovery'
        if (text) {
          emitAssistantTextDelta(text)
          messages.push({
            id: nanoid(),
            conversationId,
            role: 'assistant',
            message: text,
            createdAt: Date.now(),
            state: 'done',
          })
        }

        structuredRetryCount += 1
        if (structuredRetryCount >= MAX_STRUCTURED_RESPONSE_RETRIES) {
          return failStructuredResponse(
            requiredResponseMode === 'document-action'
              ? `The model failed to return valid document action JSON after ${MAX_STRUCTURED_RESPONSE_RETRIES} attempts.`
              : `The model failed to return valid tool JSON after ${MAX_STRUCTURED_RESPONSE_RETRIES} attempts.`
          )
        }

        const feedbackMessage = createStructuredFeedbackMessage(
          conversationId,
          requiredResponseMode,
          requiredResponseMode === 'document-action'
            ? selectedTextHint
              ? `The user requested an in-place selected-text edit. Return only JSON like {"action":"replace","content":"..."} with a non-empty content field. Use the selected_text as the target. selected_text=${JSON.stringify(selectedTextHint)}`
              : 'The user requested an in-place document edit. Return only JSON like {"action":"replace","content":"..."} with a non-empty content field. Do not reply with plain text.'
            : 'A tool step is required now. Return only one tool JSON object like {"tool":"find_tool","arguments":{...}} or {"tool":"apply_tool","arguments":{...}}. Do not reply with plain text.'
        )
        messages.push(feedbackMessage)
        modelMessages.push(feedbackMessage)
        continue
      }

      if (!text) {
        const failedMessage: AgentMessage = {
          id: nanoid(),
          conversationId,
          role: 'assistant',
          message: 'Empty assistant response.',
          createdAt: Date.now(),
          state: 'failed',
          error: 'Empty assistant response',
        }
        messages.push(failedMessage)
        modelMessages.push(failedMessage)
        return { messages, appliedMarkdown: markdown, previousMarkdown, appliedToolCallIds, appliedTools, generatedFiles, stoppedBecause: 'invalid-tool' }
      }

      emitAssistantTextDelta(text)

      const assistantMessage: AgentMessage = {
        id: nanoid(),
        conversationId,
        role: 'assistant',
        message: text,
        createdAt: Date.now(),
        state: 'done',
      }
      messages.push(assistantMessage)
      modelMessages.push(assistantMessage)
      phase = 'done'
      stopReason = 'assistant-text'
      return { messages, appliedMarkdown: markdown, previousMarkdown, appliedToolCallIds, appliedTools, generatedFiles, stoppedBecause: stopReason }
    }

    if (parsed.kind === 'action') {
      if (requiredResponseMode === 'tool') {
        phase = 'need-tool-recovery'
        structuredRetryCount += 1
        if (structuredRetryCount >= MAX_STRUCTURED_RESPONSE_RETRIES) {
          return failStructuredResponse(
            `The model kept returning document action JSON when a recovery tool step was required after ${MAX_STRUCTURED_RESPONSE_RETRIES} attempts.`
          )
        }

        const feedbackMessage = createStructuredFeedbackMessage(
          conversationId,
          'tool',
          'The live selection could not be applied directly. Return a tool JSON response now. First use find_tool with the exact target text. Then call apply_tool with offset.start and offset.end copied from the chosen find_tool candidate, plus the replacement newString.'
        )
        messages.push(feedbackMessage)
        modelMessages.push(feedbackMessage)
        continue
      }

      if (!canConsumeDocumentAction(parsed.action, options.messages, options.selectedReference) && requiredResponseMode !== 'document-action') {
        phase = 'planning'
        structuredRetryCount += 1
        if (structuredRetryCount >= MAX_STRUCTURED_RESPONSE_RETRIES) {
          return failStructuredResponse(
            `The model returned document action JSON for a request that did not require an in-place document edit after ${MAX_STRUCTURED_RESPONSE_RETRIES} attempts.`
          )
        }

        const feedbackMessage = createStructuredFeedbackMessage(
          conversationId,
          'tool',
          'The current request is not an in-place document edit. Reply in plain text, or use a tool JSON object only if a tool is actually required.'
        )
        messages.push(feedbackMessage)
        modelMessages.push(feedbackMessage)
        continue
      }

      structuredRetryCount = 0
      phase = 'tool-executing'

      const actionCallId = nanoid()
      const assistantHistoryMessage: AgentMessage = {
        id: nanoid(),
        conversationId,
        role: 'assistant',
        message: serializeDocumentActionForHistory(actionCallId, parsed.action),
        createdAt: Date.now(),
        toolCallId: actionCallId,
        toolName: 'document_action',
        state: 'done',
      }
      const assistantModelMessage: AgentMessage = {
        ...assistantHistoryMessage,
        message: serializeDocumentActionForModel(parsed.action),
      }
      messages.push(assistantHistoryMessage)
      modelMessages.push(assistantModelMessage)

      const actionResult = executeDocumentAction(parsed.action, markdown, options.selectedReference)
      if (!actionResult.ok) {
        const failedText = typeof actionResult.metadata?.failedText === 'string'
          ? actionResult.metadata.failedText
          : ''
        const recoveryFailure = enterRecoveryPhase(failedText)
        if (recoveryFailure) {
          return recoveryFailure
        }
      } else {
        requiredResponseMode = null
        phase = 'need-user-confirmation'
      }

      if (actionResult.ok && actionResult.nextMarkdown) {
        const toolPreviousMarkdown = markdown
        markdown = actionResult.nextMarkdown
        appliedToolCallIds.push(actionCallId)
        appliedTools.push({
          toolCallId: actionCallId,
          previousMarkdown: toolPreviousMarkdown,
          appliedMarkdown: markdown,
        })
        consecutiveFindToolCalls = 0
      }

      const toolHistoryMessage: AgentMessage = {
        id: nanoid(),
        conversationId,
        role: 'tool',
        message: serializeToolResultForHistory('document_action', actionResult),
        createdAt: Date.now(),
        toolCallId: actionCallId,
        toolName: 'document_action',
        state: actionResult.ok ? 'done' : 'failed',
        error: actionResult.ok ? null : actionResult.message,
      }
      const toolModelMessage: AgentMessage = {
        ...toolHistoryMessage,
        message: serializeToolResultForModel(actionResult),
      }
      messages.push(toolHistoryMessage)
      modelMessages.push(toolModelMessage)
      continue
    }

    const toolCall = {
      ...parsed.call,
      id: nanoid(),
    }

      if (requiredResponseMode === 'document-action') {
      phase = 'need-document-action'
      structuredRetryCount += 1
      if (structuredRetryCount >= MAX_STRUCTURED_RESPONSE_RETRIES) {
        return failStructuredResponse(
          `The model failed to return the required document action JSON after ${MAX_STRUCTURED_RESPONSE_RETRIES} attempts.`
        )
      }

      const feedbackMessage = createStructuredFeedbackMessage(
        conversationId,
        'document-action',
        'Do not call a tool for this request yet. Return only JSON like {"action":"replace","content":"..."} with non-empty content.'
      )
      messages.push(feedbackMessage)
      modelMessages.push(feedbackMessage)
      continue
    }

    const tool = options.tools.find((item) => item.name === toolCall.name)
    phase = 'tool-executing'

    if (toolCallCount >= MAX_TOOL_CALLS) {
      const assistantHistoryMessage: AgentMessage = {
        id: nanoid(),
        conversationId,
        role: 'assistant',
        message: serializeToolCallForHistory(toolCall),
        createdAt: Date.now(),
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        state: 'done',
      }
      messages.push(assistantHistoryMessage)
      modelMessages.push({
        ...assistantHistoryMessage,
        message: serializeToolCallForModel(toolCall),
      })
      return failBudget(
        `Tool call limit reached. The model attempted more than ${MAX_TOOL_CALLS} tool calls in one run and must stop here.`
      )
    }

    toolCallCount += 1

    if (toolCall.name === 'find_tool' && consecutiveFindToolCalls >= MAX_FIND_TOOL_CALLS) {
      const limitResult: AgentToolResult = {
        ok: false,
        message: `find_tool failed: search limit exceeded for this run after ${MAX_FIND_TOOL_CALLS} attempts. Stop calling find_tool and ask the user for a more precise target or explain that the text could not be located.`,
        metadata: {
          nextStep: 'Ask the user for a more precise target or explain that the text could not be located.',
          limitExceeded: true,
        },
      }

      const assistantHistoryMessage: AgentMessage = {
        id: nanoid(),
        conversationId,
        role: 'assistant',
        message: serializeToolCallForHistory(toolCall),
        createdAt: Date.now(),
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        state: 'done',
      }
      const toolHistoryMessage: AgentMessage = {
        id: nanoid(),
        conversationId,
        role: 'tool',
        message: serializeToolResultForHistory(toolCall.name, limitResult),
        createdAt: Date.now(),
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        state: 'failed',
        error: limitResult.message,
      }
      messages.push(assistantHistoryMessage, toolHistoryMessage)
      modelMessages.push(
        { ...assistantHistoryMessage, message: serializeToolCallForModel(toolCall) },
        { ...toolHistoryMessage, message: serializeToolResultForModel(limitResult) }
      )
      requiredResponseMode = 'tool'
      phase = 'need-tool-recovery'
      continue
    }

    const assistantHistoryMessage: AgentMessage = {
      id: nanoid(),
      conversationId,
      role: 'assistant',
      message: serializeToolCallForHistory(toolCall),
      createdAt: Date.now(),
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      state: 'done',
    }
    const assistantModelMessage: AgentMessage = {
      ...assistantHistoryMessage,
      message: serializeToolCallForModel(toolCall),
    }
    messages.push(assistantHistoryMessage)
    modelMessages.push(assistantModelMessage)

    const toolResult = await runTool(tool, toolCall.arguments, {
      markdown,
      lastFailedContext,
      recoveryCandidates: lastFindCandidates,
      selectedReference: options.selectedReference,
      providerConfig: options.providerConfig,
      signal: options.signal,
      toolCallId: toolCall.id,
      onGeneratedDocumentEvent: options.onGeneratedDocumentEvent,
    })

    if (!toolResult.ok && toolCall.name === 'apply_tool') {
      lastFailedContext = typeof toolResult.metadata?.failedText === 'string'
        ? toolResult.metadata.failedText
        : lastFailedContext
    }

    if (toolCall.name === 'find_tool') {
      consecutiveFindToolCalls += 1
      lastFindCandidates = toolResult.ok && Array.isArray(toolResult.metadata?.results)
        ? (toolResult.metadata.results as AgentRecoveryCandidate[])
        : []
    } else if (toolResult.ok && (toolCall.name === 'apply_tool' || toolCall.name === 'generate_document_tool')) {
      consecutiveFindToolCalls = 0
      if (toolCall.name === 'apply_tool') {
        lastFindCandidates = []
      }
    }

    if (toolResult.ok && toolResult.nextMarkdown) {
      const toolPreviousMarkdown = markdown
      markdown = toolResult.nextMarkdown
      appliedToolCallIds.push(toolCall.id)
      appliedTools.push({
        toolCallId: toolCall.id,
        previousMarkdown: toolPreviousMarkdown,
        appliedMarkdown: markdown,
      })
    }

    if (toolResult.ok && toolResult.generatedFile) {
      generatedFiles.push({
        toolCallId: toolCall.id,
        ...toolResult.generatedFile,
      })
    }

    const toolHistoryMessage: AgentMessage = {
      id: nanoid(),
      conversationId,
      role: 'tool',
      message: serializeToolResultForHistory(toolCall.name, toolResult),
      createdAt: Date.now(),
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      state: toolResult.ok ? 'done' : 'failed',
      error: toolResult.ok ? null : toolResult.message,
    }
    const toolModelMessage: AgentMessage = {
      ...toolHistoryMessage,
      message: serializeToolResultForModel(toolResult),
    }
    messages.push(toolHistoryMessage)
    modelMessages.push(toolModelMessage)

    if (isRetryableStructuredToolFailure(tool, toolResult)) {
      structuredRetryCount += 1
      if (structuredRetryCount >= MAX_STRUCTURED_RESPONSE_RETRIES) {
        return failStructuredResponse(
          `The model failed to produce valid non-empty tool JSON arguments after ${MAX_STRUCTURED_RESPONSE_RETRIES} attempts.`
        )
      }
      requiredResponseMode = 'tool'
      phase = 'need-tool-recovery'
      continue
    }

    structuredRetryCount = 0

    if (!tool) {
      return { messages, appliedMarkdown: markdown, previousMarkdown, appliedToolCallIds, appliedTools, generatedFiles, stoppedBecause: 'invalid-tool' }
    }

    if (toolResult.ok) {
      if (toolCall.name === 'find_tool') {
        requiredResponseMode = 'tool'
        phase = 'need-tool-recovery'
      } else if (toolCall.name === 'apply_tool' || toolCall.name === 'generate_document_tool') {
        requiredResponseMode = null
        phase = 'need-user-confirmation'
      }
      continue
    }

    const recoveryFailure = enterRecoveryPhase(
      typeof toolResult.metadata?.failedText === 'string'
        ? toolResult.metadata.failedText
        : lastFailedContext || ''
    )
    if (recoveryFailure) {
      return recoveryFailure
    }
  }

}
