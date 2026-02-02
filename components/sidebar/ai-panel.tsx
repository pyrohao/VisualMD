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
import { useThemeStore } from '@/stores/themeStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { createAIService } from '@/lib/ai-service'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

export function AIPanel() {
  const [prompt, setPrompt] = useState('')
  
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  
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
        title: '请输入内容描述',
        description: '请描述您想要生成的文档内容',
        variant: 'destructive',
      })
      return
    }
    
    if (!isConfigValid) {
      toast({
        title: 'AI配置无效',
        description: '请先在设置中配置并测试API',
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
        throw new Error(result.error || '生成失败')
      }
      
      // 保存到文件系统
      importFile(result.fileName, result.content, null)
      
      // 清空输入
      setPrompt('')
      
      // 提示成功
      toast({
        title: '文档生成成功',
        description: `已保存为: ${result.fileName}`,
      })
    } catch (error) {
      console.error('AI生成失败:', error)
      toast({
        title: '生成失败',
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
          AI 文档生成
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
                {currentConfig.name}
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
              配置
            </button>
          </div>
          <p 
            className="mt-1.5 text-xs"
            style={{ color: isConfigValid ? themeConfig.success : themeConfig.error }}
          >
            {isConfigValid 
              ? `已配置并测试通过 · 模型: ${currentConfig.model}` 
              : '未配置或测试未通过，请先配置API'
            }
          </p>
        </div>
        
        {/* 输入区域 - 使用绝对定位确保不挤压其他元素 */}
        <div className="flex-1 flex flex-col gap-2 min-h-0 relative">
          <label 
            className="text-xs font-medium flex-shrink-0"
            style={{ color: themeConfig.textMuted }}
          >
            描述您想要的文档内容
          </label>
          <div className="flex-1 relative min-h-0">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="例如：生成一份关于React Hooks的技术文档，包含useState、useEffect和useContext的使用说明和示例代码..."
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
            按 Ctrl+Enter 快速发送
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
              生成中...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              生成文档
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
            <p>正在生成文档，请稍候...</p>
            <p className="mt-1">您可以切换到其他面板继续工作</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default AIPanel
