'use client'

/**
 * Markdown预览组件
 *
 * 右侧预览面板，实时渲染Markdown内容
 * 支持三种专业主题模式：明亮/黑暗/阅读
 * 使用高对比度配色确保文字清晰可读
 *
 * 对应技术文档6.1节
 */

import { ScrollArea } from './ui/scroll-area'
import { useDocumentStore } from '@/stores/documentStore'
import { useThemeStore, themeConfigs, type ThemeMode } from '@/stores/themeStore'
import { useMemo } from 'react'

/**
 * 根据主题生成Markdown解析样式
 * 使用高对比度确保文字清晰可读
 */
function getMarkdownStyles(theme: ThemeMode): {
  heading1: string
  heading2: string
  heading3: string
  heading4: string
  heading5: string
  heading6: string
  paragraph: string
  strong: string
  em: string
  code: string
  codeBlock: string
  link: string
  list: string
  blockquote: string
  hr: string
} {
  const config = themeConfigs[theme]

  return {
    heading1: `text-4xl font-bold mt-8 mb-6 tracking-tight`,
    heading2: `text-3xl font-bold mt-8 mb-4 pb-2 border-b-2 tracking-tight`,
    heading3: `text-2xl font-semibold mt-6 mb-3 tracking-tight`,
    heading4: `text-xl font-semibold mt-6 mb-3 tracking-tight`,
    heading5: `text-lg font-semibold mt-4 mb-2 tracking-tight`,
    heading6: `text-base font-semibold mt-4 mb-2 tracking-tight`,
    paragraph: `leading-7 mb-5 text-base`,
    strong: `font-bold`,
    em: `italic`,
    code: `px-1.5 py-0.5 rounded text-sm font-mono`,
    codeBlock: `p-5 rounded-lg overflow-x-auto my-6`,
    link: `font-medium underline underline-offset-2 hover:opacity-80 transition-opacity`,
    list: `ml-6 mb-4 space-y-2`,
    blockquote: `border-l-4 pl-5 py-3 my-5 italic`,
    hr: `my-8 border-2`,
  }
}

/**
 * 简单的Markdown到HTML转换
 * 使用内联样式确保主题正确应用
 */
function parseMarkdownToHTML(markdown: string, theme: ThemeMode): string {
  const config = themeConfigs[theme]
  const styles = getMarkdownStyles(theme)

  // 移除YAML Front Matter
  let content = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '')

  // 简单的markdown到HTML转换
  let html = content
    // 代码块（需要在行内代码之前处理）
    .replace(/```(\w+)?\n([\s\S]*?)```/g, `<pre class="${styles.codeBlock}" style="background-color: ${config.code};"><code class="text-sm font-mono" style="color: ${config.text};">$2</code></pre>`)
    // 标题
    .replace(/^###### (.*$)/gim, `<h6 class="${styles.heading6}" style="color: ${config.heading};">$1</h6>`)
    .replace(/^##### (.*$)/gim, `<h5 class="${styles.heading5}" style="color: ${config.heading};">$1</h5>`)
    .replace(/^#### (.*$)/gim, `<h4 class="${styles.heading4}" style="color: ${config.heading};">$1</h4>`)
    .replace(/^### (.*$)/gim, `<h3 class="${styles.heading3}" style="color: ${config.heading};">$1</h3>`)
    .replace(/^## (.*$)/gim, `<h2 class="${styles.heading2}" style="color: ${config.heading}; border-color: ${config.border};">$1</h2>`)
    .replace(/^# (.*$)/gim, `<h1 class="${styles.heading1}" style="color: ${config.heading};">$1</h1>`)
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, `<strong class="${styles.strong}" style="color: ${config.heading};">$1</strong>`)
    // 斜体
    .replace(/\*(.+?)\*/g, `<em class="${styles.em}" style="color: ${config.muted};">$1</em>`)
    // 行内代码
    .replace(/`(.+?)`/g, `<code class="${styles.code}" style="background-color: ${config.code}; color: ${config.heading};">$1</code>`)
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer" class="${styles.link}" style="color: ${config.link};">$1</a>`)
    // 图片
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<img alt="$1" src="$2" class="rounded-lg max-w-full h-auto my-6 shadow-lg" />`)
    // 无序列表
    .replace(/^\- (.+)$/gim, `<li class="${styles.list}" style="color: ${config.text};">$1</li>`)
    // 有序列表
    .replace(/^\d+\. (.+)$/gim, `<li class="${styles.list}" style="color: ${config.text};">$1</li>`)
    // 引用
    .replace(/^> (.+)$/gim, `<blockquote class="${styles.blockquote}" style="border-color: ${config.accent}; background-color: ${config.code}; color: ${config.text};">$1</blockquote>`)
    // 水平线
    .replace(/^---$/gim, `<hr class="${styles.hr}" style="border-color: ${config.border};" />`)
    // 段落
    .replace(/\n\n/g, `</p><p class="${styles.paragraph}" style="color: ${config.text};">`)

  // 包装段落
  html = `<p class="${styles.paragraph}" style="color: ${config.text};">` + html + '</p>'

  // 清理
  html = html
    .replace(new RegExp(`<p class="${styles.paragraph}" style="color: ${config.text};"><h`, 'g'), '<h')
    .replace(/<\/h([1-6])><\/p>/g, '</h$1>')
    .replace(new RegExp(`<p class="${styles.paragraph}" style="color: ${config.text};"><pre`, 'g'), '<pre')
    .replace(/<\/pre><\/p>/g, '</pre>')
    .replace(new RegExp(`<p class="${styles.paragraph}" style="color: ${config.text};"><blockquote`, 'g'), '<blockquote')
    .replace(/<\/blockquote><\/p>/g, '</blockquote>')
    .replace(new RegExp(`<p class="${styles.paragraph}" style="color: ${config.text};"><hr`, 'g'), '<hr')
    .replace(/<hr \/>><\/p>/g, '<hr />')
    .replace(new RegExp(`<p class="${styles.paragraph}" style="color: ${config.text};"><\/p>`, 'g'), '')

  // 包装列表
  html = html.replace(/(<li class="[^"]*" style="[^"]*">[\s\S]*?<\/li>)/, `<ul class="list-disc list-inside mb-4 space-y-2">$1</ul>`)

  return html
}

export function MarkdownPreview() {
  const { document } = useDocumentStore()
  const { theme, getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

  // 从Store获取当前Markdown
  const store = useDocumentStore.getState()
  const markdown = store.getCurrentMarkdown()

  // 使用useMemo缓存HTML解析结果
  const html = useMemo(() => {
    return parseMarkdownToHTML(markdown, theme)
  }, [markdown, theme])

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
      <ScrollArea className="flex-1 h-[calc(100vh-3.5rem)]">
        <div className="p-8 max-w-none">
          <article
            className="prose max-w-none prose-lg"
            style={{
              color: themeConfig.text,
              fontSize: '16px',
              lineHeight: '1.75',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </ScrollArea>
    </div>
  )
}

export default MarkdownPreview
