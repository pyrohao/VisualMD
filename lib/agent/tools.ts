import type { AgentToolContext, AgentToolResult } from './types'
import { AIService } from '@/lib/ai-service'
import { findNearestText, splitParagraphs, tokenScore } from './text'

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
  code: 'invalid-arguments' | 'missing-required' | 'unexpected-property' | 'invalid-type'
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
}

export const defaultAgentToolDefinitions: AgentToolDefinition[] = [
  {
    name: 'apply_tool',
    description: 'Edit the current document by replacing one exact text fragment.',
    argumentsSchema: {
      type: 'object',
      description: 'Arguments for an exact replacement in the current Markdown document.',
      additionalProperties: false,
      properties: {
        oldString: {
          type: 'string',
          description: 'Required. Copy the exact source text from the current document. Use the smallest complete fragment that satisfies the request, and preserve literal Markdown such as image syntax unless the user explicitly asks to change it.',
        },
        newString: {
          type: 'string',
          description: 'Required. Replacement text only. Keep unchanged Markdown content verbatim when the edit touches surrounding text.',
        },
      },
      required: ['oldString', 'newString'],
    },
  },
  {
    name: 'semantic_tool',
    description: 'Locate the most likely nearby paragraph when exact replacement fails.',
    argumentsSchema: {
      type: 'object',
      description: 'Arguments for semantic recovery after an apply_tool failure.',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Required. Describe the target paragraph or the meaning of the content that should be found.',
        },
        nearText: {
          type: 'string',
          description: 'Optional. Nearby failed text or local context used to bias the search toward the intended region.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'generate_document_tool',
    description: 'Create and save a new Markdown file only when the user explicitly asks for a new document or file.',
    argumentsSchema: {
      type: 'object',
      description: 'Arguments for generating a brand-new Markdown document.',
      additionalProperties: false,
      properties: {
        fileName: {
          type: 'string',
          description: 'Required. Target Markdown file name. It must include the `.md` suffix.',
        },
        prompt: {
          type: 'string',
          description: 'Required. The document-generation instruction used to create the new file content. Use this tool only for brand-new files, not for normal chat or edits to the current document.',
        },
      },
      required: ['fileName', 'prompt'],
    },
  },
]

export async function executeApplyTool(args: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult> {
  const oldString = typeof args.oldString === 'string' ? args.oldString : ''
  const newString = typeof args.newString === 'string' ? args.newString : ''

  if (!oldString) {
    return { ok: false, message: 'oldString is required', metadata: { matchCount: 0 } }
  }

  const matchCount = context.markdown.split(oldString).length - 1
  if (matchCount !== 1) {
    return {
      ok: false,
      message: matchCount === 0 ? 'oldString not found' : 'oldString matched multiple times',
      metadata: {
        matchCount,
        failedText: oldString,
        contextPreview: context.markdown.slice(0, 400),
      },
    }
  }

  return {
    ok: true,
    message: 'apply_tool succeeded',
    nextMarkdown: context.markdown.replace(oldString, newString),
    metadata: { matchCount },
  }
}

export async function executeSemanticTool(args: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult> {
  const query = typeof args.query === 'string' ? args.query : ''
  const nearText = typeof args.nearText === 'string' ? args.nearText : context.lastFailedContext || null
  const nearIndex = findNearestText(context.markdown, nearText)
  const blocks = splitParagraphs(context.markdown)

  const ranked = blocks
    .map((block) => {
      const similarity = tokenScore(query, block.text)
      const distance = nearIndex === null ? 0 : Math.abs(block.start - nearIndex)
      return { ...block, similarity, distance }
    })
    .sort((left, right) => right.similarity - left.similarity || left.distance - right.distance)

  const best = ranked[0]
  if (!best || best.similarity <= 0) {
    return { ok: false, message: 'No semantic candidate found' }
  }

  return {
    ok: true,
    message: JSON.stringify({
      query,
      nearText,
      candidate: best.text,
      candidates: ranked.slice(0, 3).map((item) => item.text),
    }),
    metadata: {
      candidate: best.text,
      candidates: ranked.slice(0, 3).map((item) => item.text),
    },
  }
}

export async function executeGenerateDocumentTool(args: Record<string, unknown>, context: AgentToolContext): Promise<AgentToolResult> {
  const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
  const fileName = typeof args.fileName === 'string' ? args.fileName.trim() : ''

  if (!prompt) {
    return { ok: false, message: 'prompt is required' }
  }

  if (!context.providerConfig) {
    return { ok: false, message: 'providerConfig is required' }
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
      message: 'generate_document succeeded',
      generatedFile: {
        fileName: targetFileName,
        content,
      },
      metadata: {
        fileName: targetFileName,
        contentLength: content.length,
        streamed: true,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'generate_document failed'
    await context.onGeneratedDocumentEvent?.({ type: 'error', toolCallId, fileName: targetFileName, error: message })
    return { ok: false, message }
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
  semantic_tool: executeSemanticTool,
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
