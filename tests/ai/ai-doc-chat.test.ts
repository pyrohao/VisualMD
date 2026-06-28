import { describe, expect, it } from 'vitest'
import {
  applyDocumentChatAction,
  buildMarkdownBlockIndex,
  createReferenceSnapshot,
  deriveTextEdit,
  isReferenceStale,
  parseDocumentChatResponse,
  resolveReferenceSnapshot,
  updateTrackedRangeForEdit,
  validateDocumentChatAction,
} from '@/lib/ai-doc-chat'

const SAMPLE_MARKDOWN = `---
title: Sample
---

# Intro

First paragraph.

Second paragraph.

## Detail

| name | value |
| ---- | ----- |
| a    | 1     |

![alt](./image.png)
`

describe('ai-doc-chat', () => {
  it('builds unified markdown block indexes', () => {
    const blocks = buildMarkdownBlockIndex(SAMPLE_MARKDOWN, 1)
    expect(blocks.some((block) => block.blockType === 'heading')).toBe(true)
    expect(blocks.some((block) => block.blockType === 'paragraph')).toBe(true)
    expect(blocks.some((block) => block.blockType === 'table')).toBe(true)
    expect(blocks.some((block) => block.blockType === 'image')).toBe(true)
  })

  it('creates block-range reference snapshot from editor selection', () => {
    const start = SAMPLE_MARKDOWN.indexOf('Second')
    const end = start + 'Second'.length
    const reference = createReferenceSnapshot({
      markdown: SAMPLE_MARKDOWN,
      selectionStart: start,
      selectionEnd: end,
      version: 1,
    })

    expect(reference).not.toBeNull()
    expect(reference?.anchorPath).toEqual(['Intro'])
    expect(reference?.blockType).toBe('paragraph')
    expect(reference?.blockCount).toBe(1)
    expect(reference?.expectedText).toBe('Second')
  })

  it('resolves selected string after preceding edits', () => {
    const start = SAMPLE_MARKDOWN.indexOf('Second paragraph.')
    const end = start + 'Second paragraph.'.length
    const reference = createReferenceSnapshot({
      markdown: SAMPLE_MARKDOWN,
      selectionStart: start,
      selectionEnd: end,
      version: 1,
    })

    expect(reference).not.toBeNull()

    const nextMarkdown = SAMPLE_MARKDOWN.replace('First paragraph.\n\n', 'First paragraph.\n\nInserted.\n\n')
    const resolved = resolveReferenceSnapshot(reference!, nextMarkdown, 2)

    expect(resolved).not.toBeNull()
    expect(nextMarkdown.slice(resolved!.startOffset, resolved!.endOffset)).toBe('Second paragraph.')
  })

  it('creates exact text references from editor selection without requiring headings', () => {
    const markdown = '# Doc\n\nAlpha beta gamma.'
    const start = markdown.indexOf('beta')
    const end = start + 'beta'.length
    const reference = createReferenceSnapshot({
      markdown,
      selectionStart: start,
      selectionEnd: end,
      version: 1,
    })

    expect(reference).not.toBeNull()
    expect(reference?.anchorPath).toEqual(['Doc'])
    expect(reference?.blockType).toBe('paragraph')
    expect(reference?.blockCount).toBe(1)
    expect(reference?.expectedText).toBe('beta')
    expect(reference?.startOffset).toBe(start)
    expect(reference?.endOffset).toBe(end)
  })

  it('creates exact text references from body text when the document has no headings', () => {
    const markdown = 'Alpha beta gamma.\n\nSecond paragraph.'
    const start = markdown.indexOf('beta')
    const end = start + 'beta'.length
    const reference = createReferenceSnapshot({
      markdown,
      selectionStart: start,
      selectionEnd: end,
      version: 1,
    })

    expect(reference).not.toBeNull()
    expect(reference?.anchorPath).toEqual([])
    expect(reference?.blockType).toBe('paragraph')
    expect(reference?.expectedText).toBe('beta')
    expect(reference?.startOffset).toBe(start)
    expect(reference?.endOffset).toBe(end)
  })

  it('expands partial image path selections to the complete markdown image syntax', () => {
    const imageSyntax = '![alt](./image.png)'
    const start = SAMPLE_MARKDOWN.indexOf('image.png')
    const end = start + 'image'.length
    const reference = createReferenceSnapshot({
      markdown: SAMPLE_MARKDOWN,
      selectionStart: start,
      selectionEnd: end,
      version: 1,
    })

    expect(reference).not.toBeNull()
    expect(reference?.blockType).toBe('image')
    expect(reference?.expectedText).toBe(imageSyntax)
    expect(SAMPLE_MARKDOWN.slice(reference!.startOffset, reference!.endOffset)).toBe(imageSyntax)
  })

  it('detects stale reference when target content changed', () => {
    const start = SAMPLE_MARKDOWN.indexOf('First paragraph.')
    const end = start + 'First paragraph.'.length
    const reference = createReferenceSnapshot({
      markdown: SAMPLE_MARKDOWN,
      selectionStart: start,
      selectionEnd: end,
      version: 1,
    })

    const modified = SAMPLE_MARKDOWN.replace('First paragraph.', 'Changed paragraph.')
    expect(isReferenceStale(reference!, modified, 2)).toBe(true)
  })

  it('validates and applies replace action', () => {
    const start = SAMPLE_MARKDOWN.indexOf('Second paragraph.')
    const end = start + 'Second paragraph.'.length
    const reference = createReferenceSnapshot({
      markdown: SAMPLE_MARKDOWN,
      selectionStart: start,
      selectionEnd: end,
      version: 1,
    })

    const action = {
      action: 'replace',
      oldString: 'Second paragraph.',
      newString: 'Updated paragraph.',
    } as const
    expect(validateDocumentChatAction(action)).toBe(true)

    const updated = applyDocumentChatAction(SAMPLE_MARKDOWN, reference!, action, 1)

    expect(updated).toContain('Updated paragraph.')
    expect(updated).not.toContain('Second paragraph.')
  })

  it('parses JSON answer and replace responses', () => {
    const answerResult = parseDocumentChatResponse('{"action":"answer","answer":"Done"}')
    expect(answerResult.action.action).toBe('answer')
    if (answerResult.action.action === 'answer') {
      expect(answerResult.action.answer).toBe('Done')
    }

    const replaceResult = parseDocumentChatResponse('```json\n{"action":"replace","oldString":"Old text","newString":"New text"}\n```')
    expect(replaceResult.action.action).toBe('replace')
    if (replaceResult.action.action === 'replace') {
      expect(replaceResult.action.oldString).toBe('Old text')
      expect(replaceResult.action.newString).toBe('New text')
    }
  })

  it('derives text edits and blocks overlapping tracked-range edits', () => {
    const previous = 'abc123xyz'
    const next = 'abc000123xyz'
    const edit = deriveTextEdit(previous, next)

    expect(edit).toEqual({
      start: 3,
      end: 3,
      insertedText: '000',
    })

    const nextRange = updateTrackedRangeForEdit(
      {
        startOffset: 3,
        endOffset: 6,
        expectedText: '123',
        blocked: false,
      },
      {
        start: 4,
        end: 5,
        insertedText: 'Z',
      }
    )

    expect(nextRange.blocked).toBe(true)
  })
})
