import { getClipboardImageFilesWithAltText, insertMarkdownAtSelection, type MarkdownImagePasteResult } from '@/lib/clipboard-image'
import { useFileSystemStore } from '@/stores/fileSystemStore'

interface LocalMarkdownImagePasteOptions {
  fileId: string
  clipboardData: DataTransfer | null
  value: string
  selectionStart: number
  selectionEnd: number
}

export async function getLocalMarkdownImagePasteResult({
  fileId,
  clipboardData,
  value,
  selectionStart,
  selectionEnd,
}: LocalMarkdownImagePasteOptions): Promise<MarkdownImagePasteResult | null> {
  const imageFiles = getClipboardImageFilesWithAltText(clipboardData)
  if (!imageFiles.length) return null

  const snippets = await Promise.all(imageFiles.map(async ({ file, altText }) => {
    const { relativePath } = await useFileSystemStore.getState().uploadAsset(fileId, file)
    return `![${altText}](${relativePath})`
  }))

  return insertMarkdownAtSelection(value, selectionStart, selectionEnd, snippets)
}
