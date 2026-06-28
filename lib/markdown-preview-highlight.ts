import { visit } from 'unist-util-visit'

export const MARKDOWN_REFERENCE_HIGHLIGHT_CLASS = 'visualmd-reference-highlight'

export interface MarkdownHighlightRange {
  startOffset: number
  endOffset: number
}

export interface MarkdownReferenceRangeSource {
  expectedText: string
  startOffset: number
  endOffset: number
}

interface NodeWithPosition {
  type?: string
  position?: {
    start?: {
      offset?: number
    }
    end?: {
      offset?: number
    }
  }
  data?: {
    hProperties?: Record<string, unknown>
  }
}

export function getPreviewMarkdownBody(markdown: string) {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  const bodyOffset = match?.[0]?.length || 0
  return {
    body: markdown.slice(bodyOffset),
    bodyOffset,
  }
}

function findAllTextRanges(content: string, text: string): MarkdownHighlightRange[] {
  if (!text) return []

  const ranges: MarkdownHighlightRange[] = []
  let index = content.indexOf(text)

  while (index >= 0) {
    ranges.push({
      startOffset: index,
      endOffset: index + text.length,
    })
    index = content.indexOf(text, index + Math.max(1, text.length))
  }

  return ranges
}

function resolveReferenceRange(markdown: string, reference: MarkdownReferenceRangeSource): MarkdownHighlightRange | null {
  if (!reference.expectedText) return null

  const exactStart = Math.max(0, reference.startOffset)
  const exactEnd = Math.max(exactStart, reference.endOffset)
  if (markdown.slice(exactStart, exactEnd) === reference.expectedText) {
    return {
      startOffset: exactStart,
      endOffset: exactEnd,
    }
  }

  const matches = findAllTextRanges(markdown, reference.expectedText)
  if (matches.length === 0) return null
  if (matches.length === 1) return matches[0]

  return matches.reduce((best, candidate) => {
    const bestDistance = Math.abs(best.startOffset - reference.startOffset)
    const candidateDistance = Math.abs(candidate.startOffset - reference.startOffset)
    return candidateDistance < bestDistance ? candidate : best
  }, matches[0])
}

export function resolvePreviewHighlightRanges(
  markdown: string,
  references: MarkdownReferenceRangeSource[]
): { body: string; ranges: MarkdownHighlightRange[] } {
  const { body, bodyOffset } = getPreviewMarkdownBody(markdown)
  const ranges = references
    .map((reference) => resolveReferenceRange(markdown, reference))
    .filter((range): range is MarkdownHighlightRange => range !== null)
    .map((range) => ({
      startOffset: Math.max(0, range.startOffset - bodyOffset),
      endOffset: Math.min(body.length, range.endOffset - bodyOffset),
    }))
    .filter((range) => range.endOffset > range.startOffset)

  return { body, ranges }
}

function rangesOverlap(left: MarkdownHighlightRange, right: MarkdownHighlightRange) {
  return left.startOffset < right.endOffset && left.endOffset > right.startOffset
}

function isHighlightableMarkdownNode(node: NodeWithPosition) {
  return ['heading', 'paragraph', 'code', 'html', 'table', 'thematicBreak'].includes(node.type || '')
}

function appendClassName(value: unknown, className: string) {
  if (Array.isArray(value)) {
    return value.includes(className) ? value : [...value, className]
  }

  if (typeof value === 'string') {
    return value.split(/\s+/).includes(className) ? value : `${value} ${className}`.trim()
  }

  return className
}

export function createMarkdownReferenceHighlightPlugin(ranges: MarkdownHighlightRange[]) {
  return function markdownReferenceHighlightPlugin() {
    return function transform(tree: unknown) {
      if (ranges.length === 0) return

      visit(tree as Parameters<typeof visit>[0], (node: NodeWithPosition) => {
        if (!isHighlightableMarkdownNode(node)) return

        const startOffset = node.position?.start?.offset
        const endOffset = node.position?.end?.offset
        if (typeof startOffset !== 'number' || typeof endOffset !== 'number') return

        const nodeRange = { startOffset, endOffset }
        if (!ranges.some((range) => rangesOverlap(nodeRange, range))) return

        node.data = node.data || {}
        node.data.hProperties = node.data.hProperties || {}
        node.data.hProperties.className = appendClassName(
          node.data.hProperties.className,
          MARKDOWN_REFERENCE_HIGHLIGHT_CLASS
        )
      })
    }
  }
}
