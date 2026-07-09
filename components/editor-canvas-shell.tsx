'use client'

import { ReactFlowProvider } from '@xyflow/react'
import { CanvasSettingsMenu } from '@/components/canvas-settings-menu'
import { FlowCanvas } from '@/components/flow-canvas'
import { PrototypeCanvas } from '@/components/prototype-canvas'
import { themeConfigs, useThemeStore } from '@/stores/themeStore'
import { useCanvasViewStore } from '@/stores/canvasViewStore'
import type { DocumentState } from '@/types/tree'
import { useEffect, useState } from 'react'

interface EditorCanvasShellProps {
  document: DocumentState | null
}

function FlowCanvasContainer() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  )
}

export function EditorCanvasShell({ document }: EditorCanvasShellProps) {
  const [mounted, setMounted] = useState(false)
  const { getThemeConfig } = useThemeStore()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { mode } = useCanvasViewStore()

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="relative h-full w-full" style={{ backgroundColor: themeConfig.background }}>
      <div className="absolute left-4 top-4 z-30 flex items-center gap-2">
        <CanvasSettingsMenu document={document} />
      </div>

      {mode === 'flow' && <FlowCanvasContainer />}

      {mode === 'prototype' && <PrototypeCanvas document={document} />}

      {mode === 'split' && (
        <div className="flex h-full w-full flex-col lg:flex-row">
          <div className="min-h-0 min-w-0 flex-1 border-r pt-0" style={{ borderColor: themeConfig.border }}>
            <FlowCanvasContainer />
          </div>
          <div
            className="min-h-0 min-w-0 pt-0 lg:h-full lg:w-[25vw] lg:min-w-[25vw] lg:max-w-[25vw]"
            style={{
              backgroundColor: themeConfig.background,
              contain: 'layout size paint',
            }}
          >
            <PrototypeCanvas document={document} compact />
          </div>
        </div>
      )}
    </div>
  )
}

export default EditorCanvasShell
