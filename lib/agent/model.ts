import type { AgentMessage } from './types'

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
