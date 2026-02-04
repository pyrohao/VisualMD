'use client'

/**
 * AI生成面板组件
 *
 * 提供AI文档生成功能
 * - 用户输入描述
 * - 发送到AI生成Markdown
 * - 自动保存到文件系统
 * - 显示当前厂商配置状态
 */

import { useState, useEffect } from 'react'
import { Sparkles, Send, Loader2, AlertCircle, CheckCircle, Settings } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useTranslation } from '@/stores/languageStore'
import { createAIService } from '@/lib/ai-service'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

export function AIPanel() {
  const [prompt, setPrompt] = useState('')
  const [mounted, setMounted] = useState(false)
  
  const { getThemeConfig } = useThemeStore()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { t } = useTranslation()

  useEffect(() => {
    setMounted(true)
  }, [])

  // 获取翻译后的提供商名称
  const getProviderDisplayName = (providerId: string, defaultName: string) => {
    const names: Record<string, string> = {
      'openai': 'OpenAI',
      'volcengine': t('settings.volcengine') || '火山引擎',
      'siliconflow': t('settings.siliconflow') || '硅基流动',
      'zhipu': t('settings.zhipu') || '智谱AI',
      'qianwen': t('settings.qianwen') || '通义千问',
      'openrouter': 'OpenRouter',
      'custom': t('settings.custom') || '自定义',
    }
    return names[providerId] || defaultName
  }

  const {
    activeProvider,
    providerConfigs,
    getActiveProviderApiKey,
    validateActiveProvider,
    isGenerating,
    generatingPrompt,
    setIsGenerating,
    setActiveProvider: setStoreActiveProvider,
  } = useSettingsStore()
  
  const { importFile } = useFileSystemStore()
  
  // 获取当前厂商配置
  const currentConfig = providerConfigs[activeProvider]
  const isConfigValid = validateActiveProvider()
  
  // 同步全局生成状态到本地输入框
  useEffect(() => {
    if (generatingPrompt) {
      setPrompt(generatingPrompt)
    }
  }, [generatingPrompt])
  
  /**
   * 处理生成请求
   */
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: t('common.enterDescription'),
        description: t('common.describeContent'),
        variant: 'destructive',
      })
      return
    }
    
    if (!isConfigValid) {
      toast({
        title: t('common.aiConfigInvalid'),
        description: t('common.configureApiFirst'),
        variant: 'destructive',
      })
      return
    }
    
    setIsGenerating(true, prompt.trim())
    
    try {
      // 创建AI服务实例
      const service = createAIService({
        ...currentConfig,
        apiKey: getActiveProviderApiKey(),
      })
      
      // 调用AI生成
      const result = await service.generateMarkdown({
        prompt: prompt.trim(),
      })
      
      if (!result.success) {
        throw new Error(result.error || t('toast.generateFailed'))
      }
      
      // 保存到文件系统
      importFile(result.fileName, result.content, null)
      
      // 清空输入
      setPrompt('')
      
      // 提示成功
      toast({
        title: t('toast.generateSuccess'),
        description: `已保存为: ${result.fileName}`,
      })
    } catch (error) {
      console.error('AI生成失败:', error)
      toast({
        title: t('toast.generateFailed'),
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false, '')
    }
  }
  
  /**
   * 处理快捷键
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleGenerate()
    }
  }
  
  /**
   * 跳转到设置面板
   */
  const handleGoToSettings = () => {
    // 使用 sidebar store 切换到设置面板
    const { useSidebarStore } = require('@/stores/sidebarStore')
    useSidebarStore.getState().setActivePanel('settings')
  }
  
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      {/* 头部 */}
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: themeConfig.border }}>
        <Sparkles className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
        <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
          {t('sidebar.aiGenerate')}
        </h2>
      </div>
      
      {/* 内容区域 */}
      <div className="flex flex-1 flex-col gap-4 p-4 overflow-hidden">
        {/* 当前厂商配置状态 */}
        <div 
          className="rounded-lg border p-3 flex-shrink-0"
          style={{ 
            backgroundColor: isConfigValid ? `${themeConfig.success}10` : `${themeConfig.error}10`,
            borderColor: isConfigValid ? `${themeConfig.success}30` : `${themeConfig.error}30`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isConfigValid ? (
                <CheckCircle className="h-4 w-4" style={{ color: themeConfig.success }} />
              ) : (
                <AlertCircle className="h-4 w-4" style={{ color: themeConfig.error }} />
              )}
              <span
                className="text-xs font-medium"
                style={{ color: isConfigValid ? themeConfig.success : themeConfig.error }}
              >
                {mounted ? getProviderDisplayName(activeProvider, currentConfig.name) : currentConfig.name}
              </span>
            </div>
            <button
              onClick={handleGoToSettings}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover:opacity-80"
              style={{ 
                backgroundColor: themeConfig.card,
                color: themeConfig.textMuted,
              }}
            >
              <Settings className="h-3 w-3" />
              {t('sidebar.config')}
            </button>
          </div>
          <p 
            className="mt-1.5 text-xs"
            style={{ color: isConfigValid ? themeConfig.success : themeConfig.error }}
          >
            {isConfigValid 
              ? `${t('sidebar.configured')} · ${t('common.model')}: ${currentConfig.model}` 
              : t('sidebar.notConfigured')
            }
          </p>
        </div>
        
        {/* 输入区域 - 使用绝对定位确保不挤压其他元素 */}
        <div className="flex-1 flex flex-col gap-2 min-h-0 relative">
          <label 
            className="text-xs font-medium flex-shrink-0"
            style={{ color: themeConfig.textMuted }}
          >
            {t('sidebar.enterDescription')}
          </label>
          <div className="flex-1 relative min-h-0">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mounted ? t('sidebar.aiPlaceholder') : '例如：生成一份关于React Hooks的技术文档，包含useState、useEffect和useContext的使用说明和示例代码...'}
              disabled={isGenerating}
              className="resize-none border text-sm overflow-y-auto absolute inset-0"
              style={{ 
                backgroundColor: themeConfig.input,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
            />
          </div>
          <p className="text-xs flex-shrink-0" style={{ color: themeConfig.textMuted }}>
            {t('sidebar.quickSend')}
          </p>
        </div>
        
        {/* 发送按钮 */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim() || !isConfigValid}
          className="w-full transition-all"
          style={{ 
            backgroundColor: isGenerating || !isConfigValid ? themeConfig.border : themeConfig.primary,
            color: '#fff',
            opacity: isGenerating || !isConfigValid ? 0.7 : 1,
          }}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('sidebar.generating')}
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              {t('common.generate')}
            </>
          )}
        </Button>
        
        {/* 生成中提示 */}
        {isGenerating && (
          <div 
            className="rounded-md border p-3 text-center text-xs"
            style={{ 
              backgroundColor: themeConfig.card,
              borderColor: themeConfig.border,
              color: themeConfig.textMuted,
            }}
          >
            <p>{t('common.generatingDoc')}</p>
            <p className="mt-1">{t('common.switchPanel')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIPanel
