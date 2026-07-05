import type { AgentToolContext, AgentToolResult } from './types'
import { AIService } from '@/lib/ai-service'

export interface AgentToolDefinition {
  name: string
  description: string
  argumentsSchema: AgentToolJsonSchema
}

export type AgentToolExecutor = (
  args: Record<string, unknown>,
  context: AgentToolContext
) => Promise<AgentToolResult> | AgentToolResult

export interface AgentTool extends AgentToolDefinition {
  execute: AgentToolExecutor
}

export interface AgentToolValidationError {
  code: 'invalid-arguments' | 'missing-required' | 'unexpected-property' | 'invalid-type' | 'empty-string'
  field?: string
  expectedType?: AgentToolJsonSchemaProperty['type']
  actualType?: string
  extraFields?: string[]
}

export interface AgentToolValidationResult {
  ok: boolean
  error?: AgentToolValidationError
}

export interface AgentToolJsonSchema {
  type: 'object'
  description: string
  additionalProperties: boolean
  properties: Record<string, AgentToolJsonSchemaProperty>
  required: string[]
}

export interface AgentToolJsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array'
  description: string
  allowEmpty?: boolean
}

export const defaultAgentToolDefinitions: AgentToolDefinition[] = [
  {
    name: 'apply_tool',
    description: 'Recover a failed edit by replacing one exact text fragment in the current document.',
    argumentsSchema: {
      type: 'object',
      description: 'Arguments for an exact replacement in the current Markdown document.',
      additionalProperties: false,
      properties: {
        oldString: {
          type: 'string',
          description: 'Required. Non-empty exact source text copied from the current document. Use the smallest complete fragment that satisfies the request, and preserve literal Markdown such as image syntax unless the user explicitly asks to change it.',
        },
        newString: {
          type: 'string',
          description: 'Required. Non-empty replacement text only. Keep unchanged Markdown content verbatim when the edit touches surrounding text.',
        },
      },
      required: ['oldString', 'newString'],
    },
  },
  {
    name: 'find_tool',
    description: 'Locate exact literal text in the current document and return up to three candidate matches.',
    argumentsSchema: {
      type: 'object',
      description: 'Arguments for exact literal text lookup in the current Markdown document.',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Required. Provide one non-empty exact literal text fragment to search for in the current Markdown document.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'generate_document_tool',
    description: 'Create and save a new Markdown file only when the user explicitly asks for a new document or file. In a normal single-file request, call this tool at most once, then reply with a short confirmation instead of generating another file.',
    argumentsSchema: {
      type: 'object',
      description: 'Arguments for generating a brand-new Markdown document.',
      additionalProperties: false,
      properties: {
        fileName: {
          type: 'string',
          description: 'Required. Non-empty target Markdown file name. It must include the `.md` suffix.',
        },
        prompt: {
          type: 'string',
          description: 'Required. Non-empty document-generation instruction used to create the new file content. Use this tool only for brand-new files, not for normal chat or edits to the current document. After one successful generation, do not call this tool again unless the user explicitly asked for multiple separate files.',
        },
      },
      required: ['fileName', 'prompt'],
    },
  },
]

export async function executeApplyTool(args: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult> {
  const oldString = typeof args.oldString === 'string' ? args.oldString : ''
  const newString = typeof args.newString === 'string' ? args.newString : ''
  const selectedReference = context.selectedReference

  const selectedStart = typeof selectedReference?.startOffset === 'number' ? selectedReference.startOffset : null
  const selectedEnd = typeof selectedReference?.endOffset === 'number' ? selectedReference.endOffset : null
  const selectedExpectedText = typeof selectedReference?.expectedText === 'string' ? selectedReference.expectedText : ''
  const hasLiveSelectionAnchor =
    selectedStart !== null &&
    selectedEnd !== null &&
    selectedStart >= 0 &&
    selectedEnd >= selectedStart

  if (hasLiveSelectionAnchor) {
    const currentSelectedText = context.markdown.slice(selectedStart, selectedEnd)
    if (currentSelectedText === selectedExpectedText) {
      return {
        ok: true,
        message: 'apply_tool succeeded using the live selection anchor. The current document markdown has been updated. Do not repeat the same edit. Next, briefly confirm the change to the user or continue with the next requested task.',
        nextMarkdown: `${context.markdown.slice(0, selectedStart)}${newString}${context.markdown.slice(selectedEnd)}`,
        metadata: {
          matchCount: 1,
          selectedStart,
          selectedEnd,
          nextStep: 'Briefly confirm the edit or continue with the next user-requested task.',
          shouldReplyToUser: true,
          usedSelectionAnchor: true,
        },
      }
    }
  }

  if (!oldString && !hasLiveSelectionAnchor) {
    return {
      ok: false,
      message: 'apply_tool failed: oldString is required. Ask the model to provide an exact source fragment before retrying apply_tool.',
      metadata: {
        matchCount: 0,
        selectedStart,
        selectedEnd,
        nextStep: 'Provide exact oldString and retry apply_tool.',
      },
    }
  }

  const matchCount = context.markdown.split(oldString).length - 1
  if (matchCount !== 1) {
    return {
      ok: false,
      message: matchCount === 0
        ? 'apply_tool failed: oldString not found. Use find_tool to locate exact candidate fragments or choose a different exact fragment.'
        : 'apply_tool failed: oldString matched multiple times. Narrow the target fragment and retry apply_tool with a unique exact match.',
      metadata: {
        matchCount,
        failedText: oldString,
        contextPreview: context.markdown.slice(0, 400),
        selectedStart,
        selectedEnd,
        nextStep: matchCount === 0
          ? 'Use find_tool or choose a different exact fragment.'
          : 'Retry apply_tool with a smaller unique exact fragment.',
      },
    }
  }

  return {
    ok: true,
    message: 'apply_tool succeeded. The current document markdown has been updated. Do not repeat the same edit. Next, briefly confirm the change to the user or continue with the next requested task.',
    nextMarkdown: context.markdown.replace(oldString, newString),
    metadata: {
      matchCount,
      nextStep: 'Briefly confirm the edit or continue with the next user-requested task.',
      shouldReplyToUser: true,
    },
  }
}

export async function executeFindTool(args: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult> {
  const query = typeof args.query === 'string' ? args.query : ''
  if (!query) {
    return {
      ok: false,
      message: 'find_tool failed: query is required. Provide an exact literal text fragment before retrying.',
      metadata: {
        nextStep: 'Provide an exact literal text fragment and retry find_tool.',
      },
    }
  }

  const results: Array<{
    startOffset: number
    endOffset: number
    matchText: string
    preview: string
  }> = []

  let fromIndex = 0
  while (fromIndex < context.markdown.length && results.length < 3) {
    const matchIndex = context.markdown.indexOf(query, fromIndex)
    if (matchIndex < 0) {
      break
    }

    const matchEnd = matchIndex + query.length
    const previewStart = Math.max(0, matchIndex - 80)
    const previewEnd = Math.min(context.markdown.length, matchEnd + 80)
    results.push({
      startOffset: matchIndex,
      endOffset: matchEnd,
      matchText: context.markdown.slice(matchIndex, matchEnd),
      preview: context.markdown.slice(previewStart, previewEnd),
    })
    fromIndex = matchEnd
  }

  if (results.length === 0) {
    return {
      ok: false,
      message: 'find_tool failed: no exact literal match was found. Ask the user for a more precise fragment or explain that the text could not be located.',
      metadata: {
        query,
        nextStep: 'Ask for clarification or explain that no exact literal match was found.',
      },
    }
  }

  return {
    ok: true,
    message: 'find_tool succeeded. Exact literal candidates were found. Use one returned candidate as oldString in apply_tool if it matches the intended target.',
    metadata: {
      query,
      candidate: results[0].matchText,
      candidates: results.map((item) => item.matchText),
      results,
      nextStep: 'Use one returned candidate as oldString in apply_tool if it matches the user intent.',
    },
  }
}

export async function executeGenerateDocumentTool(args: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult> {
  const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
  const fileName = typeof args.fileName === 'string' ? args.fileName.trim() : ''

  if (!prompt) {
    return {
      ok: false,
      message: 'generate_document_tool failed: prompt is required. Provide a concrete document-generation prompt before retrying.',
      metadata: {
        nextStep: 'Provide a concrete document-generation prompt and retry.',
      },
    }
  }

  if (!context.providerConfig) {
    return {
      ok: false,
      message: 'generate_document_tool failed: providerConfig is required. The model service is not configured, so no file was created.',
      metadata: {
        nextStep: 'Explain that document generation is unavailable until the provider is configured.',
      },
    }
  }

  const service = new AIService(context.providerConfig)
  const targetFileName = normalizeMarkdownFileName(fileName || `AI生成文档-${new Date().toISOString().slice(0, 10)}`)
  const toolCallId = context.toolCallId || ''
  await context.onGeneratedDocumentEvent?.({ type: 'start', toolCallId, fileName: targetFileName })

  try {
    const content = await service.chatMessagesStream({
      messages: [
        {
          role: 'system',
          content: [
            'You are a professional Markdown document generation assistant.',
            'Generate only the Markdown document content.',
            'Do not include explanations, JSON, or markdown fences around the whole document.',
            'Use the same language as the user request.',
          ].join('\n'),
        },
        { role: 'user', content: prompt },
      ],
      signal: context.signal,
      onDelta: (delta, fullText) => {
        context.onGeneratedDocumentEvent?.({
          type: 'delta',
          toolCallId,
          fileName: targetFileName,
          delta,
          content: fullText,
        })
      },
    })

    await context.onGeneratedDocumentEvent?.({ type: 'done', toolCallId, fileName: targetFileName, content })
    return {
      ok: true,
      message: 'generate_document succeeded. One document has been created and saved. Do not call generate_document_tool again in this run unless the user explicitly requested multiple files. Next, briefly confirm completion to the user.',
      generatedFile: {
        fileName: targetFileName,
        content,
      },
      metadata: {
        fileName: targetFileName,
        contentLength: content.length,
        streamed: true,
        shouldContinueWithTextOnly: true,
        forbidAdditionalGenerateToolCalls: true,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'generate_document failed'
    await context.onGeneratedDocumentEvent?.({ type: 'error', toolCallId, fileName: targetFileName, error: message })
    return {
      ok: false,
      message: `generate_document_tool failed: ${message}. No new file should be assumed. Explain the failure or ask the user whether to retry.`,
      metadata: {
        nextStep: 'Explain the failure or ask whether to retry generation.',
      },
    }
  }
}

function normalizeMarkdownFileName(fileName: string) {
  const trimmed = fileName.trim()
  if (!trimmed) return 'AI生成文档.md'
  if (/\.(md|markdown)$/i.test(trimmed)) return trimmed
  return `${trimmed}.md`
}

const defaultAgentToolExecutors: Record<string, AgentToolExecutor> = {
  apply_tool: executeApplyTool,
  find_tool: executeFindTool,
  generate_document_tool: executeGenerateDocumentTool,
}

export function createDefaultAgentTools(): AgentTool[] {
  return defaultAgentToolDefinitions.map((definition) => {
    const execute = defaultAgentToolExecutors[definition.name]
    if (!execute) {
      throw new Error(`Missing executor for tool: ${definition.name}`)
    }

    return {
      ...definition,
      execute,
    }
  })
}

export function validateToolArguments(
  tool: AgentToolDefinition,
  args: Record<string, unknown>
): AgentToolValidationResult {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {
      ok: false,
      error: {
        code: 'invalid-arguments',
        actualType: getValueType(args),
      },
    }
  }

  for (const field of tool.argumentsSchema.required) {
    if (!(field in args)) {
      return {
        ok: false,
        error: {
          code: 'missing-required',
          field,
        },
      }
    }
  }

  const knownFields = new Set(Object.keys(tool.argumentsSchema.properties))
  const actualFields = Object.keys(args)

  if (!tool.argumentsSchema.additionalProperties) {
    const extraFields = actualFields.filter((field) => !knownFields.has(field))
    if (extraFields.length) {
      return {
        ok: false,
        error: {
          code: 'unexpected-property',
          extraFields,
        },
      }
    }
  }

  for (const [field, value] of Object.entries(args)) {
    const property = tool.argumentsSchema.properties[field]
    if (!property) continue

    if (!matchesSchemaType(property.type, value)) {
      return {
        ok: false,
        error: {
          code: 'invalid-type',
          field,
          expectedType: property.type,
          actualType: getValueType(value),
        },
      }
    }

    if (
      property.type === 'string' &&
      typeof value === 'string' &&
      !property.allowEmpty &&
      !value.trim()
    ) {
      return {
        ok: false,
        error: {
          code: 'empty-string',
          field,
          expectedType: property.type,
          actualType: 'empty-string',
        },
      }
    }
  }

  return { ok: true }
}

export function buildInvalidToolArgumentsResult(
  tool: AgentToolDefinition,
  validation: AgentToolValidationResult
): AgentToolResult {
  const error = validation.error
  if (!error) {
    return { ok: false, message: `Invalid arguments for ${tool.name}` }
  }

  if (error.code === 'invalid-arguments') {
    return {
      ok: false,
      message: `Invalid arguments for ${tool.name}: arguments must be a JSON object.`,
      metadata: { validationError: error },
    }
  }

  if (error.code === 'missing-required') {
    return {
      ok: false,
      message: `Invalid arguments for ${tool.name}: missing required field "${error.field}".`,
      metadata: { validationError: error },
    }
  }

  if (error.code === 'unexpected-property') {
    return {
      ok: false,
      message: `Invalid arguments for ${tool.name}: unexpected field(s) ${error.extraFields?.map((field) => `"${field}"`).join(', ')}.`,
      metadata: { validationError: error },
    }
  }

  if (error.code === 'empty-string') {
    return {
      ok: false,
      message: `Invalid arguments for ${tool.name}: field "${error.field}" must be a non-empty string.`,
      metadata: { validationError: error },
    }
  }

  return {
    ok: false,
    message: `Invalid arguments for ${tool.name}: field "${error.field}" must be ${error.expectedType}, got ${error.actualType}.`,
    metadata: { validationError: error },
  }
}

function matchesSchemaType(expectedType: AgentToolJsonSchemaProperty['type'], value: unknown) {
  if (expectedType === 'string') return typeof value === 'string'
  if (expectedType === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (expectedType === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (expectedType === 'boolean') return typeof value === 'boolean'
  if (expectedType === 'array') return Array.isArray(value)
  if (expectedType === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  return false
}

function getValueType(value: unknown) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}
