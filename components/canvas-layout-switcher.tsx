'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { Check, ChevronDown, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCanvasLayoutStore, type CanvasLayoutMode } from '@/stores/canvasLayoutStore'
import { useTranslation } from '@/stores/languageStore'
import { themeConfigs, useThemeStore } from '@/stores/themeStore'

const LAYOUT_MODE_OPTIONS: CanvasLayoutMode[] = ['balanced', 'left', 'right', 'down']

export function CanvasLayoutSwitcher() {
  const [mounted, setMounted] = useState(false)
  const { getThemeConfig } = useThemeStore()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { mode, setMode } = useCanvasLayoutStore()
  const { currentLanguage } = useTranslation()

  useEffect(() => {
    setMounted(true)
  }, [])

  const labels =
    currentLanguage === 'zh'
      ? {
          balanced: '左右布局',
          left: '左侧布局',
          right: '右侧布局',
          down: '向下布局',
        }
      : {
          balanced: 'Balanced',
          left: 'Left',
          right: 'Right',
          down: 'Down',
        }

  const menuSurfaceStyle: CSSProperties = {
    backgroundColor: `${themeConfig.card}f2`,
    borderColor: themeConfig.border,
    color: themeConfig.text,
    boxShadow: `0 14px 36px ${themeConfig.border}66`,
    backdropFilter: 'blur(10px)',
  }
  const hintText =
    currentLanguage === 'zh'
      ? {
          current: '当前已选',
          switchTo: '切换到',
        }
      : {
          current: 'Current',
          switchTo: 'Switch to',
        }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-xl transition-shadow hover:shadow-lg hover:[background-color:var(--button-hover-bg)]"
          title={`${hintText.current}: ${labels[mode]}`}
          style={{
            '--button-hover-bg': themeConfig.hover,
            backgroundColor: `${themeConfig.card}e8`,
            borderColor: themeConfig.border,
            color: themeConfig.text,
            boxShadow: `0 8px 20px ${themeConfig.border}55`,
            backdropFilter: 'blur(8px)',
          } as CSSProperties}
        >
          <LayoutGrid className="h-4 w-4" />
          <span>{labels[mode]}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="min-w-[10rem]"
        style={menuSurfaceStyle}
      >
        {LAYOUT_MODE_OPTIONS.map((value) => {
          const selected = value === mode
          return (
            <DropdownMenuItem
              key={value}
              onClick={() => setMode(value)}
              className="gap-2 rounded-md px-2.5 py-2 bg-[var(--menu-item-bg)] focus:[background-color:var(--menu-hover-bg)] data-[highlighted]:[background-color:var(--menu-hover-bg)]"
              title={
                selected
                  ? `${hintText.current}: ${labels[value]}`
                  : `${hintText.switchTo}: ${labels[value]}`
              }
              style={{
                '--menu-hover-bg': themeConfig.hover,
                '--menu-item-bg': selected ? `${themeConfig.accent}20` : 'transparent',
                boxShadow: selected ? `inset 0 0 0 1px ${themeConfig.accent}55` : 'none',
                color: selected ? themeConfig.heading : themeConfig.text,
              } as CSSProperties}
            >
              <span className="flex-1">{labels[value]}</span>
              {selected && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default CanvasLayoutSwitcher
