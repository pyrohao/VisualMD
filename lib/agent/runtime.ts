import { nanoid } from 'nanoid'
import type { ProviderConfig } from '@/stores/settingsStore'
import { createAIService } from '@/lib/ai-service'
import { buildAgentTranscript } from './model'
import { parseAgentModelResponse } from './json'
import { buildAgentSystemPrompt, buildAgentToolsPrompt } from './prompt'
import type { AgentGeneratedDocumentEvent, AgentMessage, AgentReferenceContext, AgentToolContext, AgentToolResult } from './types'
import { buildInvalidToolArgumentsResult, validateToolArguments, type AgentTool } from './tools'

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

function shouldStreamToUser(fullText: string) {
  const trimmed = fullText.trimStart()
  return Boolean(trimmed) && !trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('```')
}

function likelyRequestsDocumentGeneration(messages: AgentMessage[]) {
  const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.message || ''
  return /生成|创建|新建|写一份|起草|create|generate|draft|new\s+(document|file)/i.test(latestUser)
}

function likelyRequiresApplyTool(messages: AgentMessage[]) {
  const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.message || ''
  const hasSelectedText = /Selected document text:\s*[\s\S]*?<selected_text>[\s\S]+?<\/selected_text>/i.test(latestUser)
  const asksForEdit = /修改|替换|改成|改为|完善|润色|优化|重写|rewrite|revise|polish|improve|replace|change/i.test(latestUser)
  return hasSelectedText && asksForEdit
}

function createToolRequiredMessage(conversationId: string, reason: string): AgentMessage {
  return {
    id: nanoid(),
    conversationId,
    role: 'tool',
    message: JSON.stringify({
      ok: false,
      message: reason,
      metadata: { requiredTool: 'apply_tool' },
    }),
    createdAt: Date.now(),
    toolName: 'apply_tool',
    state: 'failed',
    error: reason,
  }
}

export async function runAgentReActLoop(options: AgentRuntimeTurnOptions): Promise<AgentRuntimeTurnResult> {
  const conversationId = options.messages[0]?.conversationId || ''
  const service = createAIService(options.providerConfig)
  const systemPrompt = buildToolSystemPrompt(options.tools)
  const maxTurns = options.maxTurns ?? 5
  const messages: AgentMessage[] = [...options.messages]
  const modelMessages: AgentMessage[] = [...options.messages]
  const previousMarkdown = options.markdown
  const appliedToolCallIds: string[] = []
  const appliedTools: AgentRuntimeTurnResult['appliedTools'] = []
  const generatedFiles: AgentRuntimeTurnResult['generatedFiles'] = []
  let markdown = options.markdown
  let stopReason: AgentRuntimeTurnResult['stoppedBecause'] = 'tool-limit'
  let lastFailedContext: string | null = null
  let consecutiveFindToolCalls = 0
  const requiresApplyTool = likelyRequiresApplyTool(options.messages)
  const suppressFirstTurnAssistantStream = likelyRequestsDocumentGeneration(options.messages) || requiresApplyTool

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (options.signal?.aborted) {
      throw new Error('AI request aborted')
    }
    let streamedText = ''
    const requestMessages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: buildAgentTranscript(modelMessages) },
    ]
    const response = typeof service.chatMessagesStream === 'function'
      ? await service.chatMessagesStream({
          messages: requestMessages,
          onDelta: (_delta, fullText) => {
            if (turn === 0 && suppressFirstTurnAssistantStream) {
              return
            }

            if (!options.onAssistantTextDelta || !shouldStreamToUser(fullText)) {
              return
            }

            const nextText = fullText.trimStart()
            if (nextText.length <= streamedText.length) return
            streamedText = nextText
            options.onAssistantTextDelta(streamedText)
          },
          signal: options.signal,
        })
      : await service.chatMessages({
          messages: requestMessages,
        })

    const parsed = parseAgentModelResponse(response)

    if (parsed.kind === 'text') {
      const text = parsed.text.trim()
      if (requiresApplyTool && appliedTools.length === 0 && turn < maxTurns - 1) {
        const toolRequiredMessage = createToolRequiredMessage(
          conversationId,
          'The user requested a document edit. Return apply_tool JSON with exact oldString and newString instead of plain text.'
        )
        messages.push(toolRequiredMessage)
        modelMessages.push(toolRequiredMessage)
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
      stopReason = 'assistant-text'
      return { messages, appliedMarkdown: markdown, previousMarkdown, appliedToolCallIds, appliedTools, generatedFiles, stoppedBecause: stopReason }
    }

    const toolCall = {
      ...parsed.call,
      id: nanoid(),
    }
    const tool = options.tools.find((item) => item.name === toolCall.name)

    if (toolCall.name === 'find_tool' && consecutiveFindToolCalls >= 3) {
      const limitResult: AgentToolResult = {
        ok: false,
        message: 'find_tool failed: search limit exceeded for this run. Stop calling find_tool and ask the user for a more precise target or explain that the text could not be located.',
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
      selectedReference: options.selectedReference,
      providerConfig: options.providerConfig,
      signal: options.signal,
      toolCallId: toolCall.id,
      onGeneratedDocumentEvent: options.onGeneratedDocumentEvent,
    })

    if (!toolResult.ok && toolCall.name === 'apply_tool') {
      lastFailedContext = typeof toolResult.metadata?.failedText === 'string'
        ? toolResult.metadata.failedText
        : typeof toolCall.arguments.oldString === 'string'
          ? toolCall.arguments.oldString
          : lastFailedContext
    }

    if (toolCall.name === 'find_tool') {
      consecutiveFindToolCalls += 1
    } else if (toolResult.ok && toolCall.name === 'apply_tool') {
      consecutiveFindToolCalls = 0
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

    if (!tool) {
      return { messages, appliedMarkdown: markdown, previousMarkdown, appliedToolCallIds, appliedTools, generatedFiles, stoppedBecause: 'invalid-tool' }
    }

    if (!toolResult.ok && toolCall.name !== 'find_tool') {
      continue
    }
  }

  const limitMessage: AgentMessage = {
    id: nanoid(),
    conversationId,
    role: 'assistant',
    message: 'Tool loop limit reached.',
    createdAt: Date.now(),
    state: 'failed',
    error: 'Tool loop limit reached',
  }
  messages.push(limitMessage)
  modelMessages.push(limitMessage)

  return { messages, appliedMarkdown: markdown, previousMarkdown, appliedToolCallIds, appliedTools, generatedFiles, stoppedBecause: stopReason }
}
