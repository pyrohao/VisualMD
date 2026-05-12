/**
 * 设置状态管理 - Zustand Store
 *
 * 管理AI配置和通用设置
 * - 多厂商AI配置（每个厂商独立配置）
 * - API密钥加密存储
 * - 每个厂商独立的测试状态
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { decryptSecret, encryptSecret, normalizeEncryptedSecret } from '@/lib/secret-storage'

/**
 * AI提供商类型
 */
export type AIProvider = 
  | 'openai' 
  | 'volcengine' 
  | 'siliconflow' 
  | 'openrouter' 
  | 'zhipu' 
  | 'qianwen' 
  | 'custom'

/**
 * 单个厂商配置接口
 */
export interface ProviderConfig {
  /** 提供商ID */
  id: AIProvider
  /** 显示名称 */
  name: string
  /** API基础地址 */
  baseUrl: string
  /** API密钥（加密存储） */
  apiKey: string
  /** 模型名称 */
  model: string
  /** 温度参数 */
  temperature: number
  /** 最大token数 */
  maxTokens: number
  /** 是否已测试通过 */
  isTested: boolean
  /** 测试状态消息 */
  testMessage?: string
  /** 自定义请求头 */
  customHeaders?: Record<string, string>
}

/**
 * 预设提供商配置（默认配置模板）
 */
export const PRESET_PROVIDERS: { 
  id: AIProvider
  name: string
  baseUrl: string
  models: string[]
}[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    id: 'volcengine',
    name: '火山引擎',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-1.5-pro-32k', 'doubao-1.5-lite-32k', 'deepseek-r1-250120'],
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'],
  },
  {
    id: 'zhipu',
    name: '智谱AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4', 'glm-4-plus', 'glm-4-flash'],
  },
  {
    id: 'qianwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'google/gemini-pro-1.5'],
  },
  {
    id: 'custom',
    name: '自定义',
    baseUrl: 'https://api.example.com/v1',
    models: [],
  },
]

/**
 * 创建默认厂商配置
 */
function createDefaultProviderConfig(id: AIProvider): ProviderConfig {
  const preset = PRESET_PROVIDERS.find(p => p.id === id)
  return {
    id,
    name: preset?.name || '自定义',
    baseUrl: preset?.baseUrl || 'https://api.example.com/v1',
    apiKey: '',
    model: preset?.models[0] || '',
    temperature: 0.7,
    maxTokens: 4096,
    isTested: false,
    testMessage: undefined,
  }
}

/**
 * Settings Store 接口
 */
interface SettingsStore {
  // ==================== AI配置 ====================
  
  /** 当前选中的提供商 */
  activeProvider: AIProvider
  /** 所有厂商配置 */
  providerConfigs: Record<AIProvider, ProviderConfig>
  
  // ==================== 生成状态 ====================
  
  /** 是否正在生成 */
  isGenerating: boolean
  /** 当前生成的提示词 */
  generatingPrompt: string
  
  // ==================== 操作 ====================
  
  /** 设置当前提供商 */
  setActiveProvider: (provider: AIProvider) => void
  /** 更新指定厂商配置 */
  updateProviderConfig: (provider: AIProvider, config: Partial<ProviderConfig>) => void
  /** 获取解密后的API Key */
  getDecryptedApiKey: (provider: AIProvider) => string
  /** 获取当前厂商解密后的API Key */
  getActiveProviderApiKey: () => string
  /** 验证指定厂商配置是否有效 */
  validateProviderConfig: (provider: AIProvider) => boolean
  /** 验证当前厂商配置是否有效且已测试 */
  validateActiveProvider: () => boolean
  /** 设置厂商测试状态 */
  setProviderTestStatus: (provider: AIProvider, isTested: boolean, message?: string) => void
  /** 应用预设提供商配置 */
  applyPresetProvider: (provider: AIProvider) => void
  /** 获取当前厂商配置 */
  getActiveProviderConfig: () => ProviderConfig
  
  // ==================== 生成状态操作 ====================
  
  /** 设置生成状态 */
  setIsGenerating: (value: boolean, prompt?: string) => void
  
  // ==================== 内部方法 ====================
  
  /** 从持久化存储恢复配置（内部使用） */
  _rehydrate: (persistedState: Partial<SettingsStore>) => void
}

/**
 * 创建 Settings Store
 */
