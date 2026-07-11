export interface MarkdownOutlineHeading {
  level: number
  text: string
  line: number
  startOffset: number
}

function isFenceDelimiter(line: string) {
  const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/)
  if (!match) {
    return null
  }

  return {
    indent: match[1].length,
    marker: match[2][0],
    length: match[2].length,
  }
}

function normalizeHeadingText(rawText: string) {
  return rawText.replace(/[ \t]+#+[ \t]*$/, '').trim()
}

export function extractMarkdownOutlineHeadings(markdown: string): MarkdownOutlineHeading[] {
  if (!markdown) {
    return []
  }

  const lines = markdown.split('\n')
  const headings: MarkdownOutlineHeading[] = []
  let sourceOffset = 0
  let insideFrontmatter = false
  let frontmatterFence: '---' | '+++' | null = null
  let fenceState: { marker: string; length: number } | null = null

  if (lines.length > 0) {
    const firstLine = lines[0].trim()
    if (firstLine === '---' || firstLine === '+++') {
      insideFrontmatter = true
      frontmatterFence = firstLine
    }
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()

    if (insideFrontmatter) {
      if (index > 0 && (trimmed === frontmatterFence || trimmed === '...')) {
        insideFrontmatter = false
        frontmatterFence = null
      }
    } else {
      const fenceDelimiter = isFenceDelimiter(line)
      if (fenceDelimiter) {
        if (
          fenceState &&
          fenceDelimiter.marker === fenceState.marker &&
          fenceDelimiter.length >= fenceState.length
        ) {
          fenceState = null
        } else if (!fenceState) {
          fenceState = {
            marker: fenceDelimiter.marker,
            length: fenceDelimiter.length,
          }
        }
      } else if (!fenceState) {
        const match = line.match(/^(#{1,6})[ \t]+(.+?)\s*$/)
        if (match) {
          const text = normalizeHeadingText(match[2])
          if (text) {
            headings.push({
              level: match[1].length,
              text,
              line: index,
              startOffset: sourceOffset,
            })
          }
        }
      }
    }

    sourceOffset += line.length
    if (index < lines.length - 1) {
      sourceOffset += 1
    }
  })

  return headings
}
