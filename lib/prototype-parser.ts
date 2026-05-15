import type { DocumentState, TreeNode } from '@/types/tree'

export interface PrototypeChecklistItem {
  label: string
  checked: boolean
}

export interface PrototypeInlineSegment {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  imageSrc?: string
}

export interface PrototypeTableRow {
  cells: string[]
}

export type PrototypeMarkdownBlock =
  | { type: 'paragraph'; id: string; segments: PrototypeInlineSegment[] }
  | { type: 'blockquote'; id: string; segments: PrototypeInlineSegment[] }
  | { type: 'list'; id: string; ordered: boolean; items: PrototypeInlineSegment[][] }
  | { type: 'checklist'; id: string; items: { checked: boolean; segments: PrototypeInlineSegment[] }[] }
  | { type: 'table'; id: string; headers: string[]; rows: PrototypeTableRow[] }
  | { type: 'code'; id: string; language?: string; code: string }

export type PrototypeBlock =
  | { type: 'markdown'; id: string; block: PrototypeMarkdownBlock }
  | { type: 'input'; id: string; label: string; placeholder?: string; inputType: string }
  | { type: 'textarea'; id: string; label: string; placeholder?: string }
  | {
      type: 'button'
      id: string
      text: string
      action?: string
      intent?: 'primary' | 'secondary'
      target?: string
      dialog?: string
    }
  | { type: 'toggle'; id: string; label: string; checked: boolean }
  | { type: 'tabs'; id: string; items: string[] }
  | { type: 'card'; id: string; title: string; description?: string }
  | { type: 'stat'; id: string; label: string; value: string }
  | { type: 'note'; id: string; content: PrototypeInlineSegment[] }

export interface PrototypeSection {
  id: string
  title: string
  level: number
  rawContent?: string
  blocks: PrototypeBlock[]
  children: PrototypeSection[]
}

export interface PrototypeDocument {
  title: string
  description?: string
  rootBlocks: PrototypeBlock[]
  sections: PrototypeSection[]
  interactiveCount: number
}

function normalizeContent(content?: string): string {
  return (content || '').replace(/\r\n/g, '\n').trim()
}

