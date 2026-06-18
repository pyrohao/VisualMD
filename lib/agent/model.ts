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

export interface AgentEnvironmentInfo {
  operatingSystem: string
  browser: string
  timezone: string
  language: string
  today: string
}

function detectOperatingSystem(userAgent: string) {
  if (/windows/i.test(userAgent)) return 'Windows'
  if (/mac os|macintosh/i.test(userAgent)) return 'macOS'
  if (/android/i.test(userAgent)) return 'Android'
  if (/iphone|ipad|ios/i.test(userAgent)) return 'iOS'
  if (/linux/i.test(userAgent)) return 'Linux'
  return 'Unknown'
}

function detectBrowser(userAgent: string) {
  if (/edg\//i.test(userAgent)) return 'Microsoft Edge'
  if (/chrome|crios/i.test(userAgent) && !/edg\//i.test(userAgent)) return 'Chrome'
  if (/firefox|fxios/i.test(userAgent)) return 'Firefox'
  if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) return 'Safari'
  return 'Unknown'
}

export function getAgentEnvironmentInfo(): AgentEnvironmentInfo {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const language = typeof navigator !== 'undefined' ? navigator.language : 'unknown'
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'

  return {
    operatingSystem: detectOperatingSystem(userAgent),
    browser: detectBrowser(userAgent),
    timezone,
    language,
    today: new Date().toLocaleDateString('en-CA', { timeZone: timezone }),
  }
}

export function buildAgentSystemPrompt(toolDescriptions: string[], environment = getAgentEnvironmentInfo()) {
  return [
    'You are an AI document editing agent.',
    'Environment:',
    `- Operating system: ${environment.operatingSystem}`,
    `- Browser: ${environment.browser}`,
    `- Timezone: ${environment.timezone}`,
    `- Language: ${environment.language}`,
    `- Today: ${environment.today}`,
    'Return only plain text or a single JSON object.',
    'If you need a tool, return JSON only using this schema:',
    '{"tool":"tool_name","arguments":{...}}',
    'Do not wrap JSON in markdown fences.',
    'Use tools only when the user explicitly requests a document change, recovery search, or new file creation.',
    'For normal chat, explanation, analysis, Q&A, or discussion, return plain text and do not call any tool.',
    'Only call generate_document_tool when the user clearly asks to create, generate, or save a NEW Markdown document/file. Do not call it for ordinary answers, summaries, rewrites of the current document, or conversational help.',
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

export function splitAssistantThinking(raw: string) {
  const thoughts: string[] = []
  const text = raw.replace(/<think>([\s\S]*?)<\/think>/gi, (_match, thought) => {
    const value = String(thought || '').trim()
    if (value) {
      thoughts.push(value)
    }
    return ''
  }).trim()

  return {
    thinking: thoughts.join('\n\n'),
    text,
  }
}
