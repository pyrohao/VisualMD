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
import { Settings, Key, Globe, Cpu, TestTube, AlertCircle, CheckCircle, Eye, EyeOff, GitBranch, FolderGit2 } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useSettingsStore, PRESET_PROVIDERS, type AIProvider } from '@/stores/settingsStore'
import { useTranslation } from '@/stores/languageStore'
import { useGitStore } from '@/stores/gitStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { createAIService } from '@/lib/ai-service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

export function SettingsPanel() {
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { t } = useTranslation()
  const [showGitToken, setShowGitToken] = useState(false)
  const { setActivePanel } = useSidebarStore()

  useEffect(() => {
    setMounted(true)
  }, [])

  // 获取翻译后的提供商名称
  const getProviderDisplayName = (presetId: string, presetName: string) => {
    if (!mounted) return presetName
    const names: Record<string, string> = {
      'openai': 'OpenAI',
      'volcengine': t('settings.volcengine') || '火山引擎',
      'siliconflow': t('settings.siliconflow') || '硅基流动',
      'zhipu': t('settings.zhipu') || '智谱AI',
      'qianwen': t('settings.qianwen') || '通义千问',
      'openrouter': 'OpenRouter',
      'custom': t('settings.custom') || '自定义',
    }
    return names[presetId] || presetName
  }
  
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

  const {
    config: gitConfig,
    connected: gitConnected,
    isConnecting: isGitConnecting,
    branches: gitBranches,
    repos: gitRepos,
    setConfig: setGitConfig,
    getDecryptedToken,
    validateAndLoad: validateGitAndLoad,
    loadRepos: loadGitRepos,
  } = useGitStore()
  
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
        title: t('settings.configIncomplete'),
        description: t('settings.enterApiInfo'),
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
          title: t('settings.connectionSuccess'),
        })
      } else {
        toast({
          title: t('settings.connectionFailed'),
          variant: 'destructive',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings.connectionFailed')
      setProviderTestStatus(activeProvider, false, message)
      toast({
        title: t('settings.connectionFailed'),
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
      title: t('settings.restored'),
      description: PRESET_PROVIDERS.find(p => p.id === activeProvider)?.name,
    })
  }

  const handleGitConnect = async () => {
    try {
      await validateGitAndLoad()
      toast({ title: t('git.connected') })
    } catch {
      // git store handles error state/toast elsewhere
    }
  }

  const handleGitLoadRepos = async () => {
    await loadGitRepos()
    toast({ title: t('git.reposLoaded') })
  }
  
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      {/* 头部 */}
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: themeConfig.border }}>
        <Settings className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
        <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
          {mounted ? t('settings.title') : '设置'}
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
                {mounted ? t('settings.aiProvider') : 'AI 提供商'}
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
                    <span>{getProviderDisplayName(preset.id, preset.name)}</span>
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
                  <span>{mounted ? t('settings.configured') : '已配置并测试通过'}</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  <span>{mounted ? t('settings.notTested') : '未测试或测试未通过'}</span>
                </>
              )}
            </div>
            
            {/* API配置表单 */}
            <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: themeConfig.border }}>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium" style={{ color: themeConfig.textMuted }}>
                  {getProviderDisplayName(activeProvider, currentConfig.name)} {mounted ? t('common.config') : '配置'}
                </Label>
                <button
                  onClick={handleApplyPreset}
                  className="text-xs transition-opacity hover:opacity-70"
                  style={{ color: themeConfig.primary }}
                >
                  {mounted ? t('settings.restoreDefault') : '恢复默认'}
                </button>
              </div>
              
              {/* API地址 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" style={{ color: themeConfig.textMuted }} />
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {mounted ? t('settings.apiAddress') : 'API地址'}
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
                    {mounted ? t('settings.apiKey') : 'API密钥'}
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
                  {mounted ? t('settings.keyStoredLocally') : '密钥将加密存储在本地'}
                </p>
              </div>
              
              {/* 模型名称 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" style={{ color: themeConfig.textMuted }} />
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {mounted ? t('settings.modelName') : '模型名称'}
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
                  {mounted ? t('settings.testing') : '测试中...'}
                </>
              ) : (
                <>
                  <TestTube className="mr-2 h-4 w-4" />
                  {mounted ? t('settings.testConnection') : '测试连接'}
                </>
              )}
            </Button>
            

          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" style={{ color: themeConfig.primary }} />
              <h3 className="text-sm font-medium" style={{ color: themeConfig.heading }}>
                {t('settings.gitIntegration')}
              </h3>
            </div>

            <div
              className="flex items-center justify-between rounded-md border p-2.5 text-xs"
              style={{
                backgroundColor: gitConnected ? `${themeConfig.success}10` : `${themeConfig.warning}10`,
                borderColor: gitConnected ? `${themeConfig.success}30` : `${themeConfig.warning}30`,
              }}
            >
              <div className="flex items-center gap-2">
                {gitConnected ? (
                  <CheckCircle className="h-4 w-4" style={{ color: themeConfig.success }} />
                ) : (
                  <AlertCircle className="h-4 w-4" style={{ color: themeConfig.warning }} />
                )}
                <span style={{ color: gitConnected ? themeConfig.success : themeConfig.warning }}>
                  {gitConnected ? t('settings.gitConfigured') : t('settings.gitNotConfigured')}
                </span>
              </div>
              <button
                onClick={() => setActivePanel('git')}
                className="rounded-md px-2 py-1 text-[11px] transition-opacity hover:opacity-80"
                style={{ color: themeConfig.primary, backgroundColor: `${themeConfig.primary}10` }}
              >
                {t('settings.openGitPanel')}
              </button>
            </div>

            <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: themeConfig.border }}>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium" style={{ color: themeConfig.textMuted }}>
                  {t('settings.gitConnection')}
                </Label>
                {gitBranches.length > 0 && (
                  <span className="text-[11px]" style={{ color: themeConfig.textMuted }}>
                    {t('git.availableBranches')}: {gitBranches.map((branch) => branch.name).join(', ')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {t('git.provider')}
                  </Label>
                  <select
                    value={gitConfig.provider}
                    onChange={(e) => setGitConfig({ provider: e.target.value as typeof gitConfig.provider })}
                    className="h-9 w-full rounded-md border px-2 text-xs"
                    style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                  >
                    <option value="github">GitHub</option>
                    <option value="gitlab">GitLab</option>
                    <option value="gitee">Gitee</option>
                    <option value="custom">{t('settings.custom')}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {t('git.branch')}
                  </Label>
                  <Input
                    value={gitConfig.branch}
                    onChange={(e) => setGitConfig({ branch: e.target.value })}
                    placeholder="main"
                    className="h-9 text-xs"
                    style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                  />
                </div>
              </div>

              {gitConfig.provider === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs" style={{ color: themeConfig.text }}>
                      {t('git.baseUrl')}
                    </Label>
                    <Input
                      value={gitConfig.baseUrl || ''}
                      onChange={(e) => setGitConfig({ baseUrl: e.target.value })}
                      placeholder="https://git.example.com/api/v4"
                      className="h-9 text-xs"
                      style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" style={{ color: themeConfig.text }}>
                      {t('git.customFlavor')}
                    </Label>
                    <select
                      value={gitConfig.customFlavor || 'gitlab'}
                      onChange={(e) => setGitConfig({ customFlavor: e.target.value as 'gitlab' | 'gitea' })}
                      className="h-9 w-full rounded-md border px-2 text-xs"
                      style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                    >
                      <option value="gitlab">GitLab API</option>
                      <option value="gitea">Gitea API</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" style={{ color: themeConfig.textMuted }} />
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {t('git.token')}
                  </Label>
                </div>
                <div className="relative">
                  <Input
                    type={showGitToken ? 'text' : 'password'}
                    value={getDecryptedToken()}
                    onChange={(e) => setGitConfig({ token: e.target.value })}
                    placeholder={t('git.tokenPlaceholder')}
                    className="h-9 pr-10 text-xs"
                    style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                  />
                  <button
                    onClick={() => setShowGitToken(!showGitToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: themeConfig.textMuted }}
                  >
                    {showGitToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {t('git.namespace')}
                  </Label>
                  <Input
                    value={gitConfig.ownerOrNamespace}
                    onChange={(e) => setGitConfig({ ownerOrNamespace: e.target.value })}
                    placeholder="owner / group"
                    className="h-9 text-xs"
                    style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {t('git.repository')}
                  </Label>
                  <Input
                    list="git-settings-repo-options"
                    value={gitConfig.repo}
                    onChange={(e) => setGitConfig({ repo: e.target.value })}
                    placeholder="repo"
                    className="h-9 text-xs"
                    style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                  />
                  <datalist id="git-settings-repo-options">
                    {gitRepos.map((repo) => (
                      <option key={repo.id} value={repo.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  onClick={handleGitConnect}
                  disabled={isGitConnecting}
                  className="w-full min-w-0"
                  style={{
                    backgroundColor: themeConfig.primary,
                    color: themeConfig.buttonText || '#fff',
                  }}
                >
                  {isGitConnecting ? (
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <FolderGit2 className="mr-2 h-4 w-4" />
                  )}
                  {gitConnected ? t('git.reconnect') : t('git.connect')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGitLoadRepos}
                  disabled={isGitConnecting}
                  className="w-full min-w-0"
                  style={{
                    borderColor: themeConfig.border,
                    color: isGitConnecting ? themeConfig.muted : themeConfig.text,
                    backgroundColor: themeConfig.card,
                  }}
                >
                  {t('git.loadRepos')}
                </Button>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
