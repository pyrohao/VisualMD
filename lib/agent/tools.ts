import type { AgentToolContext, AgentToolResult } from './types'
import { AIService } from '@/lib/ai-service'

export interface AgentToolDefinition {
  name: string
  description: string
  parameters: string
  execute: (args: Record<string, unknown>, context: AgentToolContext) => Promise<AgentToolResult> | AgentToolResult
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function splitParagraphs(markdown: string) {
  return markdown
    .split(/\n{2,}/)
    .map((text, index) => ({
      index,
      text: text.trim(),
      start: markdown.indexOf(text),
    }))
    .filter((item) => item.text.length > 0)
}

function tokenScore(left: string, right: string) {
  const leftTokens = new Set(normalizeText(left).split(/\s+/).filter(Boolean))
  const rightTokens = new Set(normalizeText(right).split(/\s+/).filter(Boolean))
  if (!leftTokens.size || !rightTokens.size) {
    return 0
  }

  let shared = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      shared += 1
    }
  })

  return shared / Math.max(leftTokens.size, rightTokens.size)
}

function findNearestText(markdown: string, nearText?: string | null) {
  if (!nearText) return null
  const hitIndex = markdown.indexOf(nearText)
  return hitIndex >= 0 ? hitIndex : null
}

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
  const result = await service.generateMarkdown({ prompt })
  if (!result.success) {
    return { ok: false, message: result.error || 'generate_document failed' }
  }

  return {
    ok: true,
    message: 'generate_document succeeded',
    generatedFile: {
      fileName: fileName || result.fileName,
      content: result.content,
    },
    metadata: {
      fileName: fileName || result.fileName,
      contentLength: result.content.length,
    },
  }
}

export function createDefaultAgentTools() {
  const tools: AgentToolDefinition[] = [
    {
      name: 'apply_tool',
      description: 'Replace exact oldString with newString in the current document.',
      parameters: '{"oldString":"string","newString":"string"}',
      execute: executeApplyTool,
    },
    {
      name: 'semantic_tool',
      description: 'Find a nearby semantic paragraph candidate for a failed replacement.',
      parameters: '{"query":"string","nearText?":"string"}',
      execute: executeSemanticTool,
    },
    {
      name: 'generate_document_tool',
      description: 'Create and save a NEW Markdown file only when the user explicitly asks to create/generate/save a new document or new file. Never use for normal chat, Q&A, summaries, explanations, or edits to the current document.',
      parameters: '{"prompt":"string","fileName?":"string"}',
      execute: executeGenerateDocumentTool,
    },
  ]

  return tools
}
