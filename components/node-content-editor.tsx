'use client'

import { Type, FileText, Info } from 'lucide-react'
import { useCallback, useRef } from 'react'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { useTranslation } from '@/stores/languageStore'
import {
  getMarkdownImagePasteResult,
  hasClipboardImage,
} from '@/lib/clipboard-image'
import { getGitMarkdownImagePasteResult } from '@/lib/git-asset-paste'
import { useTabsStore } from '@/stores/tabsStore'

interface NodeContentEditorProps {
  title: string
  content: string
  themeConfig: {
    card: string
    border: string
    text: string
    heading: string
    muted: string
    accent: string
  }
  onTitleChange: (title: string) => void
  onContentChange: (content: string) => void
  onAfterGitPaste?: (content: string) => void
}

export function NodeContentEditor({
  title,
  content,
  themeConfig,
  onTitleChange,
  onContentChange,
  onAfterGitPaste,
}: NodeContentEditorProps) {
  const { t } = useTranslation()
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const handleContentPaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!hasClipboardImage(e.clipboardData)) return

    e.preventDefault()

    const target = e.currentTarget
    const activeTab = useTabsStore.getState().getActiveTab()
    const isGitTab = activeTab?.sourceType === 'git' && !!activeTab.fileId

    if (isGitTab && activeTab.fileId) {
      const uploadResult = await getGitMarkdownImagePasteResult({
        documentId: activeTab.fileId,
        clipboardData: e.clipboardData,
        value: content,
        selectionStart: target.selectionStart ?? content.length,
        selectionEnd: target.selectionEnd ?? content.length,
      })
      if (!uploadResult) return

      onContentChange(uploadResult.nextValue)
      onAfterGitPaste?.(uploadResult.nextValue)

      window.requestAnimationFrame(() => {
        const textarea = contentTextareaRef.current
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(uploadResult.selectionStart, uploadResult.selectionEnd)
      })
      return
    }

    const result = await getMarkdownImagePasteResult({
      clipboardData: e.clipboardData,
      value: content,
      selectionStart: target.selectionStart ?? content.length,
      selectionEnd: target.selectionEnd ?? content.length,
    })

    if (!result) return

    onContentChange(result.nextValue)

    window.requestAnimationFrame(() => {
      const textarea = contentTextareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }, [content, onAfterGitPaste, onContentChange])

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium" style={{ color: themeConfig.heading }}>
          <Type className="h-4 w-4" style={{ color: themeConfig.accent }} />
          {t('node.title')}
        </label>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t('node.enterTitle')}
          className="h-12 border-2 text-base"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            color: themeConfig.text,
          }}
        />
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium" style={{ color: themeConfig.heading }}>
          <FileText className="h-4 w-4" style={{ color: themeConfig.accent }} />
          {t('node.content')}
        </label>
        <div
          className="overflow-hidden rounded-xl border-2"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            height: '370px',
          }}
        >
          <Textarea
            ref={contentTextareaRef}
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            onPaste={(e) => {
              void handleContentPaste(e)
            }}
            placeholder={t('node.enterContent')}
            className="h-full w-full resize-none border-0 p-4 font-mono text-sm leading-relaxed focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            style={{
              backgroundColor: 'transparent',
              color: themeConfig.text,
            }}
          />
        </div>
        <p className="flex items-center gap-1 text-xs" style={{ color: themeConfig.muted }}>
          <Info className="h-3 w-3" />
          {t('node.markdownSupport')}
        </p>
      </div>
    </div>
  )
}

export default NodeContentEditor
