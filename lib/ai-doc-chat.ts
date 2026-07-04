type PrimitiveBlockType = 'heading' | 'paragraph' | 'list' | 'table' | 'code' | 'image'

export type AiDocTaskType = 'ask' | 'rewrite' | 'expand' | 'review'
export type AiDocActionType = 'answer' | 'replace'

export interface AiDocAnswerAction {
  action: 'answer'
  answer: string
}

export interface AiDocReplaceAction {
  action: 'replace'
  oldString: string
  newString: string
}

export interface AiDocBlock {
  blockId: string
  blockType: PrimitiveBlockType
  titlePath: string[]
  headingLevel: number
  headingText: string
  startOffset: number
  endOffset: number
  text: string
  excerpt: string
  blockIndex: number
}

export interface AiDocReferenceSnapshot {
  anchorPath: string[]
  blockType: PrimitiveBlockType
  startBlockIndex: number
  blockCount: number
  startOffset: number
  endOffset: number
  expectedText: string
  excerpt: string
  locked: boolean
}

export type AiDocAction = AiDocAnswerAction | AiDocReplaceAction

export interface AiDocChatResult {
  action: AiDocAction
  raw: string
}

export interface AiDocTrackedRange {
  startOffset: number
  endOffset: number
  expectedText: string
  blocked: boolean
}

export interface AiDocTextEdit {
  start: number
  end: number
  insertedText: string
}

interface TextLine {
  text: string
  start: number
  end: number
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function splitFrontMatter(content: string) {
  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n?/)
  if (!match) {
    return { body: content, bodyOffset: 0 }
  }

  return {
    body: content.slice(match[0].length),
    bodyOffset: match[0].length,
  }
}

function collectLines(content: string) {
  const lines: TextLine[] = []
  const regex = /.*(?:\n|$)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const text = match[0]
    const start = match.index
    const end = start + text.length
    lines.push({ text, start, end })
    if (!text.length || end >= content.length) {
      break
    }
  }

  return lines
}

function trimRange(content: string, start: number, end: number) {
  let nextStart = start
  let nextEnd = end

  while (nextStart < nextEnd && /\s/.test(content[nextStart] || '')) {
    nextStart += 1
  }

  while (nextEnd > nextStart && /\s/.test(content[nextEnd - 1] || '')) {
    nextEnd -= 1
  }

  return { start: nextStart, end: nextEnd }
}

function expandRangeToCompleteMarkdownImages(content: string, start: number, end: number) {
  let nextStart = start
  let nextEnd = end
  const imageStart = content.lastIndexOf('![', start)

  if (imageStart < 0) {
    return { start: nextStart, end: nextEnd }
  }

  const imageMiddle = content.indexOf('](', imageStart)
  if (imageMiddle < 0 || imageMiddle > end + 2) {
    return { start: nextStart, end: nextEnd }
  }

  const imageEnd = content.indexOf(')', imageMiddle + 2)
  if (imageEnd < 0 || imageEnd < start) {
    return { start: nextStart, end: nextEnd }
  }

  if (end <= imageStart || start >= imageEnd + 1) {
    return { start: nextStart, end: nextEnd }
  }

  nextStart = imageStart
  nextEnd = imageEnd + 1
  return { start: nextStart, end: nextEnd }
}

function isHeadingLine(text: string) {
  return /^(#{1,6})\s+(.+?)\s*$/.test(text.trimEnd())
}

function isFenceStart(text: string) {
  return /^(```|~~~)/.test(text.trimStart())
}

function getFenceMarker(text: string) {
  const match = text.trimStart().match(/^(```+|~~~+)/)
  return match?.[1] || ''
}

function isTableLikeLine(text: string) {
  const trimmed = text.trim()
  return trimmed.includes('|') && !/^\s*[-*+]\s/.test(trimmed)
}

function isImageOnlyLine(text: string) {
  return /^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(text.trim())
}

function isListLine(text: string) {
  return /^\s*(?:[-*+]|\d+\.)\s+/.test(text)
}

function buildTitlePath(stack: Array<{ level: number; title: string }>, level: number, title: string) {
  const nextStack = stack.filter((item) => item.level < level)
  nextStack.push({ level, title })
  return nextStack
}

function blockIdFromPath(titlePath: string[], blockType: PrimitiveBlockType, blockIndex: number) {
  return `${titlePath.join('>') || 'root'}::${blockType}::${blockIndex}`
}

function excerptOf(text: string, size = 240) {
  return text.trim().slice(0, size)
}

