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
  value?: string
  children?: NodeWithPosition[]
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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

function appendClassName(value: unknown, className: string) {
  if (Array.isArray(value)) {
    return value.includes(className) ? value : [...value, className]
  }

  if (typeof value === 'string') {
    return value.split(/\s+/).includes(className) ? value : `${value} ${className}`.trim()
  }

  return className
}

function getNodeRange(node: NodeWithPosition): MarkdownHighlightRange | null {
  const startOffset = node.position?.start?.offset
  const endOffset = node.position?.end?.offset
  if (typeof startOffset !== 'number' || typeof endOffset !== 'number' || endOffset <= startOffset) {
    return null
  }

  return { startOffset, endOffset }
}

function addNodeClass(node: NodeWithPosition, className: string) {
  node.data = node.data || {}
  node.data.hProperties = node.data.hProperties || {}
  node.data.hProperties.className = appendClassName(node.data.hProperties.className, className)
}

function mergeHighlightSegments(segments: MarkdownHighlightRange[]) {
  const sorted = segments
    .filter((segment) => segment.endOffset > segment.startOffset)
    .sort((left, right) => left.startOffset - right.startOffset)

  return sorted.reduce<MarkdownHighlightRange[]>((merged, segment) => {
    const previous = merged.at(-1)
    if (!previous || segment.startOffset > previous.endOffset) {
      merged.push({ ...segment })
      return merged
    }

    previous.endOffset = Math.max(previous.endOffset, segment.endOffset)
    return merged
  }, [])
}

function buildHighlightedTextNodes(node: NodeWithPosition, ranges: MarkdownHighlightRange[]) {
  const nodeRange = getNodeRange(node)
  const value = node.value || ''
  if (!nodeRange || !value) return null

  const sourceLength = nodeRange.endOffset - nodeRange.startOffset
  const sourceMapsToValue = sourceLength === value.length
  const overlappingRanges = ranges.filter((range) => rangesOverlap(nodeRange, range))
  if (!overlappingRanges.length) return null

  if (!sourceMapsToValue) {
    const coversWholeNode = overlappingRanges.some(
      (range) => range.startOffset <= nodeRange.startOffset && range.endOffset >= nodeRange.endOffset
    )
    if (!coversWholeNode) return null

    return [
      {
        type: 'html',
        value: `<span class="${MARKDOWN_REFERENCE_HIGHLIGHT_CLASS}">${escapeHtml(value)}</span>`,
      },
    ] satisfies NodeWithPosition[]
  }

  const highlightSegments = mergeHighlightSegments(
    overlappingRanges.map((range) => ({
      startOffset: Math.max(0, range.startOffset - nodeRange.startOffset),
      endOffset: Math.min(value.length, range.endOffset - nodeRange.startOffset),
    }))
  )

  if (!highlightSegments.length) return null

  const nextNodes: NodeWithPosition[] = []
  let cursor = 0

  for (const segment of highlightSegments) {
    if (segment.startOffset > cursor) {
      nextNodes.push({
        type: 'text',
        value: value.slice(cursor, segment.startOffset),
      })
    }

    nextNodes.push({
      type: 'html',
      value: `<span class="${MARKDOWN_REFERENCE_HIGHLIGHT_CLASS}">${escapeHtml(
        value.slice(segment.startOffset, segment.endOffset)
      )}</span>`,
    })
    cursor = segment.endOffset
  }

  if (cursor < value.length) {
    nextNodes.push({
      type: 'text',
      value: value.slice(cursor),
    })
  }

  return nextNodes
}

function applyInlineHighlights(node: NodeWithPosition, ranges: MarkdownHighlightRange[]) {
  if (!node.children?.length) return

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index]

    if (child.type === 'text') {
      const replacement = buildHighlightedTextNodes(child, ranges)
      if (replacement) {
        node.children.splice(index, 1, ...replacement)
        index += replacement.length - 1
      }
      continue
    }

    applyInlineHighlights(child, ranges)
  }
}

function isAtomicHighlightNode(node: NodeWithPosition) {
  return ['code', 'inlineCode', 'image'].includes(node.type || '')
}

export function createMarkdownReferenceHighlightPlugin(ranges: MarkdownHighlightRange[]) {
  return function markdownReferenceHighlightPlugin() {
    return function transform(tree: unknown) {
      if (ranges.length === 0) return

      applyInlineHighlights(tree as NodeWithPosition, ranges)

      visit(tree as Parameters<typeof visit>[0], (node: NodeWithPosition) => {
        if (!isAtomicHighlightNode(node)) return
        const nodeRange = getNodeRange(node)
        if (!nodeRange) return
        if (!ranges.some((range) => rangesOverlap(nodeRange, range))) return

        addNodeClass(node, MARKDOWN_REFERENCE_HIGHLIGHT_CLASS)
      })
    }
  }
}
