'use client'

import { HelpCircle, Info, BookOpen, Github } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useState, useEffect } from 'react'
import { useTranslation } from '@/stores/languageStore'

export function HelpPanel() {
  const { getThemeConfig } = useThemeStore()
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  const shortcuts = [
    { label: t('help.quickOpen'), keys: 'Ctrl+O' },
    { label: t('help.saveDocument'), keys: 'Ctrl+S' },
    { label: t('help.globalSearch'), keys: 'Ctrl+F' },
    { label: t('help.toggleLeftPanel'), keys: 'Ctrl+B' },
    { label: t('help.panelSwitch'), keys: 'Ctrl+1~6' },
  ]

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: themeConfig.border }}>
        <HelpCircle className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
        <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
          {t('sidebar.help')}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-6 text-center">
          <h1
            className="mb-2 text-2xl font-bold"
            style={{ color: themeConfig.primary }}
          >
            Visual MD
          </h1>
          <p className="text-sm" style={{ color: themeConfig.textMuted }}>
            {t('help.productTagline')}
          </p>
        </div>

        <div
          className="mb-4 rounded-lg border p-4"
          style={{
            borderColor: themeConfig.border,
            backgroundColor: themeConfig.card,
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Info className="h-4 w-4" style={{ color: themeConfig.primary }} />
            <h3 className="text-sm font-medium" style={{ color: themeConfig.heading }}>
              {t('help.about')}
            </h3>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: themeConfig.text }}>
            {t('help.aboutDescription')}
          </p>
        </div>

        <div
          className="mb-4 rounded-lg border p-4"
          style={{
            borderColor: themeConfig.border,
            backgroundColor: themeConfig.card,
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4" style={{ color: themeConfig.primary }} />
            <h3 className="text-sm font-medium" style={{ color: themeConfig.heading }}>
              {t('help.shortcuts')}
            </h3>
          </div>
          <div className="space-y-2 text-xs">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.keys} className="flex justify-between gap-4">
                <span style={{ color: themeConfig.textMuted }}>{shortcut.label}</span>
                <span style={{ color: themeConfig.text }}>{shortcut.keys}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: themeConfig.border,
            backgroundColor: themeConfig.card,
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Github className="h-4 w-4" style={{ color: themeConfig.primary }} />
            <h3 className="text-sm font-medium" style={{ color: themeConfig.heading }}>
              {t('help.version')}
            </h3>
          </div>
          <p className="text-xs" style={{ color: themeConfig.textMuted }}>
            2.0.0
          </p>
        </div>
      </div>
    </div>
  )
}

export default HelpPanel
