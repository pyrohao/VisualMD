/**
 * 设置状态管理 - Zustand Store
 *
 * AI 配置采用动态 provider 数组，面向用户自有大模型平台：
 * - 不再用固定厂商枚举作为业务边界
 * - 支持 OpenAI-compatible 与 Anthropic-compatible 接口
 * - API 密钥仅加密保存在本地浏览器
 */

import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { decryptSecret, encryptSecret, normalizeEncryptedSecret } from '@/lib/secret-storage'

export type AIProvider = string
export type AIProviderProtocol = 'openai-compatible' | 'anthropic-compatible'
export type AIProviderAuthType = 'bearer' | 'x-api-key'
export type OpenAIEndpointType = 'auto' | 'chat-completions' | 'responses'

export interface ProviderModelDiscovery {
  type: 'openai-models' | 'anthropic-models' | 'none'
  path: string
}

export interface ProviderProfile {
  id: string
  name: string
  protocol: AIProviderProtocol
  baseUrl: string
  authType: AIProviderAuthType
  openAIEndpoint?: OpenAIEndpointType
  models: string[]
  modelDiscovery: ProviderModelDiscovery
  customHeaders?: Record<string, string>
}

/**
 * 单个厂商配置接口
 */
export interface ProviderConfig {
  /** 用户配置 ID */
  id: string
  /** 来源模板 ID；预设渠道用它保证每个渠道独立保存，自定义渠道可重复 */
  templateId?: string
  /** 显示名称 */
  name: string
  /** 协议类型 */
  protocol: AIProviderProtocol
  /** API 基础地址 */
  baseUrl: string
  /** API 密钥（加密存储） */
  apiKey: string
  /** 模型名称 */
  model: string
  /** 可选模型列表，来自模板或在线发现 */
  models: string[]
  /** 模型发现配置 */
  modelDiscovery: ProviderModelDiscovery
  /** 鉴权方式 */
  authType: AIProviderAuthType
  /** OpenAI 兼容接口端点 */
  openAIEndpoint: OpenAIEndpointType
  /** 温度参数 */
  temperature: number
  /** 最大 token 数 */
  maxTokens: number
  /** 是否已测试通过 */
  isTested: boolean
  /** 测试状态消息 */
  testMessage?: string
  /** 自定义请求头 */
  customHeaders?: Record<string, string>
}

export const PROVIDER_TEMPLATES: ProviderProfile[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    authType: 'bearer',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
    modelDiscovery: { type: 'openai-models', path: '/models' },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    protocol: 'anthropic-compatible',
    baseUrl: 'https://api.anthropic.com/v1',
    authType: 'x-api-key',
    models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
    modelDiscovery: { type: 'anthropic-models', path: '/models' },
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    authType: 'bearer',
    models: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'deepseek/deepseek-chat'],
    modelDiscovery: { type: 'openai-models', path: '/models' },
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    authType: 'bearer',
    models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
    modelDiscovery: { type: 'openai-models', path: '/models' },
  },
  {
    id: 'qianwen',
    name: '通义千问',
    protocol: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authType: 'bearer',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    modelDiscovery: { type: 'openai-models', path: '/models' },
  },
  {
    id: 'volcengine',
    name: '火山引擎',
    protocol: 'openai-compatible',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    authType: 'bearer',
    models: ['doubao-1.5-pro-32k', 'doubao-1.5-lite-32k', 'deepseek-r1-250120'],
    modelDiscovery: { type: 'openai-models', path: '/models' },
  },
  {
    id: 'zhipu',
    name: '智谱AI',
    protocol: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    authType: 'bearer',
    models: ['glm-4', 'glm-4-plus', 'glm-4-flash'],
    modelDiscovery: { type: 'openai-models', path: '/models' },
  },
  {
    id: 'custom-openai',
    name: '自定义 OpenAI 兼容',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    authType: 'bearer',
    models: [],
    modelDiscovery: { type: 'openai-models', path: '/models' },
  },
  {
    id: 'custom-anthropic',
    name: '自定义 Anthropic 兼容',
    protocol: 'anthropic-compatible',
    baseUrl: 'https://api.example.com/v1',
    authType: 'x-api-key',
    models: [],
    modelDiscovery: { type: 'anthropic-models', path: '/models' },
  },
]

export const PRESET_PROVIDERS = PROVIDER_TEMPLATES

function createProviderId(templateId = 'provider') {
  return `${templateId}-${nanoid(8)}`
}

