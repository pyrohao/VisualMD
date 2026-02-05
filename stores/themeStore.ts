/**
 * 主题状态管理 - Zustand Store
 *
 * 提供全局主题状态管理，支持三种专业配色模式：
 * 1. 明亮模式 (light) - 类似 VS Code 默认浅色主题
 * 2. 黑暗模式 (dark) - 类似 GitHub Dark / VS Code Dark+
 * 3. 阅读模式 (reading) - 类似 Kindle/Apple Books 护眼模式
 *
 * 对应UI优化需求
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * 主题类型
 */
export type ThemeMode = 'light' | 'dark' | 'reading'

/**
 * 主题配置接口
 */
interface ThemeConfig {
  /** 背景颜色 */
  background: string
  /** 文字颜色 */
  text: string
  /** 标题颜色 */
  heading: string
  /** 边框颜色 */
  border: string
  /** 次要文字颜色 */
  muted: string
  /** 强调色 */
  accent: string
  /** 卡片背景 */
  card: string
  /** 代码块背景 */
  code: string
  /** 链接颜色 */
  link: string
  /** 悬停背景 */
  hover: string
  /** 按钮文字颜色 */
  buttonText: string
  /** 次要按钮背景 */
  buttonSecondaryBg: string
  /** 危险按钮颜色 */
  danger: string
  /** 侧边栏背景 */
  sidebar: string
  /** 主要强调色 */
  primary: string
  /** 次要文字颜色（用于描述、提示等） */
  textMuted: string
  /** 成功颜色 */
  success: string
  /** 错误颜色 */
  error: string
  /** 警告颜色 */
  warning: string
  /** 输入框背景 */
  input: string
}

/**
 * 专业主题配置映射
 * 参考 VS Code、GitHub、Obsidian 等主流编辑器的配色方案
 */
export const themeConfigs: Record<ThemeMode, ThemeConfig> = {
  light: {
    // VS Code 默认浅色主题风格
    background: '#ffffff',
    text: '#24292f',
    heading: '#1f2328',
    border: '#d0d7de',
    muted: '#57606a',
    accent: '#0969da',
    card: '#fbfbfb',
    code: '#f6f8fa',
    link: '#0969da',
    hover: '#eef1f4',
    buttonText: '#ffffff',
    buttonSecondaryBg: '#f6f8fa',
    danger: '#cf222e',
    sidebar: '#f6f8fa',
    primary: '#0969da',
    textMuted: '#656d76',
    success: '#1a7f37',
    error: '#cf222e',
    warning: '#9a6700',
    input: '#fafbfc',
  },
  dark: {
    // GitHub Dark / VS Code Dark+ 风格
    background: '#0d1117',
    text: '#c9d1d9',
    heading: '#e6edf3',
    border: '#3d444d',
    muted: '#8b949e',
    accent: '#58a6ff',
    card: '#161b22',
    code: '#161b22',
    link: '#58a6ff',
    hover: '#262c36',
    buttonText: '#f0f6fc',
    buttonSecondaryBg: '#21262d',
    danger: '#f85149',
    sidebar: '#161b22',
    primary: '#58a6ff',
    textMuted: '#8b949e',
    success: '#3fb950',
    error: '#f85149',
    warning: '#d29922',
    input: '#21262d',
  },
  reading: {
    // Kindle/Apple Books 护眼风格
    background: '#f5f0e6',
    text: '#3d3929',
    heading: '#2c2818',
    border: '#d4cdb5',
    muted: '#6b6550',
    accent: '#8b7355',
    card: '#faf8f3',
    code: '#ebe5d8',
    link: '#6b5b3d',
    hover: '#e8e2d4',
    buttonText: '#ffffff',
    buttonSecondaryBg: '#ebe5d8',
    danger: '#b35900',
    sidebar: '#ebe5d8',
    primary: '#8b7355',
    textMuted: '#6b6550',
    success: '#2d6a4f',
    error: '#b35900',
    warning: '#9c6644',
    input: '#faf8f3',
  },
}

/**
 * 主题Store接口
 */
interface ThemeStore {
  /** 当前主题模式 */
  theme: ThemeMode
  /** 切换主题 */
  setTheme: (theme: ThemeMode) => void
  /** 切换到下一个主题 */
  toggleTheme: () => void
  /** 获取当前主题配置 */
  getThemeConfig: () => ThemeConfig
  /** 是否为明亮模式 */
  isLight: () => boolean
  /** 是否为黑暗模式 */
  isDark: () => boolean
  /** 是否为阅读模式 */
  isReading: () => boolean
}

/**
 * 创建主题Store
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'light',

      setTheme: (theme) => {
        set({ theme })
        // 应用主题到document
        applyTheme(theme)
      },

      toggleTheme: () => {
        const themes: ThemeMode[] = ['light', 'dark', 'reading']
        const currentIndex = themes.indexOf(get().theme)
        const nextTheme = themes[(currentIndex + 1) % themes.length]
        get().setTheme(nextTheme)
      },

      getThemeConfig: () => themeConfigs[get().theme],

      isLight: () => get().theme === 'light',
      isDark: () => get().theme === 'dark',
      isReading: () => get().theme === 'reading',
    }),
    {
      name: 'markdown-editor-theme',
    }
  )
)

/**
 * 应用主题到document
 * 设置CSS变量供全局使用
 */
function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return

  const config = themeConfigs[theme]
  const root = document.documentElement

  // 设置CSS变量
  root.style.setProperty('--theme-bg', config.background)
  root.style.setProperty('--theme-text', config.text)
  root.style.setProperty('--theme-heading', config.heading)
  root.style.setProperty('--theme-border', config.border)
  root.style.setProperty('--theme-muted', config.muted)
  root.style.setProperty('--theme-accent', config.accent)
  root.style.setProperty('--theme-card', config.card)
  root.style.setProperty('--theme-code', config.code)
  root.style.setProperty('--theme-link', config.link)
  root.style.setProperty('--theme-hover', config.hover)

  // 设置data属性供Tailwind使用
  root.setAttribute('data-theme', theme)

  // 设置class用于Tailwind dark模式
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

/**
 * 初始化主题
 * 在应用启动时调用
 */
export function initTheme() {
  const theme = useThemeStore.getState().theme
  applyTheme(theme)
}
