import type { AgentToolCall } from './types'

export type ParsedAgentResponse =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; call: AgentToolCall }

interface ParsedToolPayload {
  tool: string
  arguments: Record<string, unknown>
}

export function parseAgentModelResponse(raw: string): ParsedAgentResponse {
  const payload = raw.trim()
  if (!payload) {
    return { kind: 'text', text: '' }
  }

  if (/^```/i.test(payload)) {
    return { kind: 'text', text: payload }
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

export function extractToolJson(value: string): ParsedToolPayload | null {
  const toolIndex = value.indexOf('"tool"')
  if (toolIndex < 0) return null

  for (let start = value.lastIndexOf('{', toolIndex); start >= 0; start = value.lastIndexOf('{', start - 1)) {
    const candidate = readBalancedJsonObject(value, start)
    if (!candidate) continue

    const parsed = parseToolJson(candidate)
    if (parsed) return parsed
  }

  return null
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