function parseAttributes(input: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([a-zA-Z][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g

  for (const match of input.matchAll(pattern)) {
    const [, key, doubleQuoted, singleQuoted, bare] = match
    attributes[key] = doubleQuoted ?? singleQuoted ?? bare ?? ''
  }

  return attributes
}

export function parseInlineSegments(text: string): PrototypeInlineSegment[] {
  const segments: PrototypeInlineSegment[] = []
  const tokenPattern = /(`[^`]+`|!\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0

  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0]
    const start = match.index ?? 0

    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start) })
    }

    const imageMatch = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)

    if (imageMatch) {
      segments.push({ text: imageMatch[1], imageSrc: imageMatch[2].trim() })
    } else if (token.startsWith('**') && token.endsWith('**')) {
      segments.push({ text: token.slice(2, -2), bold: true })
    } else if (token.startsWith('`') && token.endsWith('`')) {
      segments.push({ text: token.slice(1, -1), code: true })
    } else if (token.startsWith('*') && token.endsWith('*')) {
      segments.push({ text: token.slice(1, -1), italic: true })
    } else {
      segments.push({ text: token })
    }

    lastIndex = start + token.length
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) })
  }

  return segments.filter((segment) => segment.text.length > 0)
}

function parseProtoCommand(line: string, id: string): PrototypeBlock | null {
  const commandBody = line.replace(/^@proto\s+/, '').trim()
  if (!commandBody) {
    return null
  }

  const firstSpace = commandBody.indexOf(' ')
  const command = (firstSpace === -1 ? commandBody : commandBody.slice(0, firstSpace)).toLowerCase()
  const args = firstSpace === -1 ? '' : commandBody.slice(firstSpace + 1)
  const props = parseAttributes(args)

  switch (command) {
    case 'input':
      return {
        type: 'input',
        id,
        label: props.label || props.name || 'Input',
        placeholder: props.placeholder,
        inputType: props.type || 'text',
      }
    case 'textarea':
      return {
        type: 'textarea',
        id,
        label: props.label || props.name || 'Textarea',
        placeholder: props.placeholder,
      }
    case 'button':
      return {
        type: 'button',
        id,
        text: props.text || props.label || 'Continue',
        action: props.action,
        intent: props.intent === 'secondary' ? 'secondary' : 'primary',
        target: props.goto || props.target,
        dialog: props.dialog,
      }
    case 'toggle':
      return {
        type: 'toggle',
        id,
        label: props.label || props.text || 'Toggle',
        checked: props.checked === 'true',
      }
    case 'tabs':
      return {
        type: 'tabs',
        id,
        items: (props.items || '')
          .split('|')
          .map((item) => item.trim())
          .filter(Boolean),
      }
    case 'card':
      return {
        type: 'card',
        id,
        title: props.title || 'Card',
        description: props.description || props.desc,
      }
    case 'stat':
      return {
        type: 'stat',
        id,
        label: props.label || 'Metric',
        value: props.value || '--',
      }
    case 'note':
      return {
        type: 'note',
        id,
        content: parseInlineSegments(props.text || props.content || args || 'Note'),
      }
    default:
      return null
  }
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isTableSeparator(line: string): boolean {
  const cells = parseTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function parseContentBlocks(content: string, nodeId: string): PrototypeBlock[] {
  if (!content) {
    return []
  }

  const lines = content.split('\n')
  const blocks: PrototypeBlock[] = []
  let paragraphLines: string[] = []
  let blockIndex = 0

  const flushParagraph = () => {
    const text = paragraphLines.join(' ').replace(/\s+/g, ' ').trim()
    if (text) {
      blocks.push({
        type: 'markdown',
        id: `${nodeId}-paragraph-${blockIndex}`,
        block: {
          type: 'paragraph',
          id: `${nodeId}-paragraph-block-${blockIndex}`,
          segments: parseInlineSegments(text),
        },
      })
      blockIndex += 1
    }
    paragraphLines = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      continue
    }

    if (line.startsWith('@proto ')) {
      flushParagraph()
      const block = parseProtoCommand(line, `${nodeId}-proto-${blockIndex}`)
      if (block) {
        blocks.push(block)
        blockIndex += 1
      }
      continue
    }

    if (line.startsWith('```')) {
      flushParagraph()
      const language = line.replace(/^```/, '').trim() || undefined
      const codeLines: string[] = []
      let cursor = index + 1

      while (cursor < lines.length && !lines[cursor].trim().startsWith('```')) {
        codeLines.push(lines[cursor])
        cursor += 1
      }

      blocks.push({
        type: 'markdown',
        id: `${nodeId}-code-${blockIndex}`,
        block: {
          type: 'code',
          id: `${nodeId}-code-block-${blockIndex}`,
          language,
          code: codeLines.join('\n'),
        },
      })
      blockIndex += 1
      index = cursor
      continue
    }

    const checklistMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/)
    if (checklistMatch) {
      flushParagraph()
      const items: { checked: boolean; segments: PrototypeInlineSegment[] }[] = []
      let cursor = index

      while (cursor < lines.length) {
        const currentLine = lines[cursor].trim()
        const currentMatch = currentLine.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/)
        if (!currentMatch) {
          break
        }

        items.push({
          checked: currentMatch[1].toLowerCase() === 'x',
          segments: parseInlineSegments(currentMatch[2].trim()),
        })
        cursor += 1
      }

      blocks.push({
        type: 'markdown',
        id: `${nodeId}-checklist-${blockIndex}`,
        block: {
          type: 'checklist',
          id: `${nodeId}-checklist-block-${blockIndex}`,
          items,
        },
      })
      blockIndex += 1
      index = cursor - 1
      continue
    }

    const listMatch = line.match(/^([-*]|\d+\.)\s+(.+)$/)
    if (listMatch) {
      flushParagraph()
      const ordered = /\d+\./.test(listMatch[1])
      const items: PrototypeInlineSegment[][] = []
      let cursor = index

      while (cursor < lines.length) {
        const currentLine = lines[cursor].trim()
        const currentMatch = currentLine.match(/^([-*]|\d+\.)\s+(.+)$/)
        if (!currentMatch) {
          break
        }

        items.push(parseInlineSegments(currentMatch[2].trim()))
        cursor += 1
      }

      blocks.push({
        type: 'markdown',
        id: `${nodeId}-list-${blockIndex}`,
        block: {
          type: 'list',
          id: `${nodeId}-list-block-${blockIndex}`,
          ordered,
          items,
        },
      })
      blockIndex += 1
      index = cursor - 1
      continue
    }

    if (line.startsWith('> ')) {
      flushParagraph()
      const quoteLines: string[] = []
      let cursor = index

      while (cursor < lines.length) {
        const currentLine = lines[cursor].trim()
        if (!currentLine.startsWith('> ')) {
          break
        }

        quoteLines.push(currentLine.replace(/^>\s?/, '').trim())
        cursor += 1
      }

      blocks.push({
        type: 'markdown',
        id: `${nodeId}-quote-${blockIndex}`,
        block: {
          type: 'blockquote',
          id: `${nodeId}-quote-block-${blockIndex}`,
          segments: parseInlineSegments(quoteLines.join(' ')),
        },
      })
      blockIndex += 1
      index = cursor - 1
      continue
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1].trim())) {
      flushParagraph()
      const headers = parseTableRow(line)
      const rows: PrototypeTableRow[] = []
      let cursor = index + 2

      while (cursor < lines.length) {
        const currentLine = lines[cursor].trim()
        if (!currentLine || !currentLine.includes('|')) {
          break
        }

        rows.push({ cells: parseTableRow(currentLine) })
        cursor += 1
      }

      blocks.push({
        type: 'markdown',
        id: `${nodeId}-table-${blockIndex}`,
        block: {
          type: 'table',
          id: `${nodeId}-table-block-${blockIndex}`,
          headers,
          rows,
        },
      })
      blockIndex += 1
      index = cursor - 1
      continue
    }

    paragraphLines.push(rawLine)
  }

  flushParagraph()
  return blocks
}

