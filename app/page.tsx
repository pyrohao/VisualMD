'use client'

import { useEffect, useState } from 'react'
import { MarkdownEditor } from '@/components/markdown-editor'

function isMobileOrTabletDevice() {
  if (typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent || ''
  const maxTouchPoints = navigator.maxTouchPoints || 0

  const isPhone = /android.+mobile|iphone|ipod|windows phone/i.test(userAgent)
  const isTablet =
    /ipad|tablet|playbook|silk/i.test(userAgent) ||
    (/android/i.test(userAgent) && !/mobile/i.test(userAgent)) ||
    (/macintosh/i.test(userAgent) && maxTouchPoints > 1)

  return isPhone || isTablet
}

export default function Home() {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
    const previousContent = viewportMeta?.getAttribute('content') || null
    let createdMeta: HTMLMetaElement | null = null

    if (isMobileOrTabletDevice()) {
      if (viewportMeta) {
        viewportMeta.setAttribute('content', 'width=1280, viewport-fit=cover')
      } else {
        const nextMeta = document.createElement('meta')
        nextMeta.name = 'viewport'
        nextMeta.content = 'width=1280, viewport-fit=cover'
        document.head.appendChild(nextMeta)
        createdMeta = nextMeta
      }
    }

    setIsReady(true)

    return () => {
      if (viewportMeta && previousContent) {
        viewportMeta.setAttribute('content', previousContent)
      }
      if (createdMeta) {
        createdMeta.remove()
      }
    }
  }, [])

  if (!isReady) {
    return <main className="h-screen w-full bg-white" />
  }

  return (
    <main className="h-screen w-full overflow-hidden">
      <MarkdownEditor />
    </main>
  )
}
