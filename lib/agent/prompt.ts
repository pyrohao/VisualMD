import { getAgentEnvironmentInfo, type AgentEnvironmentInfo } from './environment'
import agentSystemPromptTemplate from './prompts/system.md?raw'
import agentToolsPromptTemplate from './prompts/tools.md?raw'
import type { AgentToolDefinition } from './tools'

export function buildAgentSystemPrompt(toolDescriptions: string[], environment = getAgentEnvironmentInfo()) {
  return renderPromptTemplate(agentSystemPromptTemplate, {
    operatingSystem: environment.operatingSystem,
    browser: environment.browser,
    timezone: environment.timezone,
    language: environment.language,
    today: environment.today,
    tools: toolDescriptions.map((description) => `- ${description}`).join('\n'),
  })
}

function renderPromptTemplate(template: string, values: AgentEnvironmentInfo & { tools: string }) {
  return Object.entries(values).reduce(
    (nextTemplate, [key, value]) => nextTemplate.replaceAll(`{{${key}}}`, value),
    template
  ).trim()
}

export function buildAgentToolsPrompt(tools: AgentToolDefinition[]) {
  return renderToolTemplate(agentToolsPromptTemplate, {
    toolDefinitionsJson: JSON.stringify({ tools: tools.map(toPromptToolDefinition) }, null, 2),
  })
}

function renderToolTemplate(template: string, values: { toolDefinitionsJson: string }) {
  return Object.entries(values).reduce(
    (nextTemplate, [key, value]) => nextTemplate.replaceAll(`{{${key}}}`, value),
    template
  ).trim()
}

function toPromptToolDefinition(tool: AgentToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    argumentsSchema: tool.argumentsSchema,
  }
}
