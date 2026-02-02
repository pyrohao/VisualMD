'use client'

/**
 * 大纲面板组件
 *
 * 显示当前Markdown文档的标题结构
 * - 提取H1-H6标题
 * - 点击可跳转到对应位置
 */

import { useEffect, useState } from 'react'
import { ListTree, FileText } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useDocumentStore } from '@/stores/documentStore'

interface Heading {
  level: number
  text: string
  line: number
}

export function OutlinePanel() {
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  const { document, getCurrentMarkdown } = useDocumentStore()
  const [headings, setHeadings] = useState<Heading[]>([])

  // 解析文档提取标题
  useEffect(() => {
    // 获取当前画布渲染的Markdown内容
    const markdown = getCurrentMarkdown()
    if (!markdown) {
      setHeadings([])
      return
    }

    const lines = markdown.split('\n')
    const extractedHeadings: Heading[] = []

    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        const level = match[1].length
        const text = match[2].trim()
        extractedHeadings.push({ level, text, line: index })
      }
    })

    setHeadings(extractedHeadings)
  }, [document, getCurrentMarkdown])

  // 点击标题跳转到对应位置
  const handleHeadingClick = (line: number) => {
    // 触发事件让编辑器跳转到指定行
    window.dispatchEvent(new CustomEvent('outline-jump', { detail: { line } }))
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      {/* 头部 */}
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: themeConfig.border }}>
        <ListTree className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
        <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
          大纲
        </h2>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-3">
        {!document ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="mb-2 h-8 w-8" style={{ color: themeConfig.textMuted }} />
            <p className="text-sm" style={{ color: themeConfig.textMuted }}>
              暂无打开的文件
            </p>
          </div>
        ) : headings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ListTree className="mb-2 h-8 w-8" style={{ color: themeConfig.textMuted }} />
            <p className="text-sm" style={{ color: themeConfig.textMuted }}>
              当前文档没有标题
            </p>
            <p className="mt-1 text-xs" style={{ color: themeConfig.textMuted }}>
              使用 # ## ### 等创建标题
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {headings.map((heading, index) => (
              <button
                key={index}
                onClick={() => handleHeadingClick(heading.line)}
                className="w-full rounded px-2 py-1.5 text-left text-sm transition-colors hover:opacity-80"
                style={{
                  paddingLeft: `${(heading.level - 1) * 12 + 8}px`,
                  color: heading.level === 1 ? themeConfig.heading : themeConfig.text,
                  fontWeight: heading.level === 1 ? 600 : 400,
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = themeConfig.hover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                {heading.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default OutlinePanel
