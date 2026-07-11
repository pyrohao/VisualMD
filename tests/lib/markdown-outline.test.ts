import { describe, expect, it } from 'vitest'
import { extractMarkdownOutlineHeadings } from '@/lib/markdown-outline'

describe('extractMarkdownOutlineHeadings', () => {
  it('extracts heading offsets while skipping frontmatter and fenced code blocks', () => {
    const markdown = [
      '---',
      'title: Demo',
      '---',
      '',
      '# Real Heading',
      '',
      '```md',
      '# Not a heading',
      '```',
      '',
      '## Next Heading ##',
    ].join('\n')

    expect(extractMarkdownOutlineHeadings(markdown)).toEqual([
      {
        level: 1,
        text: 'Real Heading',
        line: 4,
        startOffset: 21,
      },
      {
        level: 2,
        text: 'Next Heading',
        line: 10,
        startOffset: 64,
      },
    ])
  })
})
