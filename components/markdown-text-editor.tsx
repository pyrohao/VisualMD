'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Textarea } from './ui/textarea'
import { ScrollArea } from './ui/scroll-area'
import { useDocumentStore } from '@/stores/documentStore'
import { useTranslation } from '@/stores/languageStore'
import { debounce } from '@/lib/utils'
import { getMarkdownImagePasteResult, hasClipboardImage } from '@/lib/clipboard-image'

export function MarkdownTextEditor() {
  const { document, updateFromMarkdown } = useDocumentStore()
  const { t } = useTranslation()
  const [localValue, setLocalValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!document) return

    const store = useDocumentStore.getState()
    setLocalValue(store.getCurrentMarkdown())
  }, [document?.root, document?.metadata])

  const debouncedUpdate = useCallback(
    debounce((value: string) => {
      updateFromMarkdown(value)
    }, 500),
    [updateFromMarkdown]
  )

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setLocalValue(newValue)
    debouncedUpdate(newValue)
  }

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!hasClipboardImage(e.clipboardData)) return

    e.preventDefault()

    const target = e.currentTarget
    const result = await getMarkdownImagePasteResult({
      clipboardData: e.clipboardData,
      value: localValue,
      selectionStart: target.selectionStart ?? localValue.length,
      selectionEnd: target.selectionEnd ?? localValue.length,
    })

    if (!result) return

    setLocalValue(result.nextValue)
    debouncedUpdate(result.nextValue)

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }, [debouncedUpdate, localValue])

  if (!document) {
    return (
      <div className="flex h-full flex-col border-r border-border bg-card">
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <h2 className="text-sm font-semibold text-foreground">{t('preview.markdownEditor')}</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{t('preview.noDocumentOpen')}</p>
        </div>
      </div>
    )
  }

  const lineCount = localValue.split('\n').length
  const charCount = localValue.length

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <h2 className="text-sm font-semibold text-foreground">{t('preview.markdownEditor')}</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{charCount} {t('preview.characters')}</span>
          <span>{lineCount} {t('preview.lines')}</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <Textarea
          ref={textareaRef}
          value={localValue}
          onChange={handleChange}
          onPaste={(e) => {
            void handlePaste(e)
          }}
          className="min-h-full resize-none rounded-none border-0 bg-transparent p-4 font-mono text-sm leading-relaxed focus-visible:ring-0"
          placeholder={t('preview.editPlaceholder')}
          spellCheck={false}
        />
      </ScrollArea>
    </div>
  )
}

export default MarkdownTextEditor
