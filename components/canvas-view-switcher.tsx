'use client'

import type { ComponentType } from 'react'
import { useEffect, useState } from 'react'
import { LayoutTemplate, PanelsTopLeft, SplitSquareHorizontal } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { themeConfigs, useThemeStore } from '@/stores/themeStore'
import { useCanvasViewStore, type CanvasViewMode } from '@/stores/canvasViewStore'
import { useTranslation } from '@/stores/languageStore'

const MODE_ICONS: Record<CanvasViewMode, ComponentType<{ className?: string }>> = {
  flow: PanelsTopLeft,
  prototype: LayoutTemplate,
  split: SplitSquareHorizontal,
}

export function CanvasViewSwitcher() {
  const [mounted, setMounted] = useState(false)
  const { getThemeConfig } = useThemeStore()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { mode, setMode } = useCanvasViewStore()
  const { currentLanguage } = useTranslation()

  useEffect(() => {
    setMounted(true)
  }, [])

  const labels =
    currentLanguage === 'zh'
      ? {
          flow: '脑图',
          prototype: '原型',
          split: '分栏',
        }
      : {
          flow: 'Map',
          prototype: 'Prototype',
          split: 'Split',
        }

  return (
    <div
      className="inline-flex rounded-xl border p-1 shadow-lg backdrop-blur"
      style={{
        backgroundColor: `${themeConfig.card}ee`,
        borderColor: themeConfig.border,
      }}
    >
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value) {
            setMode(value as CanvasViewMode)
          }
        }}
        variant="outline"
        size="sm"
      >
        {(['flow', 'prototype', 'split'] as CanvasViewMode[]).map((value) => {
          const Icon = MODE_ICONS[value]

          return (
            <ToggleGroupItem
              key={value}
              value={value}
              className="gap-2 px-3"
              style={{
                backgroundColor: mode === value ? themeConfig.card : 'transparent',
                color: mode === value ? themeConfig.heading : themeConfig.muted,
                borderColor: themeConfig.border,
              }}
            >
              <Icon className="h-4 w-4" />
              <span>{labels[value]}</span>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </div>
  )
}

export default CanvasViewSwitcher