export const useSettingsStore = create<SettingsStore>()(
  devtools(
    persist(
      (set, get) => ({
        // ==================== 初始状态 ====================
        activeProvider: 'openai',
        providerConfigs: {
          openai: createDefaultProviderConfig('openai'),
          volcengine: createDefaultProviderConfig('volcengine'),
          siliconflow: createDefaultProviderConfig('siliconflow'),
          zhipu: createDefaultProviderConfig('zhipu'),
          qianwen: createDefaultProviderConfig('qianwen'),
          openrouter: createDefaultProviderConfig('openrouter'),
          custom: createDefaultProviderConfig('custom'),
        },
        isGenerating: false,
        generatingPrompt: '',
        
        // ==================== 初始化方法 ====================
        
        /**
         * 从持久化存储恢复后合并配置
         * 保留持久化的测试状态和自定义配置
         */
        _rehydrate: (persistedState: Partial<SettingsStore>) => {
          const currentConfigs = get().providerConfigs
          const persistedConfigs = persistedState.providerConfigs
          
          if (persistedConfigs) {
            // 合并配置：保留持久化的值，缺失的字段使用默认值
            const mergedConfigs: Record<AIProvider, ProviderConfig> = {
              openai: { ...createDefaultProviderConfig('openai'), ...persistedConfigs.openai },
              volcengine: { ...createDefaultProviderConfig('volcengine'), ...persistedConfigs.volcengine },
              siliconflow: { ...createDefaultProviderConfig('siliconflow'), ...persistedConfigs.siliconflow },
              zhipu: { ...createDefaultProviderConfig('zhipu'), ...persistedConfigs.zhipu },
              qianwen: { ...createDefaultProviderConfig('qianwen'), ...persistedConfigs.qianwen },
              openrouter: { ...createDefaultProviderConfig('openrouter'), ...persistedConfigs.openrouter },
              custom: { ...createDefaultProviderConfig('custom'), ...persistedConfigs.custom },
            }

            const normalizedConfigs = Object.fromEntries(
              Object.entries(mergedConfigs).map(([provider, config]) => [
                provider,
                {
                  ...config,
                  apiKey: normalizeEncryptedSecret(config.apiKey || ''),
                },
              ])
            ) as Record<AIProvider, ProviderConfig>
            
            set({
              providerConfigs: normalizedConfigs,
              activeProvider: persistedState.activeProvider || 'openai',
            })
          }
        },
        
        // ==================== 操作实现 ====================
        
        setActiveProvider: (provider) => {
          set({ activeProvider: provider })
        },
        
        updateProviderConfig: (provider, config) => {
          set((state) => ({
            providerConfigs: {
              ...state.providerConfigs,
              [provider]: {
                ...state.providerConfigs[provider],
                ...config,
                // 持久层不保存明文
                apiKey: config.apiKey !== undefined
                  ? encryptSecret(config.apiKey)
                  : state.providerConfigs[provider].apiKey,
                // 如果修改了配置，重置测试状态
                isTested: config.apiKey !== undefined || config.baseUrl !== undefined || config.model !== undefined
                  ? false
                  : state.providerConfigs[provider].isTested,
              },
            },
          }))
        },
        
        getDecryptedApiKey: (provider) => {
          return decryptSecret(get().providerConfigs[provider].apiKey)
        },
        
        getActiveProviderApiKey: () => {
          return decryptSecret(get().providerConfigs[get().activeProvider].apiKey)
        },
        
        validateProviderConfig: (provider) => {
          const config = get().providerConfigs[provider]
          const apiKey = decryptSecret(config.apiKey)
          return !!(
            apiKey &&
            config.baseUrl &&
            config.model
          )
        },
        
        validateActiveProvider: () => {
          const { activeProvider, providerConfigs } = get()
          const config = providerConfigs[activeProvider]
          const apiKey = decryptSecret(config.apiKey)
          return !!(
            apiKey &&
            config.baseUrl &&
            config.model &&
            config.isTested
          )
        },
        
        setProviderTestStatus: (provider, isTested, message) => {
          set((state) => ({
            providerConfigs: {
              ...state.providerConfigs,
              [provider]: {
                ...state.providerConfigs[provider],
                isTested,
                testMessage: message,
              },
            },
          }))
        },
        
        applyPresetProvider: (providerId) => {
          const preset = PRESET_PROVIDERS.find((p) => p.id === providerId)
          if (!preset) return
          
          set((state) => ({
            providerConfigs: {
              ...state.providerConfigs,
              [providerId]: {
                ...state.providerConfigs[providerId],
                name: preset.name,
                baseUrl: preset.baseUrl,
                model: preset.models[0] || '',
                isTested: false,
              },
            },
          }))
        },
        
        getActiveProviderConfig: () => {
          return get().providerConfigs[get().activeProvider]
        },
        
        setIsGenerating: (value, prompt = '') => {
          set({ isGenerating: value, generatingPrompt: prompt })
        },
      }),
      {
        name: 'settings-store',
        partialize: (state) => ({
          activeProvider: state.activeProvider,
          providerConfigs: state.providerConfigs,
        }),
        onRehydrateStorage: () => (state) => {
          // 恢复后调用 _rehydrate 方法合并配置
          if (state && state._rehydrate) {
            state._rehydrate(state)
          }
        },
      }
    ),
    { name: 'SettingsStore' }
  )
)

export default useSettingsStore
