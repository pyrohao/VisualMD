import { visit } from 'unist-util-visit'

export const MARKDOWN_HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6'

interface HeadingNode {
  type?: string
  value?: string
  alt?: string
  children?: HeadingNode[]
  data?: {
    hProperties?: Record<string, unknown>
  }
}

function getHeadingTextContent(node: HeadingNode): string {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'html') {
    return node.value || ''
  }

  if (node.type === 'image') {
    return node.alt || ''
  }

  if (node.type === 'break') {
    return ' '
  }

  return (node.children || []).map(getHeadingTextContent).join('')
}

export function normalizeMarkdownHeadingText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function createMarkdownHeadingSlug(value: string) {
  const normalized = normalizeMarkdownHeadingText(value).toLowerCase()
  if (!normalized) {
    return ''
  }

  return normalized
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s/g, '-')
    .replace(/^-+|-+$/g, '')
}

function decodeHashFragment(value: string) {
  const fragment = value.startsWith('#') ? value.slice(1) : value
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

function createAnchorLookupCandidates(value: string) {
  const decoded = decodeHashFragment(value)
  const normalized = normalizeMarkdownHeadingText(decoded)
  if (!normalized) {
    return []
  }

  const hyphenCompacted = normalized.replace(/\s*-\s*/g, '-')
  const candidates = new Set<string>()

  for (const candidate of [decoded, normalized, normalized.toLowerCase(), hyphenCompacted]) {
    const nextValue = normalizeMarkdownHeadingText(candidate)
    if (!nextValue) {
      continue
    }

    candidates.add(nextValue)
    candidates.add(nextValue.toLowerCase())

    const slug = createMarkdownHeadingSlug(nextValue)
    if (slug) {
      candidates.add(slug)
    }
  }

  return Array.from(candidates)
}

function getHeadingLookupCandidates(heading: HTMLElement) {
  const text = normalizeMarkdownHeadingText(heading.textContent || '')
  if (!text) {
    return []
  }

  const candidates = new Set<string>()
  candidates.add(text)
  candidates.add(text.toLowerCase())

  if (heading.id) {
    candidates.add(heading.id)
    candidates.add(heading.id.toLowerCase())
  }

  const slug = createMarkdownHeadingSlug(text)
  if (slug) {
    candidates.add(slug)
  }

  return Array.from(candidates)
}

export function findMarkdownAnchorTarget(root: ParentNode, value: string) {
  const candidates = createAnchorLookupCandidates(value)
  if (candidates.length === 0) {
    return null
  }

  const elementsWithId = Array.from(root.querySelectorAll<HTMLElement>('[id]'))
  for (const candidate of candidates) {
    const exactMatch = elementsWithId.find((element) => element.id === candidate)
    if (exactMatch) {
      return exactMatch
    }
  }

  const headings = Array.from(root.querySelectorAll<HTMLElement>(MARKDOWN_HEADING_SELECTOR))
  for (const heading of headings) {
    const headingCandidates = getHeadingLookupCandidates(heading)
    if (candidates.some((candidate) => headingCandidates.includes(candidate))) {
      return heading
    }
  }

  return null
}

export function createMarkdownHeadingAnchorPlugin() {
  return function markdownHeadingAnchorPlugin() {
    return function transform(tree: unknown) {
      const slugCounts = new Map<string, number>()

      visit(tree as Parameters<typeof visit>[0], (node: HeadingNode) => {
        if (node.type !== 'heading') {
          return
        }

        const text = normalizeMarkdownHeadingText(getHeadingTextContent(node))
        const baseSlug = createMarkdownHeadingSlug(text) || 'section'
        const count = slugCounts.get(baseSlug) || 0
        slugCounts.set(baseSlug, count + 1)

        node.data = node.data || {}
        node.data.hProperties = node.data.hProperties || {}
        node.data.hProperties.id = count === 0 ? baseSlug : `${baseSlug}-${count}`
      })
    }
  }
}
