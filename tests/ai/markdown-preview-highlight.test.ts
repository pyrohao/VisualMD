import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import {
  createMarkdownReferenceHighlightPlugin,
  MARKDOWN_REFERENCE_HIGHLIGHT_CLASS,
  resolvePreviewHighlightRanges,
} from '@/lib/markdown-preview-highlight'

async function renderMarkdownWithHighlight(markdown: string, ranges: { startOffset: number; endOffset: number }[]) {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(createMarkdownReferenceHighlightPlugin(ranges))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)

  return String(result)
}

describe('markdown-preview-highlight', () => {
  it('resolves reference ranges against the preview body after front matter removal', () => {
    const markdown = '---\ntitle: Demo\n---\n# Title\n\nFirst target paragraph.\n\nSecond paragraph.'
    const startOffset = markdown.indexOf('target')
    const { body, ranges } = resolvePreviewHighlightRanges(markdown, [
      {
        expectedText: 'target',
        startOffset,
        endOffset: startOffset + 'target'.length,
      },
    ])

    expect(body.startsWith('# Title')).toBe(true)
    expect(ranges).toEqual([
      {
        startOffset: body.indexOf('target'),
        endOffset: body.indexOf('target') + 'target'.length,
      },
    ])
  })

  it('marks only the rendered text segment that overlaps a reference range', async () => {
    const markdown = '# Title\n\nFirst target paragraph.\n\nSecond paragraph.'
    const startOffset = markdown.indexOf('target')
    const html = await renderMarkdownWithHighlight(markdown, [
      {
        startOffset,
        endOffset: startOffset + 'target'.length,
      },
    ])

    expect(html).toContain(`class="${MARKDOWN_REFERENCE_HIGHLIGHT_CLASS}"`)
    expect(html).toContain(`<p>First <span class="${MARKDOWN_REFERENCE_HIGHLIGHT_CLASS}">target</span> paragraph.</p>`)
  })

  it('marks visible text across a heading and list from source offsets', async () => {
    const markdown = '#### 使用说明\n\n1. xxxx\n2. xxxx\n3. xxxx\n\n#### 参与贡献'
    const startOffset = 0
    const endOffset = markdown.indexOf('\n\n#### 参与贡献')
    const html = await renderMarkdownWithHighlight(markdown, [
      {
        startOffset,
        endOffset,
      },
    ])

    expect(html).toContain(`<h4><span class="${MARKDOWN_REFERENCE_HIGHLIGHT_CLASS}">使用说明</span></h4>`)
    expect(html).toContain(`<li><span class="${MARKDOWN_REFERENCE_HIGHLIGHT_CLASS}">xxxx</span></li>`)
    expect(html).toContain('<h4>参与贡献</h4>')
  })
})
