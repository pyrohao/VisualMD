import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('settings store provider profiles', () => {
  beforeEach(() => {
    vi.resetModules()
    const records = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => records.get(key) || null),
      setItem: vi.fn((key: string, value: string) => {
        records.set(key, value)
      }),
      removeItem: vi.fn((key: string) => {
        records.delete(key)
      }),
      clear: vi.fn(() => records.clear()),
    })
  })

  it('adds arbitrary OpenAI and Anthropic compatible providers', async () => {
    const { useSettingsStore } = await import('@/stores/settingsStore')
    const store = useSettingsStore.getState()

    const openaiId = store.addCustomProvider('openai-compatible')
    store.updateProviderConfig(openaiId, {
      name: 'Private Gateway',
      baseUrl: 'https://llm.example.test/v1',
      apiKey: 'secret',
      model: 'private-model',
    })

    const anthropicId = useSettingsStore.getState().addCustomProvider('anthropic-compatible')
    const anthropic = useSettingsStore.getState().providers.find((provider) => provider.id === anthropicId)

    const openai = useSettingsStore.getState().providers.find((provider) => provider.id === openaiId)
    expect(openai).toMatchObject({
      name: 'Private Gateway',
      protocol: 'openai-compatible',
      baseUrl: 'https://llm.example.test/v1',
      model: 'private-model',
      authType: 'bearer',
      openAIEndpoint: 'auto',
    })
    expect(useSettingsStore.getState().getDecryptedApiKey(openaiId)).toBe('secret')
    expect(anthropic).toMatchObject({
      protocol: 'anthropic-compatible',
      authType: 'x-api-key',
      modelDiscovery: { type: 'anthropic-models', path: '/models' },
    })
  })

  it('resets OpenAI-compatible providers to automatic endpoint detection', async () => {
    const { useSettingsStore } = await import('@/stores/settingsStore')
    const providerId = useSettingsStore.getState().addCustomProvider('openai-compatible')

    useSettingsStore.getState().updateProviderConfig(providerId, { openAIEndpoint: 'responses' })
    useSettingsStore.getState().updateProviderConfig(providerId, { protocol: 'anthropic-compatible' })
    useSettingsStore.getState().updateProviderConfig(providerId, { protocol: 'openai-compatible' })

    const provider = useSettingsStore.getState().providers.find((item) => item.id === providerId)
    expect(provider?.openAIEndpoint).toBe('auto')
  })

  it('keeps model lists dynamic per provider', async () => {
    const { useSettingsStore } = await import('@/stores/settingsStore')
    const providerId = useSettingsStore.getState().addCustomProvider('openai-compatible')

    useSettingsStore.getState().updateProviderModels(providerId, ['model-a', 'model-a', 'model-b'], 'model-b')
    const provider = useSettingsStore.getState().providers.find((item) => item.id === providerId)

    expect(provider?.models).toEqual(['model-a', 'model-b'])
    expect(provider?.model).toBe('model-b')
  })

  it('allows required provider fields to be cleared while editing', async () => {
    const { useSettingsStore } = await import('@/stores/settingsStore')
    const providerId = useSettingsStore.getState().addCustomProvider('openai-compatible')

    useSettingsStore.getState().updateProviderConfig(providerId, {
      name: '',
      baseUrl: '',
    })
    const provider = useSettingsStore.getState().providers.find((item) => item.id === providerId)

    expect(provider?.name).toBe('')
    expect(provider?.baseUrl).toBe('')
  })

  it('keeps successful preset provider configs independent when switching channels', async () => {
    const { useSettingsStore } = await import('@/stores/settingsStore')
    const store = useSettingsStore.getState()

    const openaiId = store.selectOrCreatePresetProvider('openai')
    store.updateProviderConfig(openaiId, {
      apiKey: 'openai-secret',
      model: 'gpt-4.1',
    })
    store.setProviderTestStatus(openaiId, true, 'ok')

    const siliconflowId = useSettingsStore.getState().selectOrCreatePresetProvider('siliconflow')
    useSettingsStore.getState().updateProviderConfig(siliconflowId, {
      apiKey: 'sf-secret',
      model: 'deepseek-ai/DeepSeek-V3',
    })

    const nextOpenaiId = useSettingsStore.getState().selectOrCreatePresetProvider('openai')
    const providers = useSettingsStore.getState().providers
    const openai = providers.find((provider) => provider.id === openaiId)
    const siliconflow = providers.find((provider) => provider.id === siliconflowId)

    expect(nextOpenaiId).toBe(openaiId)
    expect(openai).toMatchObject({
      templateId: 'openai',
      isTested: true,
      model: 'gpt-4.1',
    })
    expect(siliconflow).toMatchObject({
      templateId: 'siliconflow',
      model: 'deepseek-ai/DeepSeek-V3',
    })
    expect(useSettingsStore.getState().getDecryptedApiKey(openaiId)).toBe('openai-secret')
    expect(useSettingsStore.getState().getDecryptedApiKey(siliconflowId)).toBe('sf-secret')
  })
})
