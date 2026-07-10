'use client'

import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { ThemeMode } from '@/stores/themeStore'
import { renderMermaidDiagram } from '@/lib/mermaid'

function createErrorBanner(message: string) {
  const banner = document.createElement('div')
  banner.className = 'mermaid-error'
  banner.textContent = message
  return banner
}

function getMermaidSource(element: Element) {
  if (element instanceof HTMLPreElement) {
    const codeBlock = element.querySelector('code.language-mermaid')
    return codeBlock?.textContent?.trim() || ''
  }

  return element.getAttribute('data-mermaid-source')?.trim() || ''
}

function isMermaidDiagramCurrent(element: Element, theme: ThemeMode) {
  return element.getAttribute('data-mermaid-theme') === theme
}

export function useMermaidEnhancement(
  containerRef: RefObject<HTMLElement | null>,
  contentKey: string,
  theme: ThemeMode,
  errorMessage: string
) {
  useEffect(() => {
    const container = containerRef.current
    if (!container || !contentKey) {
      return
    }

    let cancelled = false
    let frameId = 0

    const enhance = async () => {
      const targets = [
        ...Array.from(container.querySelectorAll('pre')),
        ...Array.from(container.querySelectorAll('.mermaid-diagram[data-mermaid-source]')),
      ]

      for (const target of targets) {
        if (cancelled) {
          return
        }

        const source = getMermaidSource(target)
        if (!source) {
          continue
        }

        if (target instanceof HTMLPreElement) {
          if (!target.querySelector('code.language-mermaid') || target.dataset.mermaidState === 'rendering') {
            continue
          }
          target.dataset.mermaidState = 'rendering'
        } else if (isMermaidDiagramCurrent(target, theme)) {
          continue
        }

        try {
          const svg = await renderMermaidDiagram(source, theme)
          if (cancelled) {
            return
          }

          const figure = document.createElement('div')
          figure.className = 'mermaid-diagram'
          figure.setAttribute('data-mermaid-source', source)
          figure.setAttribute('data-mermaid-theme', theme)
          figure.innerHTML = svg
          target.replaceWith(figure)
        } catch {
          if (cancelled) {
            return
          }

          if (target instanceof HTMLPreElement) {
            target.dataset.mermaidState = 'error'
            const previousElement = target.previousElementSibling
            if (!previousElement || !previousElement.classList.contains('mermaid-error')) {
              target.parentElement?.insertBefore(createErrorBanner(errorMessage), target)
            }
          }
        }
      }
    }

    const scheduleEnhance = () => {
      if (cancelled) {
        return
      }

      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0
        void enhance()
      })
    }

    scheduleEnhance()

    const observer = new MutationObserver(() => {
      scheduleEnhance()
    })
    observer.observe(container, {
      childList: true,
      subtree: true,
    })

    return () => {
      cancelled = true
      observer.disconnect()
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [containerRef, contentKey, errorMessage, theme])
}

export default useMermaidEnhancement