export function buildMarkdownBlockIndex(content: string, _version = 1): AiDocBlock[] {
  const { body, bodyOffset } = splitFrontMatter(content)
  const lines = collectLines(body)
  const blocks: AiDocBlock[] = []
  const titleStack: Array<{ level: number; title: string }> = []

  let lineIndex = 0

  while (lineIndex < lines.length) {
    const line = lines[lineIndex]
    const absoluteStart = bodyOffset + line.start
    const trimmed = line.text.trim()

    if (!trimmed) {
      lineIndex += 1
      continue
    }

    if (isHeadingLine(line.text)) {
      const match = line.text.trimEnd().match(/^(#{1,6})\s+(.+?)\s*$/)
      const level = match?.[1].length || 1
      const headingText = match?.[2]?.trim() || ''
      const nextStack = buildTitlePath(titleStack, level, headingText)
      titleStack.length = 0
      titleStack.push(...nextStack)
      const titlePath = titleStack.map((item) => item.title)
      const text = content.slice(absoluteStart, bodyOffset + line.end)

      blocks.push({
        blockId: blockIdFromPath(titlePath, 'heading', blocks.length),
        blockType: 'heading',
        titlePath,
        headingLevel: level,
        headingText,
        startOffset: absoluteStart,
        endOffset: bodyOffset + line.end,
        text,
        excerpt: excerptOf(text),
        blockIndex: blocks.length,
      })

      lineIndex += 1
      continue
    }

    const titlePath = titleStack.map((item) => item.title)
    const headingLevel = titleStack[titleStack.length - 1]?.level || 0
    const headingText = titleStack[titleStack.length - 1]?.title || ''

    let blockType: PrimitiveBlockType = 'paragraph'
    let startLineIndex = lineIndex
    let endLineIndex = lineIndex

    if (isFenceStart(line.text)) {
      blockType = 'code'
      const marker = getFenceMarker(line.text)
      endLineIndex = lineIndex
      while (endLineIndex + 1 < lines.length) {
        endLineIndex += 1
        if (lines[endLineIndex].text.trimStart().startsWith(marker)) {
          break
        }
      }
    } else if (isImageOnlyLine(line.text)) {
      blockType = 'image'
      endLineIndex = lineIndex
    } else if (isListLine(line.text)) {
      blockType = 'list'
      endLineIndex = lineIndex
      while (endLineIndex + 1 < lines.length) {
        const next = lines[endLineIndex + 1]
        if (!next.text.trim() || !isListLine(next.text)) break
        endLineIndex += 1
      }
    } else if (isTableLikeLine(line.text)) {
      blockType = 'table'
      endLineIndex = lineIndex
      while (endLineIndex + 1 < lines.length) {
        const next = lines[endLineIndex + 1]
        if (!next.text.trim() || !isTableLikeLine(next.text)) break
        endLineIndex += 1
      }
    } else {
      blockType = 'paragraph'
      endLineIndex = lineIndex
      while (endLineIndex + 1 < lines.length) {
        const next = lines[endLineIndex + 1]
        if (!next.text.trim()) break
        if (isHeadingLine(next.text) || isFenceStart(next.text) || isListLine(next.text) || isTableLikeLine(next.text) || isImageOnlyLine(next.text)) break
        endLineIndex += 1
      }
    }

    const startOffset = bodyOffset + lines[startLineIndex].start
    const endOffset = bodyOffset + lines[endLineIndex].end
    const text = content.slice(startOffset, endOffset)

    blocks.push({
      blockId: blockIdFromPath(titlePath, blockType, blocks.length),
      blockType,
      titlePath,
      headingLevel,
      headingText,
      startOffset,
      endOffset,
      text,
      excerpt: excerptOf(text),
      blockIndex: blocks.length,
    })

    lineIndex = endLineIndex + 1
  }

  return blocks
}

function createExactSelectionSnapshot(markdown: string, selectionStart: number, selectionEnd: number) {
  const trimmed = trimRange(markdown, Math.min(selectionStart, selectionEnd), Math.max(selectionStart, selectionEnd))
  const { start, end } = expandRangeToCompleteMarkdownImages(markdown, trimmed.start, trimmed.end)
  if (start === end) {
    return null
  }

  const selectedText = markdown.slice(start, end)

  return {
    anchorPath: [],
    blockType: 'paragraph',
    startBlockIndex: -1,
    blockCount: 1,
    startOffset: start,
    endOffset: end,
    expectedText: selectedText,
    excerpt: excerptOf(selectedText),
    locked: false,
  } satisfies AiDocReferenceSnapshot
}

export function createReferenceSnapshot(options: {
  markdown: string
  selectionStart: number
  selectionEnd: number
  version: number
}) {
  const { markdown, selectionStart, selectionEnd } = options

  if (typeof selectionStart === 'number' && typeof selectionEnd === 'number' && selectionStart !== selectionEnd) {
    return createExactSelectionSnapshot(markdown, selectionStart, selectionEnd)
  }

  return null
}

function blockPathFor(block: AiDocBlock) {
  return [...block.titlePath, `${block.blockType}:${block.blockIndex}`]
}

export function resolveReferenceSnapshot(reference: AiDocReferenceSnapshot, markdown: string, version: number) {
  const startOffset = reference.startOffset
  const endOffset = reference.endOffset
  if (startOffset < 0 || endOffset < startOffset) {
    return null
  }

  const currentText = markdown.slice(startOffset, endOffset)
  if (currentText !== reference.expectedText) {
    return null
  }

  const blocks = buildMarkdownBlockIndex(markdown, version)
  return {
    startOffset,
    endOffset,
    expectedText: reference.expectedText,
    blocks: blocks.filter((block) => endOffset > block.startOffset && startOffset < block.endOffset),
  }
}

export function isReferenceStale(reference: AiDocReferenceSnapshot, markdown: string, version: number) {
  return resolveReferenceSnapshot(reference, markdown, version) === null
}

export function countExactMatches(markdown: string, oldString: string) {
  if (!oldString) return 0

  let count = 0
  let index = markdown.indexOf(oldString)
  while (index !== -1) {
    count += 1
    index = markdown.indexOf(oldString, index + oldString.length)
  }

  return count
}

export function applyDocumentChatAction(markdown: string, reference: AiDocReferenceSnapshot, action: AiDocAction, _version: number) {
  if (action.action === 'answer') {
    return markdown
  }

  const selectedText = markdown.slice(reference.startOffset, reference.endOffset)
  if (selectedText === reference.expectedText) {
    return `${markdown.slice(0, reference.startOffset)}${action.newString}${markdown.slice(reference.endOffset)}`
  }

  if (action.oldString !== reference.expectedText || countExactMatches(markdown, action.oldString) !== 1) {
    return markdown
  }

  return markdown.replace(action.oldString, action.newString)
}

export function validateDocumentChatAction(action: unknown): action is AiDocAction {
  if (!action || typeof action !== 'object') return false

  const candidate = action as { action?: unknown; answer?: unknown; oldString?: unknown; newString?: unknown }
  if (candidate.action !== 'answer' && candidate.action !== 'replace') {
    return false
  }

  if (candidate.action === 'answer') {
    return typeof candidate.answer === 'string'
  }

  return typeof candidate.oldString === 'string' && typeof candidate.newString === 'string'
}

export function parseDocumentChatResponse(raw: string): AiDocChatResult {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const payload = fenced?.[1]?.trim() || raw.trim()

  try {
    const parsed = JSON.parse(payload) as AiDocAction
    const action = validateDocumentChatAction(parsed)
      ? parsed
      : ({ action: 'answer', answer: typeof raw === 'string' ? raw.trim() : '' } satisfies AiDocAnswerAction)

    return { action, raw }
  } catch {
    return {
      action: { action: 'answer', answer: raw.trim() },
      raw,
    }
  }
}

export function deriveTextEdit(previousText: string, nextText: string): AiDocTextEdit | null {
  if (previousText === nextText) {
    return null
  }

  let start = 0
  const prefixLimit = Math.min(previousText.length, nextText.length)
  while (start < prefixLimit && previousText[start] === nextText[start]) {
    start += 1
  }

  let previousEnd = previousText.length
  let nextEnd = nextText.length
  while (previousEnd > start && nextEnd > start && previousText[previousEnd - 1] === nextText[nextEnd - 1]) {
    previousEnd -= 1
    nextEnd -= 1
  }

  return {
    start,
    end: previousEnd,
    insertedText: nextText.slice(start, nextEnd),
  }
}

export function updateTrackedRangeForEdit(
  range: AiDocTrackedRange,
  edit: { start: number; end: number; insertedText: string }
) {
  const removedLength = edit.end - edit.start
  const insertedLength = edit.insertedText.length
  const delta = insertedLength - removedLength

  if (edit.end <= range.startOffset) {
    return {
      ...range,
      startOffset: range.startOffset + delta,
      endOffset: range.endOffset + delta,
      blocked: false,
    }
  }

  if (edit.start >= range.endOffset) {
    return {
      ...range,
      blocked: false,
    }
  }

  return {
    ...range,
    blocked: true,
  }
}

export function deriveConversationTitle(inputText: string, fallback = 'Document chat') {
  const trimmed = normalizeText(inputText)
  if (!trimmed) return fallback
  return trimmed.slice(0, 24)
}

export function collectReferencePreview(reference: AiDocReferenceSnapshot) {
  return {
    titlePath: reference.anchorPath,
    excerpt: reference.excerpt,
    blockCount: reference.blockCount,
    blockType: reference.blockType,
  }
}

export function buildTrackedRangeFromReference(reference: AiDocReferenceSnapshot): AiDocTrackedRange {
  return {
    startOffset: reference.startOffset,
    endOffset: reference.endOffset,
    expectedText: reference.expectedText,
    blocked: false,
  }
}

export function createEditFromRangeReplacement(startOffset: number, endOffset: number, content: string) {
  const { start, end } = trimRange(content, 0, content.length)
  return {
    startOffset,
    endOffset,
    content: content.slice(start, end) || content,
  }
}

export function getBlockPath(block: AiDocBlock) {
  return blockPathFor(block)
}
