/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import {
  createMarkdownHeadingSlug,
  findMarkdownAnchorTarget,
} from '@/lib/markdown-heading-anchors'

describe('createMarkdownHeadingSlug', () => {
  it('creates github-like slugs for mixed language headings', () => {
    expect(createMarkdownHeadingSlug('快速开始')).toBe('快速开始')
    expect(createMarkdownHeadingSlug('为什么选择 VisualMD')).toBe('为什么选择-visualmd')
    expect(createMarkdownHeadingSlug('AI & Git')).toBe('ai--git')
    expect(createMarkdownHeadingSlug('Café Guide')).toBe('cafe-guide')
  })
})

describe('findMarkdownAnchorTarget', () => {
  it('matches heading ids, raw heading text, and normalized hash fragments', () => {
    document.body.innerHTML = [
      '<article>',
      '<h2 id="quick-start">Quick Start</h2>',
      '<h2 id="why-choose-visualmd">Why Choose VisualMD</h2>',
      '<h2 id="为什么选择-visualmd">为什么选择 VisualMD</h2>',
      '<h2 id="ai--git">AI &amp; Git</h2>',
      '<div id="custom-anchor">Custom target</div>',
      '</article>',
    ].join('')

    const article = document.querySelector('article')
    expect(article).not.toBeNull()
    if (!article) {
      return
    }

    expect(findMarkdownAnchorTarget(article, '#quick-start')?.id).toBe('quick-start')
    expect(findMarkdownAnchorTarget(article, '#Quick Start')?.id).toBe('quick-start')
    expect(findMarkdownAnchorTarget(article, '#Why Choose -visualmd')?.id).toBe('why-choose-visualmd')
    expect(findMarkdownAnchorTarget(article, '#为什么选择-visualmd')?.id).toBe('为什么选择-visualmd')
    expect(findMarkdownAnchorTarget(article, '#ai--git')?.id).toBe('ai--git')
    expect(findMarkdownAnchorTarget(article, '#custom-anchor')?.id).toBe('custom-anchor')
  })
})
