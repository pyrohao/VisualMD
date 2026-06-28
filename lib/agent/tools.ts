import type { AgentToolContext, AgentToolResult } from './types'
import { AIService } from '@/lib/ai-service'
import { findNearestText, splitParagraphs, tokenScore } from './text'

export interface AgentToolDefinition {
  name: string
  description: string
  parameters: string
  execute: (args: Record<string, unknown>, context: AgentToolContext) => Promise<AgentToolResult> | AgentToolResult
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
  const targetFileName = fileName || `AI生成文档-${new Date().toISOString().slice(0, 10)}.md`
  const toolCallId = context.toolCallId || ''
  context.onGeneratedDocumentEvent?.({ type: 'start', toolCallId, fileName: targetFileName })

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

    context.onGeneratedDocumentEvent?.({ type: 'done', toolCallId, fileName: targetFileName, content })
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
    context.onGeneratedDocumentEvent?.({ type: 'error', toolCallId, fileName: targetFileName, error: message })
    return { ok: false, message }
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
      parameters: '{"fileName":"string","prompt":"string"}',
      execute: executeGenerateDocumentTool,
    },
  ]

  return tools
}
