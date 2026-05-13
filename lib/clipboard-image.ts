export interface MarkdownImagePasteResult {
  nextValue: string
  selectionStart: number
  selectionEnd: number
}

export interface ClipboardImageFile {
  file: File
  altText: string
}

interface MarkdownImagePasteOptions {
  clipboardData: DataTransfer | null
  value: string
  selectionStart: number
  selectionEnd: number
}

function getClipboardImageFiles(clipboardData: DataTransfer | null) {
  if (!clipboardData) return []

  return Array.from(clipboardData.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read pasted image'))
    reader.readAsDataURL(file)
  })
}

function buildAltText(file: File, index: number) {
  const fallback = `pasted-image-${Date.now()}${index > 0 ? `-${index + 1}` : ''}`
  const baseName = file.name.trim() ? file.name.replace(/\.[^.]+$/, '') : fallback

  return baseName
    .replace(/[\r\n[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback
}

function insertAtSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insertedText: string
): MarkdownImagePasteResult {
  const needsLeadingNewline = selectionStart > 0 && value[selectionStart - 1] !== '\n'
  const needsTrailingNewline = selectionEnd < value.length && value[selectionEnd] !== '\n'
  const wrappedText = `${needsLeadingNewline ? '\n' : ''}${insertedText}${needsTrailingNewline ? '\n' : ''}`
  const nextValue = `${value.slice(0, selectionStart)}${wrappedText}${value.slice(selectionEnd)}`
  const caret = selectionStart + wrappedText.length

  return {
    nextValue,
    selectionStart: caret,
    selectionEnd: caret,
  }
}

export function hasClipboardImage(clipboardData: DataTransfer | null) {
  return getClipboardImageFiles(clipboardData).length > 0
}

export function getClipboardImageFilesWithAltText(clipboardData: DataTransfer | null): ClipboardImageFile[] {
  return getClipboardImageFiles(clipboardData).map((file, index) => ({
    file,
    altText: buildAltText(file, index),
  }))
}

export async function getMarkdownImagePasteResult({
  clipboardData,
  value,
  selectionStart,
  selectionEnd,
}: MarkdownImagePasteOptions): Promise<MarkdownImagePasteResult | null> {
  const imageFiles = getClipboardImageFiles(clipboardData)
  if (!imageFiles.length) return null

  const snippets = await Promise.all(
    imageFiles.map(async (file, index) => {
      const dataUrl = await readFileAsDataUrl(file)
      return `![${buildAltText(file, index)}](${dataUrl})`
    })
  )

  return insertAtSelection(value, selectionStart, selectionEnd, snippets.join('\n\n'))
}

export function insertMarkdownAtSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  snippets: string[]
) {
  return insertAtSelection(value, selectionStart, selectionEnd, snippets.join('\n\n'))
}