export function createProviderConfigFromTemplate(template: ProviderProfile): ProviderConfig {
  return {
    id: createProviderId(template.id),
    templateId: template.id,
    name: template.name,
    protocol: template.protocol,
    baseUrl: template.baseUrl,
    apiKey: '',
    model: template.models[0] || '',
    models: template.models,
    modelDiscovery: template.modelDiscovery,
    authType: template.authType,
    openAIEndpoint: template.protocol === 'openai-compatible' ? 'auto' : 'chat-completions',
    temperature: 0.7,
    maxTokens: 4096,
    isTested: false,
    testMessage: undefined,
    customHeaders: template.customHeaders,
  }
}

function createDefaultProviders() {
  return [
    createProviderConfigFromTemplate(PROVIDER_TEMPLATES[0]),
    createProviderConfigFromTemplate(PROVIDER_TEMPLATES[2]),
    createProviderConfigFromTemplate(PROVIDER_TEMPLATES[7]),
  ]
}

function inferTemplateId(raw: Partial<ProviderConfig> & Record<string, unknown>, fallback?: ProviderProfile) {
  if (typeof raw.templateId === 'string') return raw.templateId
  if (fallback?.id) return fallback.id

  const name = typeof raw.name === 'string' ? raw.name : ''
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl : ''
  const protocol = raw.protocol === 'anthropic-compatible' ? 'anthropic-compatible' : 'openai-compatible'
  return PROVIDER_TEMPLATES.find((template) =>
    !template.id.startsWith('custom-') &&
    template.name === name &&
    template.baseUrl === baseUrl &&
    template.protocol === protocol
  )?.id
}

function normalizeProviderConfig(raw: Partial<ProviderConfig> & Record<string, unknown>, fallback?: ProviderProfile): ProviderConfig {
  const protocol = raw.protocol === 'anthropic-compatible' ? 'anthropic-compatible' : fallback?.protocol || 'openai-compatible'
  const authType =
    raw.authType === 'x-api-key' || raw.authType === 'bearer'
      ? raw.authType
      : protocol === 'anthropic-compatible'
        ? 'x-api-key'
        : fallback?.authType || 'bearer'
  const modelDiscovery = raw.modelDiscovery && typeof raw.modelDiscovery === 'object'
    ? raw.modelDiscovery as ProviderModelDiscovery
    : fallback?.modelDiscovery || {
        type: protocol === 'anthropic-compatible' ? 'anthropic-models' : 'openai-models',
        path: '/models',
      }
  const models = Array.isArray(raw.models) ? raw.models.filter((model): model is string => typeof model === 'string') : fallback?.models || []
  const openAIEndpoint =
    raw.openAIEndpoint === 'chat-completions' || raw.openAIEndpoint === 'responses' || raw.openAIEndpoint === 'auto'
      ? raw.openAIEndpoint
      : fallback?.openAIEndpoint || 'auto'

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createProviderId(String(fallback?.id || 'provider')),
    templateId: inferTemplateId(raw, fallback),
    name: typeof raw.name === 'string' ? raw.name : fallback?.name || '自定义模型平台',
    protocol,
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : fallback?.baseUrl || 'https://api.example.com/v1',
    apiKey: normalizeEncryptedSecret(typeof raw.apiKey === 'string' ? raw.apiKey : ''),
    model: typeof raw.model === 'string' ? raw.model : models[0] || '',
    models,
    modelDiscovery,
    authType,
    openAIEndpoint,
    temperature: typeof raw.temperature === 'number' ? raw.temperature : 0.7,
    maxTokens: typeof raw.maxTokens === 'number' ? raw.maxTokens : 4096,
    isTested: Boolean(raw.isTested),
    testMessage: typeof raw.testMessage === 'string' ? raw.testMessage : undefined,
    customHeaders: raw.customHeaders && typeof raw.customHeaders === 'object'
      ? raw.customHeaders as Record<string, string>
      : fallback?.customHeaders,
  }
}

function migrateLegacyProviders(persistedConfigs: unknown): ProviderConfig[] {
  if (Array.isArray(persistedConfigs)) {
    return persistedConfigs.map((config) => normalizeProviderConfig(config))
  }

  if (!persistedConfigs || typeof persistedConfigs !== 'object') {
    return createDefaultProviders()
  }

  return Object.entries(persistedConfigs as Record<string, Partial<ProviderConfig> & Record<string, unknown>>).map(([legacyId, config]) => {
    const fallback = PROVIDER_TEMPLATES.find((template) => template.id === legacyId)
    return normalizeProviderConfig(
      {
        id: typeof config.id === 'string' ? config.id : legacyId,
        ...config,
        models: Array.isArray(config.models) ? config.models : fallback?.models,
      },
      fallback
    )
  })
}

