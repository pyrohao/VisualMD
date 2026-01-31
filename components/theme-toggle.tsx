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
import { useCallback } from 'react'

/**
 * 主题配置
 */
const themeConfig: Record<ThemeMode, { label: string; icon: React.ReactNode; bgColor: string; hoverColor: string }> = {
  light: {
    label: '明亮',
    icon: <Sun className="h-4 w-4" />,
    bgColor: 'bg-amber-100',
    hoverColor: 'hover:bg-amber-200',
  },
  dark: {
    label: '黑暗',
    icon: <Moon className="h-4 w-4" />,
    bgColor: 'bg-slate-700',
    hoverColor: 'hover:bg-slate-600',
  },
  reading: {
    label: '阅读',
    icon: <BookOpen className="h-4 w-4" />,
    bgColor: 'bg-amber-50',
    hoverColor: 'hover:bg-amber-100',
  },
}

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  const currentTheme = themeConfig[theme]

  const handleClick = useCallback(() => {
    const themes: ThemeMode[] = ['light', 'dark', 'reading']
    const currentIndex = themes.indexOf(theme)
    const nextTheme = themes[(currentIndex + 1) % themes.length]
    setTheme(nextTheme)
  }, [theme, setTheme])

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={`h-9 gap-2 px-3 transition-all duration-200 ${
        theme === 'dark'
          ? 'text-slate-200 bg-slate-700 hover:bg-slate-600 hover:text-white'
          : theme === 'reading'
          ? 'text-amber-900 bg-amber-100 hover:bg-amber-200'
          : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
      }`}
      title={`当前主题: ${currentTheme.label}，点击切换到下一个主题`}
    >
      {currentTheme.icon}
      <span className="text-sm font-medium">{currentTheme.label}</span>
    </Button>
  )
}
