'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Cpu, Eye, EyeOff, Key, Plus, RefreshCw, Settings, TestTube, Trash2, XCircle } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { PROVIDER_TEMPLATES, useSettingsStore, type AIProviderProtocol } from '@/stores/settingsStore'
import { createAIService } from '@/lib/ai-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

export function AIPanel() {
  const [mounted, setMounted] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isRefreshingModels, setIsRefreshingModels] = useState(false)
  const [isCustomChannel, setIsCustomChannel] = useState(false)
  const [customPreviousProviderId, setCustomPreviousProviderId] = useState<string | null>(null)
  const { getThemeConfig } = useThemeStore()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const {
    activeProviderId,
    providers,
    setActiveProvider,
    addCustomProvider,
    removeProvider,
    updateProviderConfig,
    updateProviderModels,
    getDecryptedApiKey,
    setProviderTestStatus,
    applyPresetProvider,
  } = useSettingsStore()
  const currentConfig = providers.find((provider) => provider.id === activeProviderId) || providers[0]
  const connectedProviders = providers.filter((provider) => provider.isTested)
  const presetTemplates = PROVIDER_TEMPLATES.filter((template) => !template.id.startsWith('custom-'))
  const selectedTemplate = presetTemplates.find((template) =>
    template.name === currentConfig.name &&
    template.baseUrl === currentConfig.baseUrl &&
    template.protocol === currentConfig.protocol
  )
  const isSavedCustomProvider = !selectedTemplate && !isCustomChannel

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!currentConfig) {
    return null
  }

  const updateConfig = (key: keyof typeof currentConfig, value: unknown) => {
    updateProviderConfig(currentConfig.id, { [key]: value })
  }

  const selectTemplate = (templateId: string) => {
    applyPresetProvider(currentConfig.id, templateId)
    setIsCustomChannel(false)
    setCustomPreviousProviderId(null)
  }

  const createCustomChannel = () => {
    setCustomPreviousProviderId(currentConfig.id)
    const providerId = addCustomProvider('openai-compatible')
    setActiveProvider(providerId)
    updateProviderConfig(providerId, { name: '自定义 OpenAI' })
    setIsCustomChannel(true)
  }

  const saveCustomChannel = (showToast = true) => {
    setIsCustomChannel(false)
    setCustomPreviousProviderId(null)
    if (showToast) {
      toast({ title: '自定义渠道已保存' })
    }
  }

  const cancelCustomChannel = () => {
    const fallbackProviderId = customPreviousProviderId && providers.some((provider) => provider.id === customPreviousProviderId)
      ? customPreviousProviderId
      : providers.find((provider) => provider.id !== currentConfig.id)?.id || null

    removeProvider(currentConfig.id)
    if (fallbackProviderId) {
      setActiveProvider(fallbackProviderId)
    }
    setIsCustomChannel(false)
    setCustomPreviousProviderId(null)
  }

  const updateProtocol = (protocol: AIProviderProtocol) => {
    updateProviderConfig(currentConfig.id, {
      protocol,
      authType: protocol === 'anthropic-compatible' ? 'x-api-key' : 'bearer',
      openAIEndpoint: protocol === 'openai-compatible' ? 'auto' : currentConfig.openAIEndpoint,
      modelDiscovery: {
        type: protocol === 'anthropic-compatible' ? 'anthropic-models' : 'openai-models',
        path: '/models',
      },
    })
  }

  const getRuntimeConfig = () => ({
    ...currentConfig,
    apiKey: getDecryptedApiKey(currentConfig.id),
  })

  const testConnection = async () => {
    const apiKey = getDecryptedApiKey(currentConfig.id)
    if (!currentConfig.baseUrl || !currentConfig.model || !apiKey) {
      toast({ title: 'AI 配置不完整', variant: 'destructive' })
      return
    }

    setIsTesting(true)
    try {
      const result = await createAIService(getRuntimeConfig()).testConnection()
      updateProviderConfig(currentConfig.id, result.endpoint === 'responses' || result.endpoint === 'chat-completions'
        ? { openAIEndpoint: result.endpoint }
        : {})
      setProviderTestStatus(currentConfig.id, result.success, result.message)
      if (result.success && isCustomChannel) {
        saveCustomChannel(false)
      }
      toast({
        title: result.success ? '连接成功' : '连接失败',
        description: result.success && isCustomChannel
          ? '连接成功，已自动保存自定义渠道。'
          : result.message,
        variant: result.success ? undefined : 'destructive',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const refreshModels = async () => {
    const apiKey = getDecryptedApiKey(currentConfig.id)
    if (!currentConfig.baseUrl || !apiKey) {
      toast({ title: '请先填写 API 地址和密钥', variant: 'destructive' })
      return
    }

    setIsRefreshingModels(true)
    try {
      const models = await createAIService(getRuntimeConfig()).listModels()
      updateProviderModels(currentConfig.id, models.map((model) => model.id))
      toast({ title: `已刷新 ${models.length} 个模型` })
    } catch (error) {
      toast({
        title: '模型列表刷新失败',
        description: error instanceof Error ? error.message : '请手动填写模型名称',
        variant: 'destructive',
      })
    } finally {
      setIsRefreshingModels(false)
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: themeConfig.border }}>
        <Settings className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
        <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
          AI 配置
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div
            className="rounded-lg border p-3 text-xs"
            style={{
              borderColor: connectedProviders.length ? `${themeConfig.success}55` : themeConfig.border,
              backgroundColor: connectedProviders.length ? `${themeConfig.success}10` : themeConfig.card,
              color: connectedProviders.length ? themeConfig.success : themeConfig.textMuted,
            }}
          >
            <div className="flex items-center gap-2">
              {connectedProviders.length ? (
                <CheckCircle className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              <span>{connectedProviders.length ? `已连接 ${connectedProviders.length} 个渠道` : '暂无已连接渠道'}</span>
            </div>
            {!!connectedProviders.length && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {connectedProviders.map((provider) => (
                  <span
                    key={provider.id}
                    className="max-w-full truncate rounded border px-2 py-1 text-[11px]"
                    style={{ borderColor: `${themeConfig.success}40`, color: themeConfig.success }}
                  >
                    {provider.name} · {provider.model || '未选择模型'}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}>
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium" style={{ color: themeConfig.heading }}>
                <Cpu className="h-4 w-4 shrink-0" />
                <span className="truncate">连接参数</span>
              </div>
              {isSavedCustomProvider && (
                <button
                  type="button"
                  onClick={() => removeProvider(currentConfig.id)}
                  disabled={providers.length <= 1}
                  className="rounded-md p-1 disabled:opacity-40"
                  title="删除渠道"
                  style={{ color: themeConfig.textMuted }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            {!isCustomChannel && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" style={{ color: themeConfig.textMuted }}>选择连接渠道</Label>
                  <button
                    type="button"
                    onClick={createCustomChannel}
                    className="rounded-md border p-1.5"
                    title="自定义渠道"
                    style={{ borderColor: themeConfig.border, color: themeConfig.text }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <select
                  value={selectedTemplate?.id || ''}
                  onChange={(event) => {
                    if (!event.target.value) return
                    selectTemplate(event.target.value)
                  }}
                  className="h-9 w-full rounded-md border px-2 text-xs outline-none"
                  style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                >
                  <option value="">选择预设渠道...</option>
                  {presetTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isCustomChannel && (
              <div className="space-y-1.5">
                <Label className="text-xs" style={{ color: themeConfig.textMuted }}>
                  渠道名称 <span style={{ color: themeConfig.error }}>*</span>
                </Label>
                <Input
                  value={currentConfig.name}
                  onChange={(event) => updateConfig('name', event.target.value)}
                  className="h-9 text-xs"
                  style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs" style={{ color: themeConfig.textMuted }}>接口类型</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateProtocol('openai-compatible')}
                  className="rounded-md border px-2 py-2 text-xs"
                  style={{
                    borderColor: currentConfig.protocol === 'openai-compatible' ? themeConfig.primary : themeConfig.border,
                    color: currentConfig.protocol === 'openai-compatible' ? themeConfig.primary : themeConfig.text,
                    backgroundColor: currentConfig.protocol === 'openai-compatible' ? `${themeConfig.primary}12` : themeConfig.input,
                  }}
                >
                  OpenAI
                </button>
                <button
                  type="button"
                  onClick={() => updateProtocol('anthropic-compatible')}
                  className="rounded-md border px-2 py-2 text-xs"
                  style={{
                    borderColor: currentConfig.protocol === 'anthropic-compatible' ? themeConfig.primary : themeConfig.border,
                    color: currentConfig.protocol === 'anthropic-compatible' ? themeConfig.primary : themeConfig.text,
                    backgroundColor: currentConfig.protocol === 'anthropic-compatible' ? `${themeConfig.primary}12` : themeConfig.input,
                  }}
                >
                  Anthropic
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" style={{ color: themeConfig.textMuted }}>
                API Base URL <span style={{ color: themeConfig.error }}>*</span>
              </Label>
              <Input
                value={currentConfig.baseUrl}
                onChange={(event) => updateConfig('baseUrl', event.target.value)}
                className="h-9 text-xs"
                style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" style={{ color: themeConfig.textMuted }}>
                API Key <span style={{ color: themeConfig.error }}>*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={getDecryptedApiKey(currentConfig.id)}
                  onChange={(event) => updateConfig('apiKey', event.target.value)}
                  className="h-9 pr-10 text-xs"
                  style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: themeConfig.textMuted }}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs" style={{ color: themeConfig.textMuted }}>
                  Model <span style={{ color: themeConfig.error }}>*</span>
                </Label>
                <button
                  type="button"
                  onClick={refreshModels}
                  disabled={isRefreshingModels}
                  className="flex items-center gap-1 text-xs disabled:opacity-50"
                  style={{ color: themeConfig.primary }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingModels ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </div>
              <Input
                list="ai-provider-models"
                value={currentConfig.model}
                onChange={(event) => updateConfig('model', event.target.value)}
                className="h-9 text-xs"
                style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
              />
              <datalist id="ai-provider-models">
                {currentConfig.models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" style={{ color: themeConfig.textMuted }}>Temperature</Label>
                <Input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={currentConfig.temperature}
                  onChange={(event) => updateConfig('temperature', Number(event.target.value))}
                  className="h-9 text-xs"
                  style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" style={{ color: themeConfig.textMuted }}>Max Tokens</Label>
                <Input
                  type="number"
                  min="256"
                  max="200000"
                  step="1024"
                  value={currentConfig.maxTokens}
                  onChange={(event) => updateConfig('maxTokens', Number(event.target.value))}
                  className="h-9 text-xs"
                  style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={testConnection}
              disabled={isTesting}
              className="w-full"
              style={{ backgroundColor: isTesting ? themeConfig.border : themeConfig.primary, color: themeConfig.buttonText }}
            >
              {isTesting ? (
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <TestTube className="mr-2 h-4 w-4" />
              )}
              测试连接
            </Button>

            {isCustomChannel && (
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full"
                onClick={cancelCustomChannel}
                style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border, color: themeConfig.text }}
              >
                取消
              </Button>
            )}

            <div className="flex items-center gap-2 text-xs" style={{ color: themeConfig.textMuted }}>
              <Key className="h-3.5 w-3.5" />
              密钥仅加密保存在本地浏览器。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIPanel
