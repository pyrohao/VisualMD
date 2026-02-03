'use client'

/**
 * 主题配置 Hook
 *
 * 提供 SSR 安全的主题配置获取
 * 避免服务端渲染和客户端 Hydration 不匹配的问题
 */

import { useState, useEffect } from 'react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'

export function useThemeConfig() {
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // 服务端和客户端首次渲染使用 light 主题
  // 挂载后再使用实际主题，避免 Hydration 不匹配
  return mounted ? getThemeConfig() : themeConfigs.light
}
