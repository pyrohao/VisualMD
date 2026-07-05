import type { AgentDocumentAction, AgentToolCall } from './types'

export type ParsedAgentResponse =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; call: AgentToolCall }
  | { kind: 'action'; action: AgentDocumentAction }

interface ParsedToolPayload {
  tool: string
  arguments: Record<string, unknown>
}

interface ParsedActionPayload {
  action: AgentDocumentAction['action']
  content: string
}

export function parseAgentModelResponse(raw: string): ParsedAgentResponse {
  const payload = unwrapJsonFence(raw.trim())
  if (!payload) {
    return { kind: 'text', text: '' }
  }

  const parsedTool = parseToolJson(payload) || extractToolJson(payload)
  if (parsedTool) {
    return {
      kind: 'tool',
      call: {
        id: '',
        name: parsedTool.tool,
        arguments: parsedTool.arguments,
      },
    }
  }

  const parsedAction = parseActionJson(payload) || extractActionJson(payload)
  if (parsedAction) {
    return {
      kind: 'action',
      action: parsedAction,
    }
  }

  return { kind: 'text', text: payload }
}

function parseToolJson(value: string): ParsedToolPayload | null {
  try {
    const parsed = JSON.parse(value) as { tool?: unknown; arguments?: unknown }
    if (typeof parsed.tool === 'string' && parsed.arguments && typeof parsed.arguments === 'object') {
      return { tool: parsed.tool, arguments: parsed.arguments as Record<string, unknown> }
    }
  } catch {
    return null
  }

  return null
}

function parseActionJson(value: string): ParsedActionPayload | null {
  try {
    const parsed = JSON.parse(value) as { action?: unknown; content?: unknown }
    if (
      (parsed.action === 'replace' || parsed.action === 'append') &&
      typeof parsed.content === 'string'
    ) {
      return {
        action: parsed.action,
        content: parsed.content,
      }
    }
  } catch {
    return null
  }

  return null
}

export function extractToolJson(value: string): ParsedToolPayload | null {
  return extractJsonObject(value, '"tool"', parseToolJson)
}

export function extractActionJson(value: string): ParsedActionPayload | null {
  return extractJsonObject(value, '"action"', parseActionJson)
}

function extractJsonObject<T>(
  value: string,
  marker: string,
  parser: (candidate: string) => T | null
) {
  const markerIndex = value.indexOf(marker)
  if (markerIndex < 0) return null

  for (let start = value.lastIndexOf('{', markerIndex); start >= 0; start = value.lastIndexOf('{', start - 1)) {
    const candidate = readBalancedJsonObject(value, start)
    if (!candidate) continue

    const parsed = parser(candidate)
    if (parsed) return parsed
  }

  return null
}

function unwrapJsonFence(value: string) {
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced?.[1]?.trim() || value
}

function readBalancedJsonObject(value: string, start: number) {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < value.length; index += 1) {
    const char = value[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') depth += 1
    if (char === '}') depth -= 1

    if (depth === 0) {
      return value.slice(start, index + 1)
    }
  }

  return null
}
