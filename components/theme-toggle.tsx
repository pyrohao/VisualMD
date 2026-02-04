'use client'

/**
 * 主题切换组件
 *
 * 提供明亮/黑暗/阅读三种模式的直接切换按钮
 * 显示在最上方工具栏右侧，点击即可循环切换
 *
 * 对应UI优化需求
 */

import { Sun, Moon, BookOpen } from 'lucide-react'
import { Button } from './ui/button'
import { useThemeStore, type ThemeMode } from '@/stores/themeStore'
import { useCallback, useEffect, useState } from 'react'

/**
 * 主题配置 - 图标和标签
 */
const themeIcons: Record<ThemeMode, { label: string; icon: React.ReactNode }> = {
  light: {
    label: '明亮',
    icon: <Sun className="h-4 w-4" />,
  },
  dark: {
    label: '黑暗',
    icon: <Moon className="h-4 w-4" />,
  },
  reading: {
    label: '阅读',
    icon: <BookOpen className="h-4 w-4" />,
  },
}

export function ThemeToggle() {
  const { theme, setTheme, getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const themeConfig = getThemeConfig()
  const currentTheme = themeIcons[theme]

  const handleClick = useCallback(() => {
    const themes: ThemeMode[] = ['light', 'dark', 'reading']
    const currentIndex = themes.indexOf(theme)
    const nextTheme = themes[(currentIndex + 1) % themes.length]
    setTheme(nextTheme)
  }, [theme, setTheme])

  // 避免 hydration 不匹配，在客户端挂载前使用默认样式
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-9 gap-2 px-3 transition-all duration-200 hover:shadow-sm"
        style={{
          color: '#24292f',
          backgroundColor: '#0969da15',
          border: '1px solid #d0d7de',
        }}
        title="主题切换"
      >
        <span style={{ color: '#0969da' }}><Sun className="h-4 w-4" /></span>
        <span className="text-sm font-medium">明亮</span>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="h-9 gap-2 px-3 transition-all duration-200 hover:shadow-sm"
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
      title={`当前主题: ${currentTheme.label}，点击切换到下一个主题`}
    >
      <span style={{ color: themeConfig.accent }}>{currentTheme.icon}</span>
      <span className="text-sm font-medium">{currentTheme.label}</span>
    </Button>
  )
}
