'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ComponentType } from 'react'
import {
  Check,
  ChevronDown,
  FileJson,
  LayoutGrid,
  LayoutTemplate,
  PanelsTopLeft,
  Settings2,
  SplitSquareHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { shouldHideVirtualRoot } from '@/lib/flow-helpers'
import { useCanvasLayoutStore, type CanvasLayoutMode } from '@/stores/canvasLayoutStore'
import { useCanvasViewStore, type CanvasViewMode } from '@/stores/canvasViewStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useTranslation } from '@/stores/languageStore'
import { themeConfigs, useThemeStore } from '@/stores/themeStore'
import type { DocumentState } from '@/types/tree'

interface CanvasSettingsMenuProps {
  document: DocumentState | null
}

const VIEW_ICONS: Record<CanvasViewMode, ComponentType<{ className?: string }>> = {
  flow: PanelsTopLeft,
  prototype: LayoutTemplate,
  split: SplitSquareHorizontal,
}

const LAYOUT_OPTIONS: CanvasLayoutMode[] = ['balanced', 'left', 'right', 'down']
const VIEW_OPTIONS: CanvasViewMode[] = ['flow', 'prototype', 'split']

export function CanvasSettingsMenu({ document }: CanvasSettingsMenuProps) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const { getThemeConfig } = useThemeStore()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { mode: viewMode, setMode: setViewMode } = useCanvasViewStore()
  const { mode: layoutMode, setMode: setLayoutMode } = useCanvasLayoutStore()
  const { currentLanguage, t } = useTranslation()

  useEffect(() => {
    setMounted(true)
  }, [])

  const canOpenMetadata = Boolean(document && shouldHideVirtualRoot(document.root))
  const labels = useMemo(
    () =>
      currentLanguage === 'zh'
        ? {
            settings: '画布设置',
            view: '视图',
            layout: '布局',
            metadata: '元数据',
            viewHint: '切换脑图、原型或分栏视图',
            layoutHint: '切换当前脑图的布局方向',
            metadataHint: '打开文档元数据编辑面板',
            viewModes: {
              flow: '脑图',
              prototype: '原型',
              split: '分栏',
            } satisfies Record<CanvasViewMode, string>,
            layoutModes: {
              balanced: '左右布局',
              left: '左侧布局',
              right: '右侧布局',
              down: '向下布局',
            } satisfies Record<CanvasLayoutMode, string>,
          }
        : {
            settings: 'Canvas',
            view: 'View',
            layout: 'Layout',
            metadata: 'Metadata',
            viewHint: 'Switch between map, prototype, and split views',
            layoutHint: 'Change the current map layout direction',
            metadataHint: 'Open the document metadata editor',
            viewModes: {
              flow: 'Map',
              prototype: 'Prototype',
              split: 'Split',
            } satisfies Record<CanvasViewMode, string>,
            layoutModes: {
              balanced: 'Balanced',
              left: 'Left',
              right: 'Right',
              down: 'Down',
            } satisfies Record<CanvasLayoutMode, string>,
          },
    [currentLanguage]
  )

  const surfaceStyle: CSSProperties = {
    backgroundColor: `${themeConfig.card}f2`,
    borderColor: themeConfig.border,
    color: themeConfig.text,
    boxShadow: `0 14px 36px ${themeConfig.border}66`,
    backdropFilter: 'blur(10px)',
  }

  const triggerStyle: CSSProperties = {
    '--button-hover-bg': themeConfig.hover,
    backgroundColor: `${themeConfig.card}e8`,
    borderColor: themeConfig.border,
    color: themeConfig.text,
    boxShadow: `0 8px 20px ${themeConfig.border}55`,
    backdropFilter: 'blur(8px)',
  } as CSSProperties

  const handleMetadataClick = () => {
    useDocumentStore.getState().selectNode('root')
    setOpen(false)
  }

  const tooltipStyle: CSSProperties = {
    '--tooltip-bg': themeConfig.card,
    '--tooltip-fg': themeConfig.text,
    '--tooltip-border': themeConfig.border,
    backgroundColor: themeConfig.card,
    color: themeConfig.text,
    border: `1px solid ${themeConfig.border}`,
    boxShadow: `0 10px 24px ${themeConfig.border}44`,
  } as CSSProperties

  const activeViewIcon = VIEW_ICONS[viewMode]
  const ActiveViewIcon = activeViewIcon

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-2 rounded-2xl pl-3 pr-2 transition-shadow hover:shadow-lg hover:[background-color:var(--button-hover-bg)]"
            style={triggerStyle}
            title={`${labels.settings}: ${labels.viewModes[viewMode]} | ${labels.layoutModes[layoutMode]}`}
          >
            <Settings2 className="h-4 w-4" />
            <span className="max-w-[11rem] truncate">
              {labels.viewModes[viewMode]} | {labels.layoutModes[layoutMode]}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={10}
          className="w-60 rounded-2xl p-2"
          style={surfaceStyle}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuLabel className="w-fit cursor-help px-2 pb-1 pt-0 text-xs uppercase tracking-[0.18em]" style={{ color: themeConfig.muted }}>
                {labels.view}
              </DropdownMenuLabel>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={8}
              className="bg-[var(--tooltip-bg)] text-[var(--tooltip-fg)] [&>svg]:fill-[var(--tooltip-bg)] [&>svg]:bg-[var(--tooltip-bg)]"
              style={tooltipStyle}
            >
              {labels.viewHint}
            </TooltipContent>
          </Tooltip>
          {VIEW_OPTIONS.map((value) => {
            const Icon = VIEW_ICONS[value]
            const selected = value === viewMode

            return (
              <DropdownMenuItem
                key={value}
                onClick={() => {
                  setViewMode(value)
                  setOpen(false)
                }}
                className="mb-1 gap-2 rounded-xl px-3 py-2.5 bg-[var(--menu-bg)] hover:[background-color:var(--menu-hover-bg)] hover:text-current focus:[background-color:var(--menu-hover-bg)] focus:text-current data-[highlighted]:[background-color:var(--menu-hover-bg)] data-[highlighted]:text-current"
                style={{
                  '--menu-bg': selected ? `${themeConfig.accent}20` : 'transparent',
                  '--menu-hover-bg': selected ? `${themeConfig.accent}20` : themeConfig.hover,
                  color: selected ? themeConfig.heading : themeConfig.text,
                  boxShadow: selected ? `inset 0 0 0 1px ${themeConfig.accent}55` : 'none',
                } as CSSProperties}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{labels.viewModes[value]}</span>
                {selected && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            )
          })}

          <DropdownMenuSeparator style={{ backgroundColor: themeConfig.border }} />

          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuLabel className="w-fit cursor-help px-2 pb-1 pt-2 text-xs uppercase tracking-[0.18em]" style={{ color: themeConfig.muted }}>
                {labels.layout}
              </DropdownMenuLabel>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={8}
              className="bg-[var(--tooltip-bg)] text-[var(--tooltip-fg)] [&>svg]:fill-[var(--tooltip-bg)] [&>svg]:bg-[var(--tooltip-bg)]"
              style={tooltipStyle}
            >
              {labels.layoutHint}
            </TooltipContent>
          </Tooltip>
          {LAYOUT_OPTIONS.map((value) => {
            const selected = value === layoutMode

            return (
              <DropdownMenuItem
                key={value}
                onClick={() => {
                  setLayoutMode(value)
                  setOpen(false)
                }}
                className="mb-1 gap-2 rounded-xl px-3 py-2.5 bg-[var(--menu-bg)] hover:[background-color:var(--menu-hover-bg)] hover:text-current focus:[background-color:var(--menu-hover-bg)] focus:text-current data-[highlighted]:[background-color:var(--menu-hover-bg)] data-[highlighted]:text-current"
                style={{
                  '--menu-bg': selected ? `${themeConfig.accent}20` : 'transparent',
                  '--menu-hover-bg': selected ? `${themeConfig.accent}20` : themeConfig.hover,
                  color: selected ? themeConfig.heading : themeConfig.text,
                  boxShadow: selected ? `inset 0 0 0 1px ${themeConfig.accent}55` : 'none',
                } as CSSProperties}
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="flex-1">{labels.layoutModes[value]}</span>
                {selected && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            )
          })}

          {canOpenMetadata && (
            <>
              <DropdownMenuSeparator style={{ backgroundColor: themeConfig.border }} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuItem
                    onClick={handleMetadataClick}
                    className="mt-2 gap-2 rounded-xl px-3 py-2.5 bg-[var(--menu-bg)] hover:[background-color:var(--menu-hover-bg)] hover:text-current focus:[background-color:var(--menu-hover-bg)] focus:text-current data-[highlighted]:[background-color:var(--menu-hover-bg)] data-[highlighted]:text-current"
                    style={{
                      '--menu-bg': 'transparent',
                      '--menu-hover-bg': themeConfig.hover,
                      color: themeConfig.text,
                    } as CSSProperties}
                  >
                    <FileJson className="h-4 w-4" />
                    <span className="flex-1">{t('node.metadata')}</span>
                    <ActiveViewIcon className="h-4 w-4 opacity-60" />
                  </DropdownMenuItem>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={8}
                  className="bg-[var(--tooltip-bg)] text-[var(--tooltip-fg)] [&>svg]:fill-[var(--tooltip-bg)] [&>svg]:bg-[var(--tooltip-bg)]"
                  style={tooltipStyle}
                >
                  {labels.metadataHint}
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
  )
}

export default CanvasSettingsMenu