function getProviderOrFirst(providers: ProviderConfig[], providerId: string | null | undefined) {
  return providers.find((provider) => provider.id === providerId) || providers[0]
}

interface SettingsStore {
  activeProviderId: string
  providers: ProviderConfig[]
  isGenerating: boolean
  generatingPrompt: string
  setActiveProvider: (providerId: string) => void
  addProviderFromTemplate: (templateId: string) => string
  selectOrCreatePresetProvider: (templateId: string) => string
  addCustomProvider: (protocol?: AIProviderProtocol) => string
  removeProvider: (providerId: string) => void
  renameProvider: (providerId: string, name: string) => void
  updateProviderConfig: (providerId: string, config: Partial<ProviderConfig>) => void
  updateProviderModels: (providerId: string, models: string[], selectedModel?: string) => void
  getDecryptedApiKey: (providerId: string) => string
  getActiveProviderApiKey: () => string
  validateProviderConfig: (providerId: string) => boolean
  validateActiveProvider: () => boolean
  setProviderTestStatus: (providerId: string, isTested: boolean, message?: string) => void
  applyPresetProvider: (providerId: string, templateId?: string) => void
  getActiveProviderConfig: () => ProviderConfig
  setIsGenerating: (value: boolean, prompt?: string) => void
  _rehydrate: (persistedState: Partial<SettingsStore> & Record<string, unknown>) => void
}

