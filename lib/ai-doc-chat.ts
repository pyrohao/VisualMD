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

function findBlocksForSelection(blocks: AiDocBlock[], selectionStart: number, selectionEnd: number) {
  const overlapping = blocks.filter(
    (block) => selectionEnd > block.startOffset && selectionStart < block.endOffset
  )

  if (!overlapping.length) {
    return null
  }

  return overlapping
}

function findBlocksForClick(blocks: AiDocBlock[], clickedText: string, tagName?: string) {
  const normalizedClickedText = normalizeText(clickedText)
  const preferredBlockType: PrimitiveBlockType | null =
    tagName && /^h[1-6]$/i.test(tagName) ? 'heading' : null

  const ranked = blocks
    .filter((block) => (preferredBlockType ? block.blockType === preferredBlockType : true))
    .map((block) => {
      const normalizedBlockText = normalizeText(block.text)
      return {
        block,
        score:
          normalizedBlockText === normalizedClickedText
            ? 0
            : normalizedBlockText.includes(normalizedClickedText)
              ? 1
              : 2,
      }
    })
    .sort((left, right) => left.score - right.score || left.block.blockIndex - right.block.blockIndex)

  const match = ranked[0]?.block
  return match ? [match] : null
}

function createRangeSnapshot(blocks: AiDocBlock[], matchedBlocks: AiDocBlock[]) {
  const sorted = [...matchedBlocks].sort((left, right) => left.blockIndex - right.blockIndex)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const expectedText = sorted.map((block) => block.text).join('')
  const anchorPath = first.titlePath

  return {
    anchorPath,
    blockType: first.blockType,
    startBlockIndex: first.blockIndex,
    blockCount: sorted.length,
    startOffset: first.startOffset,
    endOffset: last.endOffset,
    expectedText,
    excerpt: excerptOf(expectedText),
    locked: false,
  } satisfies AiDocReferenceSnapshot
}

function findBlockForOffset(blocks: AiDocBlock[], offset: number) {
  return blocks.find((block) => offset >= block.startOffset && offset <= block.endOffset) || null
}

function createExactSelectionSnapshot(
  blocks: AiDocBlock[],
  markdown: string,
  selectionStart: number,
  selectionEnd: number
) {
  const { start, end } = trimRange(markdown, Math.min(selectionStart, selectionEnd), Math.max(selectionStart, selectionEnd))
  if (start === end) {
    return null
  }

  const selectedText = markdown.slice(start, end)
  const firstBlock = findBlockForOffset(blocks, start) || blocks.find((block) => end > block.startOffset && start < block.endOffset)
  if (!firstBlock) {
    return null
  }

  const overlapping = findBlocksForSelection(blocks, start, end) || [firstBlock]

  return {
    anchorPath: firstBlock.titlePath,
    blockType: firstBlock.blockType,
    startBlockIndex: overlapping[0]?.blockIndex ?? firstBlock.blockIndex,
    blockCount: overlapping.length,
    startOffset: start,
    endOffset: end,
    expectedText: selectedText,
    excerpt: excerptOf(selectedText),
    locked: false,
  } satisfies AiDocReferenceSnapshot
}

export function createReferenceSnapshot(options: {
  markdown: string
  selectionStart?: number | null
  selectionEnd?: number | null
  clickedText?: string
  clickedTagName?: string
  version: number
}) {
  const { markdown, selectionStart, selectionEnd, clickedText, clickedTagName, version } = options
  const blocks = buildMarkdownBlockIndex(markdown, version)

  let matchedBlocks: AiDocBlock[] | null = null

  if (typeof selectionStart === 'number' && typeof selectionEnd === 'number' && selectionStart !== selectionEnd) {
    return createExactSelectionSnapshot(blocks, markdown, selectionStart, selectionEnd)
  } else if (clickedText) {
    matchedBlocks = findBlocksForClick(blocks, clickedText, clickedTagName)
  }

  if (!matchedBlocks?.length) return null
  return createRangeSnapshot(blocks, matchedBlocks)
}

export function createReferenceSnapshotFromBlockIndex(markdown: string, blockIndex: number, version: number) {
  const blocks = buildMarkdownBlockIndex(markdown, version)
  const matchedBlock = blocks.find((block) => block.blockIndex === blockIndex)
  if (!matchedBlock) {
    return null
  }

  return createRangeSnapshot(blocks, [matchedBlock])
}

function blockPathFor(block: AiDocBlock) {
  return [...block.titlePath, `${block.blockType}:${block.blockIndex}`]
}

export function resolveReferenceSnapshot(reference: AiDocReferenceSnapshot, markdown: string, version: number) {
  const blocks = buildMarkdownBlockIndex(markdown, version)
  const startOffset = markdown.indexOf(reference.expectedText)
  if (startOffset < 0) {
    return null
  }

  const endOffset = startOffset + reference.expectedText.length
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

  if (action.oldString !== reference.expectedText) {
    return markdown
  }

  if (countExactMatches(markdown, action.oldString) !== 1) {
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

export function recalculateReferenceOffsets(reference: AiDocReferenceSnapshot, markdown: string, version: number) {
  const resolved = resolveReferenceSnapshot(reference, markdown, version)
  if (!resolved) {
    return null
  }

  return {
    ...reference,
    startOffset: resolved.startOffset,
    endOffset: resolved.endOffset,
    expectedText: resolved.expectedText,
  } satisfies AiDocReferenceSnapshot
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
