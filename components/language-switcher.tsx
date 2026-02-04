'use client'

/**
 * 语言切换组件
 * 可以放在设置面板或工具栏中
 */

import { useTranslation } from '@/stores/languageStore'
import { useThemeStore } from '@/stores/themeStore'
import { Button } from './ui/button'
import { Globe } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { useEffect, useState } from 'react'

export function LanguageSwitcher() {
  const { currentLanguage, setLanguage, t } = useTranslation()
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const themeConfig = getThemeConfig()

  // 避免 hydration 不匹配，在客户端挂载前使用默认样式
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 transition-all duration-200 hover:shadow-sm"
        style={{
          color: '#24292f',
          backgroundColor: '#0969da15',
          border: '1px solid #d0d7de',
        }}
      >
        <Globe className="w-4 h-4" style={{ color: '#0969da' }} />
        <span>中文</span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 transition-all duration-200 hover:shadow-sm"
          style={{
            color: themeConfig.text,
            backgroundColor: `${themeConfig.accent}15`,
            border: `1px solid ${themeConfig.border}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = `${themeConfig.accent}25`
            e.currentTarget.style.borderColor = themeConfig.accent
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = `${themeConfig.accent}15`
            e.currentTarget.style.borderColor = themeConfig.border
          }}
        >
          <Globe className="w-4 h-4" style={{ color: themeConfig.accent }} />
          <span>{currentLanguage === 'zh' ? '中文' : 'English'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end"
        style={{
          backgroundColor: themeConfig.card,
          borderColor: themeConfig.border,
        }}
      >
        <DropdownMenuItem 
          onClick={() => setLanguage('zh')}
          className="cursor-pointer"
          style={{ 
            color: themeConfig.text,
            backgroundColor: 'transparent'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <span className={currentLanguage === 'zh' ? 'font-bold' : ''}>中文</span>
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => setLanguage('en')}
          className="cursor-pointer"
          style={{ 
            color: themeConfig.text,
            backgroundColor: 'transparent'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <span className={currentLanguage === 'en' ? 'font-bold' : ''}>English</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 简化的语言切换按钮（仅切换两种语言）
 */
export function LanguageToggle() {
  const { currentLanguage, toggleLanguage } = useTranslation()
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const themeConfig = getThemeConfig()

  // 避免 hydration 不匹配，在客户端挂载前使用默认样式
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 transition-all duration-200 hover:shadow-sm"
        style={{
          color: '#24292f',
          backgroundColor: '#0969da15',
          border: '1px solid #d0d7de',
        }}
      >
        <Globe className="w-4 h-4" style={{ color: '#0969da' }} />
        <span>中文</span>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="gap-2 transition-all duration-200 hover:shadow-sm"
      style={{
        color: themeConfig.text,
        backgroundColor: `${themeConfig.accent}15`,
        border: `1px solid ${themeConfig.border}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = `${themeConfig.accent}25`
        e.currentTarget.style.borderColor = themeConfig.accent
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = `${themeConfig.accent}15`
        e.currentTarget.style.borderColor = themeConfig.border
      }}
    >
      <Globe className="w-4 h-4" style={{ color: themeConfig.accent }} />
      <span>{currentLanguage === 'zh' ? '中文' : 'EN'}</span>
    </Button>
  )
}
