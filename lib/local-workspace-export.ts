import { strToU8, zipSync } from 'fflate'
import type { MarkdownFile, WorkspaceAsset } from '@/types/file-system'
import {
  buildLocalMarkdownPath,
  extractLocalMarkdownImageSources,
  resolveLocalImageAssetPath,
} from '@/lib/local-image-resolution'
import { getLocalWorkspaceAssetBinary } from '@/lib/local-workspace-storage'

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function base64ToUint8Array(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export async function exportWorkspaceAsset(asset: WorkspaceAsset) {
  const binary = await getLocalWorkspaceAssetBinary(asset.path)
  if (!binary?.contentBase64) {
    throw new Error('Asset binary not found')
  }

  downloadBlob(
    new Blob([base64ToUint8Array(binary.contentBase64)], { type: binary.mimeType || 'application/octet-stream' }),
    asset.name
  )
}

export async function exportMarkdownFileWithAssets(options: {
  file: MarkdownFile
  markdownPath: string
  assets: WorkspaceAsset[]
}) {
  const { file, markdownPath, assets } = options
  const imageSources = extractLocalMarkdownImageSources(file.content)
  const referencedAssets = assets.filter((asset) => {
    const normalizedAssetPath = asset.path
    return imageSources.some((source) => resolveLocalImageAssetPath(markdownPath, source) === normalizedAssetPath)
  })

  if (referencedAssets.length === 0) {
    downloadBlob(new Blob([file.content], { type: 'text/markdown;charset=utf-8' }), file.name)
    return
  }

  const zipEntries: Record<string, Uint8Array> = {
    [markdownPath]: strToU8(file.content),
  }

  await Promise.all(referencedAssets.map(async (asset) => {
    const binary = await getLocalWorkspaceAssetBinary(asset.path)
    if (!binary?.contentBase64) {
      return
    }
    zipEntries[asset.path] = base64ToUint8Array(binary.contentBase64)
  }))

  const zipBinary = zipSync(zipEntries, { level: 6 })
  const zipName = file.name.replace(/\.md$/i, '') || 'document'
  downloadBlob(new Blob([zipBinary], { type: 'application/zip' }), `${zipName}.zip`)
}
