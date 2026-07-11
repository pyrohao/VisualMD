import { visit } from 'unist-util-visit'
import { getPreviewMarkdownBody } from '@/lib/markdown-preview-highlight'

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

const BLOCK_ANCHOR_NODE_TYPES = new Set([
  'heading',
  'paragraph',
  'blockquote',
  'list',
  'listItem',
  'table',
  'code',
  'thematicBreak',
  'html',
])

function setNodeAnchorProperties(node: NodeWithPosition) {
  const startOffset = node.position?.start?.offset
  const endOffset = node.position?.end?.offset

  if (typeof startOffset !== 'number' || typeof endOffset !== 'number' || endOffset <= startOffset) {
    return
  }

  node.data = node.data || {}
  node.data.hProperties = node.data.hProperties || {}
  node.data.hProperties['data-source-start'] = String(startOffset)
  node.data.hProperties['data-source-end'] = String(endOffset)
}

export function createMarkdownSourceAnchorPlugin() {
  return function markdownSourceAnchorPlugin() {
    return function transform(tree: unknown) {
      visit(tree as Parameters<typeof visit>[0], (node: NodeWithPosition) => {
        if (!BLOCK_ANCHOR_NODE_TYPES.has(node.type || '')) {
          return
        }

        setNodeAnchorProperties(node)
      })
    }
  }
}

export function getPreviewBodyOffset(markdown: string) {
  return getPreviewMarkdownBody(markdown).bodyOffset
}
