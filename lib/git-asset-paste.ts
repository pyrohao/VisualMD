import { getClipboardImageFilesWithAltText, insertMarkdownAtSelection, type MarkdownImagePasteResult } from '@/lib/clipboard-image'
import { buildGitRepoRelativePath } from '@/lib/git/utils'
import { useGitStore } from '@/stores/gitStore'

interface GitMarkdownImagePasteOptions {
  documentId: string
  clipboardData: DataTransfer | null
  value: string
  selectionStart: number
  selectionEnd: number
}

export async function getGitMarkdownImagePasteResult({
  documentId,
  clipboardData,
  value,
  selectionStart,
  selectionEnd,
}: GitMarkdownImagePasteOptions): Promise<MarkdownImagePasteResult | null> {
  const imageFiles = getClipboardImageFilesWithAltText(clipboardData)
  if (!imageFiles.length) return null

  const snippets = await Promise.all(imageFiles.map(async ({ file, altText }) => {
    const { repoPath, draftPath } = await useGitStore.getState().uploadAsset(documentId, file)
    const relativePath = buildGitRepoRelativePath(draftPath, repoPath)
    const encodedPath = encodeURI(relativePath)

    return `![${altText}](${encodedPath})`
  }))

  return insertMarkdownAtSelection(value, selectionStart, selectionEnd, snippets)
}
