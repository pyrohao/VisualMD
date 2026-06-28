import { getAgentEnvironmentInfo, type AgentEnvironmentInfo } from './environment'
import agentSystemPromptTemplate from './prompts/system.md?raw'

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
