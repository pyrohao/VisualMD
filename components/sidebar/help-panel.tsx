'use client'

import { HelpCircle, Info, BookOpen, Github } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useState, useEffect } from 'react'

const SHORTCUTS = [
  { label: 'Quick Open / File Search', keys: 'Ctrl+O' },
  { label: 'Save Document', keys: 'Ctrl+S' },
  { label: 'Global Search', keys: 'Ctrl+F' },
  { label: 'Toggle Left Panel', keys: 'Ctrl+B' },
  { label: 'Files / Outline / Templates / AI / Git', keys: 'Ctrl+1~5' },
]

export function HelpPanel() {
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: themeConfig.border }}>
        <HelpCircle className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
        <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
          Help
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
            Visual workspace for Markdown, structure, prototypes, and Git-backed docs
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
              About
            </h3>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: themeConfig.text }}>
            Visual MD is designed for people who work with structured Markdown content.
            It combines visual tree editing, live preview, lightweight prototype rendering,
            templates, AI-assisted drafting, and Git-friendly document workflows.
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
              Shortcuts
            </h3>
          </div>
          <div className="space-y-2 text-xs">
            {SHORTCUTS.map((shortcut) => (
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
              Version
            </h3>
          </div>
          <p className="text-xs" style={{ color: themeConfig.textMuted }}>
            Version: 2.0.0
          </p>
        </div>
      </div>
    </div>
  )
}

export default HelpPanel
