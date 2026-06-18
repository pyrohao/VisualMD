'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Cpu, Eye, EyeOff, Key, Settings, TestTube, XCircle } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { PRESET_PROVIDERS, useSettingsStore, type AIProvider } from '@/stores/settingsStore'
import { createAIService } from '@/lib/ai-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

export function AIPanel() {
  const [mounted, setMounted] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const { getThemeConfig } = useThemeStore()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const {
    activeProvider,
    providerConfigs,
    setActiveProvider,
    updateProviderConfig,
    getDecryptedApiKey,
    setProviderTestStatus,
    applyPresetProvider,
  } = useSettingsStore()
  const currentConfig = providerConfigs[activeProvider]

  useEffect(() => {
    setMounted(true)
  }, [])

  const updateConfig = (key: keyof typeof currentConfig, value: unknown) => {
    updateProviderConfig(activeProvider, { [key]: value })
  }

  const testConnection = async () => {
    const apiKey = getDecryptedApiKey(activeProvider)
    if (!currentConfig.baseUrl || !currentConfig.model || !apiKey) {
      toast({ title: 'AI 配置不完整', variant: 'destructive' })
      return
    }

    setIsTesting(true)
    try {
      const service = createAIService({ ...currentConfig, apiKey })
      const result = await service.testConnection()
      setProviderTestStatus(activeProvider, result.success, result.message)
      toast({ title: result.success ? '连接成功' : '连接失败', description: result.message, variant: result.success ? undefined : 'destructive' })
    } finally {
      setIsTesting(false)
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
          <div className="grid grid-cols-2 gap-2">
            {PRESET_PROVIDERS.map((provider) => {
              const config = providerConfigs[provider.id]
              const active = activeProvider === provider.id
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setActiveProvider(provider.id)}
                  className="rounded-lg border px-3 py-2 text-left text-xs transition-colors"
                  style={{
                    backgroundColor: active ? `${themeConfig.primary}14` : themeConfig.card,
                    borderColor: active ? themeConfig.primary : themeConfig.border,
                    color: active ? themeConfig.primary : themeConfig.text,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{provider.name}</span>
                    {config.isTested ? (
                      <CheckCircle className="h-3.5 w-3.5" style={{ color: themeConfig.success }} />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" style={{ color: themeConfig.textMuted }} />
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div
            className="rounded-lg border p-3 text-xs"
            style={{
              borderColor: currentConfig.isTested ? `${themeConfig.success}55` : themeConfig.border,
              backgroundColor: currentConfig.isTested ? `${themeConfig.success}10` : themeConfig.card,
              color: currentConfig.isTested ? themeConfig.success : themeConfig.textMuted,
            }}
          >
            {currentConfig.isTested ? '当前渠道已测试通过' : '当前渠道尚未测试通过'}
          </div>

          <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: themeConfig.heading }}>
                <Cpu className="h-4 w-4" />
                {currentConfig.name}
              </div>
              <button
                type="button"
                onClick={() => applyPresetProvider(activeProvider)}
                className="text-xs"
                style={{ color: themeConfig.primary }}
              >
                恢复默认
              </button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" style={{ color: themeConfig.textMuted }}>API Base URL</Label>
              <Input
                value={currentConfig.baseUrl}
                onChange={(event) => updateConfig('baseUrl', event.target.value)}
                className="h-9 text-xs"
                style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" style={{ color: themeConfig.textMuted }}>API Key</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={getDecryptedApiKey(activeProvider)}
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
              <Label className="text-xs" style={{ color: themeConfig.textMuted }}>Model</Label>
              <Input
                list="ai-provider-models"
                value={currentConfig.model}
                onChange={(event) => updateConfig('model', event.target.value)}
                className="h-9 text-xs"
                style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
              />
              <datalist id="ai-provider-models">
                {(PRESET_PROVIDERS.find((provider) => provider.id === activeProvider as AIProvider)?.models || []).map((model) => (
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
