'use client'

/**
 * 面板容器组件
 *
 * 根据当前激活的面板动态切换显示内容
 * 支持滑动动画效果
 */

import { motion, AnimatePresence } from 'framer-motion'
import { useSidebarStore, type SidebarPanel } from '@/stores/sidebarStore'
import { useThemeStore } from '@/stores/themeStore'
import { FilePanel } from './file-panel'
import { TemplatePanel } from './template-panel'

interface PanelContainerProps {
  onEditTemplate?: (content: string, templateName: string, templateId: string) => void
  onPreviewTemplate?: (content: string, templateName: string) => void
}

const PANELS: Record<SidebarPanel, React.ComponentType<any>> = {
  files: FilePanel,
  templates: TemplatePanel,
}

export function PanelContainer({ onEditTemplate, onPreviewTemplate }: PanelContainerProps) {
  const { activePanel, isPanelExpanded, panelWidth } = useSidebarStore()
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

  if (!isPanelExpanded) {
    return null
  }

  const ActivePanel = PANELS[activePanel]

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
          {activePanel === 'templates' ? (
            <TemplatePanel onEditTemplate={onEditTemplate} onPreviewTemplate={onPreviewTemplate} />
          ) : (
            <FilePanel />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
