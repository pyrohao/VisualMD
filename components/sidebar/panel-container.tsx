'use client'

/**
 * 面板容器组件
 *
 * 根据当前激活的面板动态切换显示内容
 * 支持滑动动画效果
 */

import { motion, AnimatePresence } from 'framer-motion'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { FilePanel } from './file-panel'
import { useState, useEffect } from 'react'
import { TemplatePanel } from './template-panel'
import { AIPanel } from './ai-panel'
import { SettingsPanel } from './settings-panel'
import { OutlinePanel } from './outline-panel'
import { GitPanel } from './git-panel'
import { GitWorktreePanel } from './git-worktree-panel'

interface PanelContainerProps {
  onEditTemplate?: (content: string, templateName: string, templateId: string) => void
  onPreviewTemplate?: (content: string, templateName: string) => void
}

export function PanelContainer({ onEditTemplate, onPreviewTemplate }: PanelContainerProps) {
  const { activePanel, isPanelExpanded, panelWidth } = useSidebarStore()
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)

  // 使用安全的主题配置，避免 SSR 不匹配
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isPanelExpanded) {
    return null
  }

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: panelWidth, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="h-full overflow-hidden border-r flex-shrink-0"
      style={{ borderColor: themeConfig.border }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activePanel}
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 20, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="h-full"
        >
          {activePanel === 'templates' && (
            <TemplatePanel onEditTemplate={onEditTemplate} onPreviewTemplate={onPreviewTemplate} />
          )}
          {activePanel === 'files' && <FilePanel />}
          {activePanel === 'outline' && <OutlinePanel />}
          {activePanel === 'ai' && <AIPanel />}
          {activePanel === 'git' && <GitPanel />}
          {activePanel === 'git-files' && <GitWorktreePanel />}
          {activePanel === 'settings' && <SettingsPanel />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
