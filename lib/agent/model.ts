import type { AgentMessage, AgentToolCall } from './types'

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function renderAgentMessageXml(message: AgentMessage) {
  const body = escapeXml(message.message)

  if (message.role === 'tool') {
    return `<tool id="${escapeXml(message.toolCallId || message.id)}" name="${escapeXml(message.toolName || '')}">${body}</tool>`
  }

  if (message.role === 'developer') {
    return `<system>${body}</system>`
  }

  return `<${message.role}>${body}</${message.role}>`
}

export function buildAgentTranscript(messages: AgentMessage[]) {
  return messages.map(renderAgentMessageXml).join('\n')
}

export function buildAgentSystemPrompt(toolDescriptions: string[]) {
  return [
    'You are an AI document editing agent.',
    'Return only plain text or a single JSON object.',
    'If you need a tool, return JSON only using this schema:',
    '{"tool":"tool_name","arguments":{...}}',
    'Do not wrap JSON in markdown fences.',
    'Available tools:',
    ...toolDescriptions.map((description) => `- ${description}`),
  ].join('\n')
}

export type ParsedAgentResponse =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; call: AgentToolCall }

export function parseAgentModelResponse(raw: string): ParsedAgentResponse {
  const payload = raw.trim()
  if (!payload) {
    return { kind: 'text', text: '' }
  }

  if (/^```/i.test(payload)) {
    return { kind: 'text', text: payload }
  }

  try {
    const parsed = JSON.parse(payload) as { tool?: unknown; arguments?: unknown }
    if (typeof parsed.tool === 'string' && parsed.arguments && typeof parsed.arguments === 'object') {
      return {
        kind: 'tool',
        call: {
          id: '',
          name: parsed.tool,
          arguments: parsed.arguments as Record<string, unknown>,
        },
      }
    }
  } catch {
    return { kind: 'text', text: payload }
  }

  return { kind: 'text', text: payload }
}