export const useSettingsStore = create<SettingsStore>()(
  devtools(
    persist(
      (set, get) => {
        const defaultProviders = createDefaultProviders()
        return {
          activeProviderId: defaultProviders[0].id,
          providers: defaultProviders,
          isGenerating: false,
          generatingPrompt: '',

          _rehydrate: (persistedState) => {
            const migratedProviders = migrateLegacyProviders(
              persistedState.providers || persistedState.providerConfigs
            )
            const activeProviderId =
              typeof persistedState.activeProviderId === 'string'
                ? persistedState.activeProviderId
                : typeof persistedState.activeProvider === 'string'
                  ? persistedState.activeProvider
                  : migratedProviders[0]?.id || ''

            set({
              providers: migratedProviders,
              activeProviderId: getProviderOrFirst(migratedProviders, activeProviderId)?.id || '',
            })
          },

          setActiveProvider: (providerId) => {
            if (get().providers.some((provider) => provider.id === providerId)) {
              set({ activeProviderId: providerId })
            }
          },

          addProviderFromTemplate: (templateId) => {
            const template = PROVIDER_TEMPLATES.find((item) => item.id === templateId) || PROVIDER_TEMPLATES[7]
            const provider = createProviderConfigFromTemplate(template)
            set((state) => ({
              providers: [...state.providers, provider],
              activeProviderId: provider.id,
            }))
            return provider.id
          },

          selectOrCreatePresetProvider: (templateId) => {
            const template = PROVIDER_TEMPLATES.find((item) => item.id === templateId)
            if (!template) return get().activeProviderId

            const existing = get().providers.find((provider) => provider.templateId === template.id)
            if (existing) {
              set({ activeProviderId: existing.id })
              return existing.id
            }

            const provider = createProviderConfigFromTemplate(template)
            set((state) => ({
              providers: [...state.providers, provider],
              activeProviderId: provider.id,
            }))
            return provider.id
          },

          addCustomProvider: (protocol = 'openai-compatible') => {
            const template = PROVIDER_TEMPLATES.find((item) =>
              protocol === 'anthropic-compatible' ? item.id === 'custom-anthropic' : item.id === 'custom-openai'
            ) || PROVIDER_TEMPLATES[7]
            const provider = createProviderConfigFromTemplate(template)
            provider.templateId = undefined
            set((state) => ({
              providers: [...state.providers, provider],
              activeProviderId: provider.id,
            }))
            return provider.id
          },

          removeProvider: (providerId) => {
            set((state) => {
              if (state.providers.length <= 1) return state
              const providers = state.providers.filter((provider) => provider.id !== providerId)
              return {
                providers,
                activeProviderId: state.activeProviderId === providerId ? providers[0]?.id || '' : state.activeProviderId,
              }
            })
          },

          renameProvider: (providerId, name) => {
            const nextName = name.trim()
            if (!nextName) return
            get().updateProviderConfig(providerId, { name: nextName })
          },

          updateProviderConfig: (providerId, config) => {
            set((state) => ({
              providers: state.providers.map((provider) => {
                if (provider.id !== providerId) return provider
                const protocol = config.protocol || provider.protocol
                const nextConfig = {
                  ...provider,
                  ...config,
                  apiKey: config.apiKey !== undefined ? encryptSecret(config.apiKey) : provider.apiKey,
                  authType: config.authType || (
                    config.protocol === 'anthropic-compatible' ? 'x-api-key' : provider.authType
                  ),
                  openAIEndpoint: config.openAIEndpoint || (
                    config.protocol === 'openai-compatible' ? 'auto' : provider.openAIEndpoint
                  ),
                  modelDiscovery: config.modelDiscovery || (
                    config.protocol
                      ? {
                          type: protocol === 'anthropic-compatible' ? 'anthropic-models' : 'openai-models',
                          path: '/models',
                        } satisfies ProviderModelDiscovery
                      : provider.modelDiscovery
                  ),
                  isTested: config.apiKey !== undefined ||
                    config.baseUrl !== undefined ||
                    config.model !== undefined ||
                    config.protocol !== undefined ||
                    config.authType !== undefined
                    ? false
                    : provider.isTested,
                }
                return normalizeProviderConfig(nextConfig)
              }),
            }))
          },

          updateProviderModels: (providerId, models, selectedModel) => {
            const uniqueModels = Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)))
            set((state) => ({
              providers: state.providers.map((provider) =>
                provider.id === providerId
                  ? {
                      ...provider,
                      models: uniqueModels,
                      model: selectedModel || provider.model || uniqueModels[0] || '',
                    }
                  : provider
              ),
            }))
          },

          getDecryptedApiKey: (providerId) => {
            const provider = getProviderOrFirst(get().providers, providerId)
            return provider ? decryptSecret(provider.apiKey) : ''
          },

          getActiveProviderApiKey: () => {
            return get().getDecryptedApiKey(get().activeProviderId)
          },

          validateProviderConfig: (providerId) => {
            const provider = getProviderOrFirst(get().providers, providerId)
            if (!provider) return false
            return Boolean(decryptSecret(provider.apiKey) && provider.baseUrl && provider.model)
          },

          validateActiveProvider: () => {
            const provider = getProviderOrFirst(get().providers, get().activeProviderId)
            if (!provider) return false
            return Boolean(decryptSecret(provider.apiKey) && provider.baseUrl && provider.model && provider.isTested)
          },

          setProviderTestStatus: (providerId, isTested, message) => {
            set((state) => ({
              providers: state.providers.map((provider) =>
                provider.id === providerId
                  ? { ...provider, isTested, testMessage: message }
                  : provider
              ),
            }))
          },

          applyPresetProvider: (providerId, templateId) => {
            const template = PROVIDER_TEMPLATES.find((item) => item.id === templateId) ||
              PROVIDER_TEMPLATES.find((item) => item.id === providerId)
            if (!template) return

            set((state) => ({
              providers: state.providers.map((provider) =>
                provider.id === providerId
                  ? {
                      ...provider,
                      name: template.name,
                      protocol: template.protocol,
                      baseUrl: template.baseUrl,
                      model: template.models[0] || '',
                      models: template.models,
                      modelDiscovery: template.modelDiscovery,
                      authType: template.authType,
                      customHeaders: template.customHeaders,
                      isTested: false,
                      testMessage: undefined,
                    }
                  : provider
              ),
            }))
          },

          getActiveProviderConfig: () => {
            return getProviderOrFirst(get().providers, get().activeProviderId) || createDefaultProviders()[0]
          },

          setIsGenerating: (value, prompt = '') => {
            set({ isGenerating: value, generatingPrompt: prompt })
          },
        }
      },
      {
        name: 'settings-store',
        partialize: (state) => ({
          activeProviderId: state.activeProviderId,
          providers: state.providers,
        }),
        onRehydrateStorage: () => (state) => {
          state?._rehydrate(state)
        },
      }
    ),
    { name: 'SettingsStore' }
  )
)

export default useSettingsStore
