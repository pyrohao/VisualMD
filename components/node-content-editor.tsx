'use client'

/**
 * 普通节点内容编辑器组件
 * 用于编辑节点的标题和内容
 */

import { Type, FileText, Info } from 'lucide-react'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'

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
}

export function NodeContentEditor({
  title,
  content,
  themeConfig,
  onTitleChange,
  onContentChange,
}: NodeContentEditorProps) {
  return (
    <div className="space-y-6">
      {/* 标题编辑 */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium" style={{ color: themeConfig.heading }}>
          <Type className="w-4 h-4" style={{ color: themeConfig.accent }} />
          标题
        </label>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="输入节点标题..."
          className="h-12 text-base border-2"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            color: themeConfig.text,
          }}
        />
      </div>

      {/* 内容编辑 */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium" style={{ color: themeConfig.heading }}>
          <FileText className="w-4 h-4" style={{ color: themeConfig.accent }} />
          内容
        </label>
        <div
          className="rounded-xl border-2 overflow-hidden"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            height: '300px',
          }}
        >
          <Textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder="输入节点内容（可选）...\n\n支持 Markdown 格式"
            className="w-full h-full resize-none border-0 font-mono text-sm leading-relaxed p-4 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            style={{
              backgroundColor: 'transparent',
              color: themeConfig.text,
            }}
          />
        </div>
        <p className="text-xs flex items-center gap-1" style={{ color: themeConfig.muted }}>
          <Info className="w-3 h-3" />
          支持 Markdown 格式，内容将显示在节点下方
        </p>
      </div>
    </div>
  )
}

export default NodeContentEditor