function nodeToPrototypeSection(node: TreeNode): PrototypeSection {
  const rawContent = normalizeContent(node.content)
  const blocks = parseContentBlocks(rawContent, node.id)

  return {
    id: node.id,
    title: node.title,
    level: node.level,
    rawContent: rawContent || undefined,
    blocks,
    children: node.children.map(nodeToPrototypeSection),
  }
}

function countInteractiveBlocksInSection(section: PrototypeSection): number {
  const localCount = section.blocks.reduce((count, block) => {
    switch (block.type) {
      case 'input':
      case 'textarea':
      case 'button':
      case 'toggle':
      case 'tabs':
        return count + 1
      case 'markdown':
        return block.block.type === 'checklist' ? count + 1 : count
      default:
        return count
    }
  }, 0)

  return localCount + section.children.reduce((count, child) => count + countInteractiveBlocksInSection(child), 0)
}

export function parseDocumentToPrototype(document: DocumentState | null): PrototypeDocument | null {
  if (!document) {
    return null
  }

  const metadataTitle = typeof document.metadata?.title === 'string' ? document.metadata.title : undefined
  const title = metadataTitle || document.root.children[0]?.title || document.fileName || 'Interactive Prototype'
  const description = typeof document.metadata?.description === 'string' ? document.metadata.description : undefined
  const rootBlocks = parseContentBlocks(normalizeContent(document.root.content), document.root.id)
  const sections = document.root.children.map(nodeToPrototypeSection)
  const interactiveCount =
    sections.reduce((count, section) => count + countInteractiveBlocksInSection(section), 0) +
    rootBlocks.reduce((count, block) => {
      switch (block.type) {
        case 'input':
        case 'textarea':
        case 'button':
        case 'toggle':
        case 'tabs':
          return count + 1
        case 'markdown':
          return block.block.type === 'checklist' ? count + 1 : count
        default:
          return count
      }
    }, 0)

  return {
    title,
    description,
    rootBlocks,
    sections,
    interactiveCount,
  }
}

export default parseDocumentToPrototype
