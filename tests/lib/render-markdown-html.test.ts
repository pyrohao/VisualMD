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
})
