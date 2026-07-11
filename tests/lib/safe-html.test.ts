/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import { sanitizeRenderedHtml, sanitizeRenderedSvg } from '@/lib/safe-html'

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

  it('preserves data attributes used by preview sync anchors', () => {
    const html = '<p data-source-start="12" data-source-end="34">anchor</p>'
    const sanitized = sanitizeRenderedHtml(html)

    expect(sanitized).toContain('data-source-start="12"')
    expect(sanitized).toContain('data-source-end="34"')
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

  it('sanitizes rendered svg while preserving safe styling markup', () => {
    const svg = [
      '<svg onload="alert(1)">',
      '<style>.node{fill:#fff;}</style>',
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml" onclick="alert(1)">safe<br/>label</div></foreignObject>',
      '<g style="fill:#000"><text>Hello</text></g>',
      '</svg>',
    ].join('')

    const sanitized = sanitizeRenderedSvg(svg)

    expect(sanitized).toContain('<svg>')
    expect(sanitized).toContain('<style>.node{fill:#fff;}</style>')
    expect(sanitized).toContain('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">safe<br />label</div></foreignObject>')
    expect(sanitized).toContain('<g style="fill:#000"><text>Hello</text></g>')
    expect(sanitized).not.toContain('onload')
    expect(sanitized).not.toContain('onclick')
  })

  it('preserves multi-node flowchart labels inside multiple foreignObject blocks', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<g class="nodes">',
      '<foreignObject width="120" height="40"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>📄 .ts 文件<br/>TypeScript源码</p></span></div></foreignObject>',
      '<foreignObject width="120" height="24"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>⚙️ tsc 编译器</p></span></div></foreignObject>',
      '<foreignObject width="140" height="40"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel"><p>🔍 类型检查<br/>(编译时)</p></span></div></foreignObject>',
      '</g>',
      '</svg>',
    ].join('')

    const sanitized = sanitizeRenderedSvg(svg)

    expect(sanitized).toContain('📄 .ts 文件')
    expect(sanitized).toContain('TypeScript源码')
    expect(sanitized).toContain('⚙️ tsc 编译器')
    expect(sanitized).toContain('🔍 类型检查')
    expect(sanitized).toContain('(编译时)')
    expect((sanitized.match(/<foreignObject/g) || []).length).toBe(3)
  })

  it('preserves sequence diagram text nodes and strips inline event handlers', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<g class="actors"><text onclick="alert(1)"><tspan>Alice</tspan></text><text><tspan>Bob</tspan></text></g>',
      '<g class="messages"><text><tspan>Hello Bob</tspan></text><text><tspan>Hi Alice</tspan></text></g>',
      '</svg>',
    ].join('')

    const sanitized = sanitizeRenderedSvg(svg)

    expect(sanitized).toContain('<tspan>Alice</tspan>')
    expect(sanitized).toContain('<tspan>Bob</tspan>')
    expect(sanitized).toContain('<tspan>Hello Bob</tspan>')
    expect(sanitized).toContain('<tspan>Hi Alice</tspan>')
    expect(sanitized).not.toContain('onclick')
  })

  it('preserves ER diagram entity labels and relationship text', () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<g class="er entityBox"><text><tspan>User</tspan></text><text><tspan>id PK</tspan></text><text><tspan>name</tspan></text></g>',
      '<g class="er relationshipLabel"><text><tspan>places</tspan></text></g>',
      '<g class="er entityBox"><text><tspan>Order</tspan></text><text><tspan>id PK</tspan></text><text><tspan>user_id FK</tspan></text></g>',
      '</svg>',
    ].join('')

    const sanitized = sanitizeRenderedSvg(svg)

    expect(sanitized).toContain('<tspan>User</tspan>')
    expect(sanitized).toContain('<tspan>Order</tspan>')
    expect(sanitized).toContain('<tspan>places</tspan>')
    expect(sanitized).toContain('<tspan>user_id FK</tspan>')
  })
})
