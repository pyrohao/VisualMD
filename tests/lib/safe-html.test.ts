/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { sanitizeRenderedHtml } from '@/lib/safe-html'

describe('sanitizeRenderedHtml', () => {
  it('removes script tags entirely', () => {
    const html = '<p>Hello</p><script>alert(1)</script><p>World</p>'

    expect(sanitizeRenderedHtml(html)).toBe('<p>Hello</p><p>World</p>')
  })

  it('removes iframe tags entirely', () => {
    const html = '<p>Before</p><iframe src="https://evil.example"></iframe><p>After</p>'
    const sanitized = sanitizeRenderedHtml(html)

    expect(sanitized).not.toContain('<iframe')
    expect(sanitized).toContain('<p>Before</p>')
    expect(sanitized).toContain('<p>After</p>')
  })

  it('preserves safe svg markup while removing inline event payloads', () => {
    const html = '<svg onload="alert(1)"><circle cx="5" cy="5" r="4" /></svg><p onclick="alert(1)">safe</p>'
    const sanitized = sanitizeRenderedHtml(html)

    expect(sanitized).not.toContain('onload')
    expect(sanitized).not.toContain('onclick')
    expect(sanitized).toContain('<svg><circle cx="5" cy="5" r="4"></circle></svg>')
    expect(sanitized).toContain('<p>safe</p>')
  })

  it('removes object and embed tags entirely', () => {
    const html = '<object data="evil.swf"></object><embed src="evil.swf"><p>ok</p>'
    const sanitized = sanitizeRenderedHtml(html)

    expect(sanitized).not.toContain('<object')
    expect(sanitized).not.toContain('<embed')
    expect(sanitized).toContain('<p>ok</p>')
  })

  it('removes form tags and dangerous action targets', () => {
    const html = '<form action="https://evil.example"><input name="x"></form><p>ok</p>'
    const sanitized = sanitizeRenderedHtml(html)

    expect(sanitized).not.toContain('<form')
    expect(sanitized).not.toContain('<input')
    expect(sanitized).toContain('<p>ok</p>')
  })

  it('removes dangerous javascript urls and event handlers', () => {
    const html = [
      '<a href="javascript:alert(1)" onclick="alert(1)">bad link</a>',
      '<img src="x" onerror="alert(1)" alt="demo">',
    ].join('')
    const sanitized = sanitizeRenderedHtml(html)

    expect(sanitized).toContain('<a>bad link</a>')
    expect(sanitized).toContain('<img src="x" alt="demo">')
    expect(sanitized).not.toContain('javascript:')
    expect(sanitized).not.toContain('onerror')
    expect(sanitized).not.toContain('onclick')
  })

  it('preserves safe markdown-like html structures', () => {
    const html = [
      '<h2>Title</h2>',
      '<p><strong>Bold</strong> <em>Italic</em> <code>code</code></p>',
      '<ul><li>one</li><li>two</li></ul>',
      '<blockquote>quote</blockquote>',
      '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>',
      '<a href="https://example.com" target="_blank">link</a>',
      '<img src="data:image/png;base64,aaaa" alt="img">',
    ].join('')
    const sanitized = sanitizeRenderedHtml(html)

    expect(sanitized).toContain('<h2>Title</h2>')
    expect(sanitized).toContain('<strong>Bold</strong>')
    expect(sanitized).toContain('<em>Italic</em>')
    expect(sanitized).toContain('<code>code</code>')
    expect(sanitized).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(sanitized).toContain('<blockquote>quote</blockquote>')
    expect(sanitized).toContain('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>')
    expect(sanitized).toContain('href="https://example.com"')
    expect(sanitized).toContain('target="_blank"')
    expect(sanitized).toContain('rel="noopener noreferrer"')
    expect(sanitized).toContain('<img src="data:image/png;base64,aaaa" alt="img">')
  })

  it('removes unsafe data urls from links while keeping image data urls', () => {
    const html = [
      '<a href="data:text/html,<script>alert(1)</script>">payload</a>',
      '<img src="data:image/svg+xml;base64,PHN2Zy8+" alt="vector">',
    ].join('')
    const sanitized = sanitizeRenderedHtml(html)

    expect(sanitized).toContain('<a>payload</a>')
    expect(sanitized).toContain('<img src="data:image/svg+xml;base64,PHN2Zy8+" alt="vector">')
  })
})
