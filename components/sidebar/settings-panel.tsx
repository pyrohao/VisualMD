'use client'

/**
 * 设置面板组件
 *
 * 配置AI提供商和API设置
 * - 选择预设提供商
 * - 每个厂商独立配置
 * - 独立测试连接状态
 */

import { useState, useEffect } from 'react'
import { Settings, Key, Globe, Cpu, TestTube, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useSettingsStore, PRESET_PROVIDERS, type AIProvider } from '@/stores/settingsStore'
import { createAIService } from '@/lib/ai-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

export function SettingsPanel() {
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])
  
  const { 
    activeProvider,
    providerConfigs,
    setActiveProvider,
    updateProviderConfig, 
    getDecryptedApiKey,
    setProviderTestStatus,
    applyPresetProvider,
  } = useSettingsStore()
  
  const [showApiKey, setShowApiKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  
  // 获取当前厂商配置
  const currentConfig = providerConfigs[activeProvider]
  
  /**
   * 处理厂商选择
   */
  const handleProviderSelect = (providerId: AIProvider) => {
    setActiveProvider(providerId)
  }
  
  /**
   * 处理配置更新
   */
  const handleConfigChange = (key: keyof typeof currentConfig, value: any) => {
    updateProviderConfig(activeProvider, { [key]: value })
  }
  
  /**
   * 处理API Key更新
   */
  const handleApiKeyChange = (value: string) => {
    updateProviderConfig(activeProvider, { apiKey: value })
  }
  
  /**
   * 测试连接
   */
  const handleTestConnection = async () => {
    const apiKey = getDecryptedApiKey(activeProvider)
    
    if (!currentConfig.baseUrl || !apiKey) {
      toast({
        title: '配置不完整',
        description: '请填写API地址和密钥',
        variant: 'destructive',
      })
      return
    }
    
    setIsTesting(true)
    
    try {
      const service = createAIService({
        ...currentConfig,
        apiKey: apiKey,
      })
      
      const result = await service.testConnection()
      
      // 设置测试状态
      setProviderTestStatus(activeProvider, result.success, result.message)
      
      if (result.success) {
        toast({
          title: '连接成功',
          description: result.message,
        })
      } else {
        toast({
          title: '连接失败',
          description: result.message,
          variant: 'destructive',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '测试失败'
      setProviderTestStatus(activeProvider, false, message)
      toast({
        title: '连接失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setIsTesting(false)
    }
  }
  
  /**
   * 应用预设配置
   */
  const handleApplyPreset = () => {
    applyPresetProvider(activeProvider)
    toast({
      title: '已恢复默认配置',
      description: PRESET_PROVIDERS.find(p => p.id === activeProvider)?.name,
    })
  }
  
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      {/* 头部 */}
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: themeConfig.border }}>
        <Settings className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
        <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
          设置
        </h2>
      </div>
      
      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          
          {/* AI配置区域 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4" style={{ color: themeConfig.primary }} />
              <h3 className="text-sm font-medium" style={{ color: themeConfig.heading }}>
                AI 提供商
              </h3>
            </div>
            
            {/* 厂商选择标签 */}
            <div className="flex flex-wrap gap-2">
              {PRESET_PROVIDERS.map((preset) => {
                const config = providerConfigs[preset.id]
                const isActive = activeProvider === preset.id
                const isConfigured = config.isTested
                
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleProviderSelect(preset.id)}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
                    style={{ 
                      borderColor: isActive ? themeConfig.primary : themeConfig.border,
                      backgroundColor: isActive ? `${themeConfig.primary}15` : themeConfig.card,
                      color: isActive ? themeConfig.primary : themeConfig.text,
                    }}
                  >
                    <span>{preset.name}</span>
                    {isConfigured && (
                      <CheckCircle className="h-3 w-3" style={{ color: themeConfig.success }} />
                    )}
                  </button>
                )
              })}
            </div>
            
            {/* 当前厂商配置状态 */}
            <div 
              className="flex items-center gap-2 rounded-md border p-2.5 text-xs"
              style={{ 
                backgroundColor: currentConfig.isTested ? `${themeConfig.success}10` : `${themeConfig.warning}10`,
                borderColor: currentConfig.isTested ? `${themeConfig.success}30` : `${themeConfig.warning}30`,
                color: currentConfig.isTested ? themeConfig.success : themeConfig.warning,
              }}
            >
              {currentConfig.isTested ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>已配置并测试通过</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  <span>未测试或测试未通过</span>
                </>
              )}
            </div>
            
            {/* API配置表单 */}
            <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: themeConfig.border }}>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium" style={{ color: themeConfig.textMuted }}>
                  {currentConfig.name} 配置
                </Label>
                <button
                  onClick={handleApplyPreset}
                  className="text-xs transition-opacity hover:opacity-70"
                  style={{ color: themeConfig.primary }}
                >
                  恢复默认
                </button>
              </div>
              
              {/* API地址 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" style={{ color: themeConfig.textMuted }} />
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    API地址
                  </Label>
                </div>
                <Input
                  value={currentConfig.baseUrl}
                  onChange={(e) => handleConfigChange('baseUrl', e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="h-9 text-xs"
                  style={{ 
                    backgroundColor: themeConfig.input,
                    borderColor: themeConfig.border,
                    color: themeConfig.text,
                  }}
                />
              </div>
              
              {/* API密钥 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" style={{ color: themeConfig.textMuted }} />
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    API密钥
                  </Label>
                </div>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={getDecryptedApiKey(activeProvider)}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="sk-..."
                    className="h-9 pr-10 text-xs"
                    style={{ 
                      backgroundColor: themeConfig.input,
                      borderColor: themeConfig.border,
                      color: themeConfig.text,
                    }}
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: themeConfig.textMuted }}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs" style={{ color: themeConfig.textMuted }}>
                  密钥将加密存储在本地
                </p>
              </div>
              
              {/* 模型名称 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" style={{ color: themeConfig.textMuted }} />
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    模型名称
                  </Label>
                </div>
                <Input
                  value={currentConfig.model}
                  onChange={(e) => handleConfigChange('model', e.target.value)}
                  placeholder="model-name"
                  className="h-9 text-xs"
                  style={{ 
                    backgroundColor: themeConfig.input,
                    borderColor: themeConfig.border,
                    color: themeConfig.text,
                  }}
                />
              </div>
            </div>
            
            {/* 测试连接 */}
            <Button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="w-full transition-all"
              style={{ 
                backgroundColor: isTesting ? themeConfig.border : themeConfig.primary,
                color: '#fff',
                opacity: isTesting ? 0.7 : 1,
              }}
            >
              {isTesting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  测试中...
                </>
              ) : (
                <>
                  <TestTube className="mr-2 h-4 w-4" />
                  测试连接
                </>
              )}
            </Button>
            

          </div>
          
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
