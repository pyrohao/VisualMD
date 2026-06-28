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

  it('marks the rendered markdown block that overlaps a reference range', async () => {
    const markdown = '# Title\n\nFirst target paragraph.\n\nSecond paragraph.'
    const startOffset = markdown.indexOf('target')
    const html = await renderMarkdownWithHighlight(markdown, [
      {
        startOffset,
        endOffset: startOffset + 'target'.length,
      },
    ])

    expect(html).toContain(`class="${MARKDOWN_REFERENCE_HIGHLIGHT_CLASS}"`)
    expect(html).toContain(`<p class="${MARKDOWN_REFERENCE_HIGHLIGHT_CLASS}">First target paragraph.</p>`)
  })
})
