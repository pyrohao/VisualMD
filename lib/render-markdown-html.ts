'use client'

import { unified, type PluggableList } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
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

  for (const plugin of options.remarkPlugins || []) {
    processor.use(plugin)
  }

  processor.use(remarkRehype, { allowDangerousHtml: true })

  for (const plugin of options.rehypePlugins || []) {
    processor.use(plugin)
  }

  const result = await processor
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown)

  return sanitizeRenderedHtml(String(result))
}

export default renderMarkdownToSanitizedHtml
