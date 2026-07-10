'use client'

import type { ThemeMode } from '@/stores/themeStore'
import { sanitizeRenderedSvg } from '@/lib/safe-html'

type MermaidModule = typeof import('mermaid').default

let mermaidModulePromise: Promise<MermaidModule> | null = null
let mermaidRenderQueue = Promise.resolve()
let mermaidRenderId = 0

export function getMermaidTheme(theme: ThemeMode) {
  return theme === 'dark' ? 'dark' : 'neutral'
}

export function getMermaidConfig(theme: ThemeMode) {
  return {
    startOnLoad: false,
    securityLevel: 'strict' as const,
    theme: getMermaidTheme(theme),
    fontFamily: 'inherit',
    flowchart: {
      htmlLabels: true,
      useMaxWidth: true,
    },
    sequence: {
      useMaxWidth: true,
    },
    gantt: {
      useMaxWidth: true,
    },
  }
}

async function loadMermaidModule() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((module) => module.default)
  }

  return mermaidModulePromise
}

export async function renderMermaidDiagram(source: string, theme: ThemeMode) {
  const mermaid = await loadMermaidModule()

  const task = mermaidRenderQueue.then(async () => {
    mermaid.initialize(getMermaidConfig(theme))

    const diagramId = `visualmd-mermaid-${mermaidRenderId += 1}`
    const { svg } = await mermaid.render(diagramId, source)
    return sanitizeRenderedSvg(svg)
  })

  mermaidRenderQueue = task.then(
    () => undefined,
    () => undefined
  )

  return task
}
