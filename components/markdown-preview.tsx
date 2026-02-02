'use client'

/**
 * Markdown预览组件
 *
 * 右侧预览面板，实时渲染Markdown内容
 * 使用 remark 生态系统进行专业 Markdown 解析
 *
 * 对应技术文档6.1节
 */

import { useDocumentStore } from '@/stores/documentStore'
import { useThemeStore, themeConfigs, type ThemeMode } from '@/stores/themeStore'
import { useMemo, useEffect, useState } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeSanitize from 'rehype-sanitize'

/**
 * 根据主题生成CSS变量样式
 */
function getThemeStyles(theme: ThemeMode): string {
  const config = themeConfigs[theme]
  
  return `
    .markdown-body {
      color: ${config.text};
      font-size: 16px;
      line-height: 1.75;
    }
    .markdown-body h1 {
      color: ${config.heading};
      font-size: 2.25rem;
      font-weight: 700;
      margin-top: 2rem;
      margin-bottom: 1.5rem;
      letter-spacing: -0.025em;
    }
    .markdown-body h2 {
      color: ${config.heading};
      font-size: 1.875rem;
      font-weight: 700;
      margin-top: 2rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid ${config.border};
      letter-spacing: -0.025em;
    }
    .markdown-body h3 {
      color: ${config.heading};
      font-size: 1.5rem;
      font-weight: 600;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      letter-spacing: -0.025em;
    }
    .markdown-body h4 {
      color: ${config.heading};
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      letter-spacing: -0.025em;
    }
    .markdown-body h5 {
      color: ${config.heading};
      font-size: 1.125rem;
      font-weight: 600;
      margin-top: 1rem;
      margin-bottom: 0.5rem;
      letter-spacing: -0.025em;
    }
    .markdown-body h6 {
      color: ${config.heading};
      font-size: 1rem;
      font-weight: 600;
      margin-top: 1rem;
      margin-bottom: 0.5rem;
      letter-spacing: -0.025em;
    }
    .markdown-body p {
      margin-bottom: 1.25rem;
      line-height: 1.75;
    }
    .markdown-body strong {
      color: ${config.heading};
      font-weight: 700;
    }
    .markdown-body em {
      color: ${config.muted};
      font-style: italic;
    }
    .markdown-body code {
      background-color: ${config.code};
      color: ${config.heading};
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.875rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .markdown-body pre {
      background-color: ${config.code};
      padding: 1.25rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      margin: 1.5rem 0;
    }
    .markdown-body pre code {
      background-color: transparent;
      color: ${config.text};
      padding: 0;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    .markdown-body a {
      color: ${config.link};
      text-decoration: underline;
      text-underline-offset: 2px;
      font-weight: 500;
    }
    .markdown-body a:hover {
      opacity: 0.8;
    }
    .markdown-body ul {
      list-style-type: disc;
      padding-left: 1.5rem;
      margin-bottom: 1rem;
    }
    .markdown-body ol {
      list-style-type: decimal;
      padding-left: 1.5rem;
      margin-bottom: 1rem;
    }
    .markdown-body li {
      margin-bottom: 0.25rem;
    }
    .markdown-body blockquote {
      border-left: 4px solid ${config.accent};
      background-color: ${config.code};
      padding: 0.75rem 1.25rem;
      margin: 1.25rem 0;
      font-style: italic;
      border-radius: 0 0.25rem 0.25rem 0;
    }
    .markdown-body hr {
      border: none;
      border-top: 2px solid ${config.border};
      margin: 2rem 0;
    }
    .markdown-body img {
      max-width: 100%;
      height: auto;
      border-radius: 0.5rem;
      margin: 1.5rem 0;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
    }
    .markdown-body th,
    .markdown-body td {
      border: 1px solid ${config.border};
      padding: 0.75rem;
      text-align: left;
    }
    .markdown-body th {
      background-color: ${config.code};
      font-weight: 600;
    }
  `
}

/**
 * 移除YAML Front Matter
 */
function removeYAMLFrontMatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '')
}

export function MarkdownPreview() {
  const { document } = useDocumentStore()
  const { theme, getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  
  const [html, setHtml] = useState('')

  // 从Store获取当前Markdown
  const store = useDocumentStore.getState()
  const markdown = store.getCurrentMarkdown()

  // 使用 remark 处理 markdown
  useEffect(() => {
    const processMarkdown = async () => {
      const content = removeYAMLFrontMatter(markdown)
      
      const result = await unified()
        .use(remarkParse)
        .use(remarkGfm) // 支持 GitHub Flavored Markdown
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeStringify, { allowDangerousHtml: true })
        .process(content)
      
      setHtml(String(result))
    }
    
    processMarkdown()
  }, [markdown])

  // 如果没有文档，显示空状态
  if (!document) {
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.background }}>
        <div className="flex h-14 items-center border-b px-5" style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border }}>
          <h2 className="text-lg font-semibold" style={{ color: themeConfig.heading }}>文档预览</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p style={{ color: themeConfig.muted }}>没有可预览的内容</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.background }}>
      {/* 头部 */}
      <div className="flex h-14 items-center border-b px-5" style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border }}>
        <h2 className="text-lg font-semibold" style={{ color: themeConfig.heading }}>文档预览</h2>
        <span className="ml-3 text-sm" style={{ color: themeConfig.muted }}>
          {document.fileName || '未命名文档'}
        </span>
      </div>

      {/* 预览内容 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="p-8 max-w-none">
          <style>{getThemeStyles(theme)}</style>
          <article
            className="markdown-body max-w-none"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  )
}

export default MarkdownPreview
