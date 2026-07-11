'use client'

import { unified, type PluggableList } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { normalizeRenderedHtmlImageSources } from '@/lib/remote-image-sources'
import { sanitizeRenderedHtml } from '@/lib/safe-html'

type RenderMarkdownToHtmlOptions = {
  remarkPlugins?: PluggableList
  rehypePlugins?: PluggableList
}

export async function renderMarkdownToSanitizedHtml(
  markdown: string,
  options: RenderMarkdownToHtmlOptions = {}
) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)

  if (options.remarkPlugins && options.remarkPlugins.length > 0) {
    processor.use(options.remarkPlugins)
  }

  processor.use(remarkRehype, { allowDangerousHtml: true })

  if (options.rehypePlugins && options.rehypePlugins.length > 0) {
    processor.use(options.rehypePlugins)
  }

  const result = await processor
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)

  return sanitizeRenderedHtml(normalizeRenderedHtmlImageSources(String(result)))
}

export default renderMarkdownToSanitizedHtml
