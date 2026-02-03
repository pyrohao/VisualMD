'use client'

/**
 * 帮助面板组件
 *
 * 显示项目信息和帮助内容
 */

import { HelpCircle, Info, BookOpen, Github } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useState, useEffect } from 'react'

export function HelpPanel() {
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      {/* 头部 */}
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: themeConfig.border }}>
        <HelpCircle className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
        <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
          帮助
        </h2>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* 项目名称 */}
        <div className="mb-6 text-center">
          <h1 
            className="text-2xl font-bold mb-2"
            style={{ color: themeConfig.primary }}
          >
            Visual MD
          </h1>
          <p className="text-sm" style={{ color: themeConfig.textMuted }}>
            现代化的 Markdown 编辑器
          </p>
        </div>

        {/* 关于项目 */}
        <div 
          className="rounded-lg border p-4 mb-4"
          style={{ 
            borderColor: themeConfig.border,
            backgroundColor: themeConfig.card,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Info className="h-4 w-4" style={{ color: themeConfig.primary }} />
            <h3 className="text-sm font-medium" style={{ color: themeConfig.heading }}>
              关于
            </h3>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: themeConfig.text }}>
            Visual MD 是一款专为开发者和技术写作者设计的 Markdown 编辑器。
            支持实时预览、AI 文档生成、模板管理等功能。
          </p>
        </div>

        {/* 快捷操作 */}
        <div 
          className="rounded-lg border p-4 mb-4"
          style={{ 
            borderColor: themeConfig.border,
            backgroundColor: themeConfig.card,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4" style={{ color: themeConfig.primary }} />
            <h3 className="text-sm font-medium" style={{ color: themeConfig.heading }}>
              快捷键
            </h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span style={{ color: themeConfig.textMuted }}>打开文件</span>
              <span style={{ color: themeConfig.text }}>Ctrl+O</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: themeConfig.textMuted }}>保存文件</span>
              <span style={{ color: themeConfig.text }}>Ctrl+S</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: themeConfig.textMuted }}>搜索</span>
              <span style={{ color: themeConfig.text }}>Ctrl+F</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: themeConfig.textMuted }}>切换侧边栏</span>
              <span style={{ color: themeConfig.text }}>Ctrl+B</span>
            </div>
          </div>
        </div>

        {/* 版本信息 */}
        <div 
          className="rounded-lg border p-4"
          style={{ 
            borderColor: themeConfig.border,
            backgroundColor: themeConfig.card,
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Github className="h-4 w-4" style={{ color: themeConfig.primary }} />
            <h3 className="text-sm font-medium" style={{ color: themeConfig.heading }}>
              版本
            </h3>
          </div>
          <p className="text-xs" style={{ color: themeConfig.textMuted }}>
            版本: 1.0.0
          </p>
        </div>
      </div>
    </div>
  )
}

export default HelpPanel
