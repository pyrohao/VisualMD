/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import { renderMarkdownToSanitizedHtml } from '@/lib/render-markdown-html'

describe('renderMarkdownToSanitizedHtml', () => {
  it('sanitizes raw embedded html after markdown rendering', async () => {
    const markdown = [
      '# Title',
      '<script>alert(1)</script>',
      '<img src="x" onerror="alert(1)" alt="demo" />',
      '',
      '[link](javascript:alert(1))',
    ].join('\n')

    const html = await renderMarkdownToSanitizedHtml(markdown)

    expect(html).toContain('<h1>Title</h1>')
    expect(html).not.toContain('<script')
    expect(html).toContain('<img src="x" alt="demo">')
    expect(html).toContain('<a>link</a>')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })

  it('keeps mermaid fences as inert code blocks before any svg rendering step', async () => {
    const markdown = ['```mermaid', 'graph TD', 'A-->B', '```'].join('\n')

    const html = await renderMarkdownToSanitizedHtml(markdown)

    expect(html).toContain('<pre><code class="language-mermaid">graph TD')
    expect(html).not.toContain('<svg')
  })

  it('supports optional remark and rehype plugins before final sanitization', async () => {
    const markdown = '$$c = \\\\pm\\sqrt{a^2 + b^2}$$'

    const html = await renderMarkdownToSanitizedHtml(markdown, {
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    })

    expect(html).toContain('katex')
  })

  it('supports remark plugins that inject data attributes for rendered blocks', async () => {
    const { createMarkdownSourceAnchorPlugin } = await import('@/lib/markdown-preview-anchors')
    const markdown = ['# Title', '', 'Paragraph'].join('\n')

    const html = await renderMarkdownToSanitizedHtml(markdown, {
      remarkPlugins: [createMarkdownSourceAnchorPlugin()],
    })

    expect(html).toContain('data-source-start=')
    expect(html).toContain('<h1 data-source-start="0"')
  })

  it('supports heading anchor ids for markdown hash links', async () => {
    const { createMarkdownHeadingAnchorPlugin } = await import('@/lib/markdown-heading-anchors')
    const markdown = [
      '## 快速开始',
      '',
      '## 为什么选择 VisualMD',
      '',
      '## AI & Git',
      '',
      '## AI & Git',
    ].join('\n')

    const html = await renderMarkdownToSanitizedHtml(markdown, {
      remarkPlugins: [createMarkdownHeadingAnchorPlugin()],
    })

    expect(html).toContain('id="快速开始"')
    expect(html).toContain('id="为什么选择-visualmd"')
    expect(html).toContain('id="ai--git"')
    expect(html).toContain('id="ai--git-1"')
  })
})
