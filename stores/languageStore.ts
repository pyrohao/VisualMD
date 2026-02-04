'use client'

/**
 * 语言状态管理 Store
 * 支持语言切换和持久化
 * 默认语言根据系统语言自动检测
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { type Language, t as translate } from '@/lib/i18n/translations'

/**
 * 检测系统语言
 * 如果系统语言是中文（zh 开头），返回 'zh'，否则返回 'en'
 */
function detectSystemLanguage(): Language {
  if (typeof navigator === 'undefined') return 'zh'
  
  const systemLang = navigator.language.toLowerCase()
  // 如果系统语言是中文（zh 开头），使用中文
  if (systemLang.startsWith('zh')) {
    return 'zh'
  }
  // 其他情况默认使用英文
  return 'en'
}

interface LanguageState {
  /** 当前语言 */
  currentLanguage: Language
  /** 设置语言 */
  setLanguage: (lang: Language) => void
  /** 切换语言 */
  toggleLanguage: () => void
  /** 翻译函数 */
  t: (key: string) => string
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      // 默认使用系统语言，如果没有持久化存储的话
      currentLanguage: detectSystemLanguage(),
      
      setLanguage: (lang: Language) => {
        set({ currentLanguage: lang })
      },
      
      toggleLanguage: () => {
        const newLang = get().currentLanguage === 'zh' ? 'en' : 'zh'
        set({ currentLanguage: newLang })
      },
      
      t: (key: string) => {
        return translate(key, get().currentLanguage)
      },
    }),
    {
      name: 'language-storage',
    }
  )
)

/**
 * 便捷 Hook：在组件中获取翻译函数
 * 用法：const { t, currentLanguage, setLanguage } = useTranslation()
 */
export function useTranslation() {
  const { t, currentLanguage, setLanguage, toggleLanguage } = useLanguageStore()
  return { t, currentLanguage, setLanguage, toggleLanguage }
}
