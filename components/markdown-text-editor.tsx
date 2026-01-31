'use client'

/**
 * Markdown文本编辑器组件
 * 
 * 右侧文本编辑区域，支持直接编辑Markdown源码
 * 与可视化编辑器双向同步
 * 
 * 对应技术文档6.1节
 */

import { useCallback, useEffect, useState } from 'react'
import { Textarea } from './ui/textarea'
import { ScrollArea } from './ui/scroll-area'
import { useDocumentStore } from '@/stores/documentStore'
import { debounce } from '@/lib/utils'

export function MarkdownTextEditor() {
  const { document, updateFromMarkdown } = useDocumentStore()
  const [localValue, setLocalValue] = useState('')

  // 当文档变化时更新本地值
  useEffect(() => {
    if (document) {
      // 从Store获取当前Markdown
      const store = useDocumentStore.getState()
      const markdown = store.getCurrentMarkdown()
      setLocalValue(markdown)
    }
  }, [document?.root, document?.metadata])

  // 防抖处理文本变化
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

  // 如果没有文档，显示空状态
  if (!document) {
    return (
      <div className="flex h-full flex-col border-r border-border bg-card">
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <h2 className="text-sm font-semibold text-foreground">Markdown编辑器</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">没有打开的文档</p>
        </div>
      </div>
    )
  }

  const lineCount = localValue.split('\n').length
  const charCount = localValue.length

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      {/* 头部 */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <h2 className="text-sm font-semibold text-foreground">Markdown编辑器</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{charCount} 字符</span>
          <span>{lineCount} 行</span>
        </div>
      </div>

      {/* 编辑器 */}
      <ScrollArea className="flex-1">
        <Textarea
          value={localValue}
          onChange={handleChange}
          className="min-h-full resize-none rounded-none border-0 bg-transparent p-4 font-mono text-sm leading-relaxed focus-visible:ring-0"
          placeholder="在此输入Markdown内容..."
          spellCheck={false}
        />
      </ScrollArea>
    </div>
  )
}

export default MarkdownTextEditor
