import { nanoid } from 'nanoid'
import type { Folder, MarkdownFile, WorkspaceAsset } from '@/types/file-system'
import { arrayBufferToBase64 } from '@/lib/git/utils'
import { getLocalWorkspaceAssetBinary } from '@/lib/local-workspace-storage'

export const LOCAL_ASSET_DIRECTORY = '.visualmd-assets'
export const LOCAL_IMAGE_PLACEHOLDER_DATA_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
}

function isExternalLikeImageSource(src: string) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)
}

function safeDecodeUriPath(path: string) {
  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

export function normalizeRelativePath(path: string) {
  const stack: string[] = []

  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      stack.pop()
      continue
    }
    stack.push(segment)
  }

  return stack.join('/')
}

export function buildLocalMarkdownPath(
  fileId: string,
  files: MarkdownFile[],
  folders: Folder[]
) {
  const file = files.find((item) => item.id === fileId)
  if (!file) {
    return null
  }

  const folder = file.folderId ? folders.find((item) => item.id === file.folderId) : null
  return folder ? `${folder.name}/${file.name}` : file.name
}

export function resolveLocalImageAssetPath(markdownPath: string, rawSrc: string) {
  const trimmed = rawSrc.trim()
  if (!trimmed || isExternalLikeImageSource(trimmed)) {
    return null
  }

  const withoutHash = trimmed.split('#')[0] || ''
  const rawPath = withoutHash.split('?')[0] || ''
  const decodedPath = safeDecodeUriPath(rawPath)
  if (!decodedPath) {
    return null
  }

  if (decodedPath.startsWith('/')) {
    return normalizeRelativePath(decodedPath.slice(1))
  }

  const normalizedMarkdownPath = normalizeRelativePath(markdownPath)
  const markdownDir = normalizedMarkdownPath.includes('/')
    ? normalizedMarkdownPath.split('/').slice(0, -1).join('/')
    : ''
  const joinedPath = markdownDir ? `${markdownDir}/${decodedPath}` : decodedPath

  return normalizeRelativePath(joinedPath)
}

export function inferLocalImageMimeType(assetPath: string, mimeType?: string) {
  if (mimeType?.startsWith('image/')) {
    return mimeType
  }

  const extension = assetPath.split('.').pop()?.toLowerCase() || ''
  return IMAGE_MIME_BY_EXTENSION[extension] || 'application/octet-stream'
}

export function buildLocalImageDataUrl(assetPath: string, contentBase64: string, mimeType?: string) {
  return `data:${inferLocalImageMimeType(assetPath, mimeType)};base64,${contentBase64}`
}

export function collectLocalAssetPathSet(assets: WorkspaceAsset[]) {
  const paths = new Set<string>()

  for (const asset of assets) {
    paths.add(normalizeRelativePath(asset.path))
  }

  return paths
}

export function prepareLocalHtmlImageSources(
  rawHtml: string,
  markdownPath: string,
  assetPaths: Set<string>
) {
  const parser = new DOMParser()
  const parsed = parser.parseFromString(rawHtml, 'text/html')
  const images = Array.from(parsed.querySelectorAll('img[src]'))

  for (const img of images) {
    const src = img.getAttribute('src') || ''
    const assetPath = resolveLocalImageAssetPath(markdownPath, src)
    if (!assetPath || !assetPaths.has(assetPath)) {
      continue
    }

    img.setAttribute('data-visualmd-local-src', src)
    img.setAttribute('src', LOCAL_IMAGE_PLACEHOLDER_DATA_URL)
  }

  return parsed.body.innerHTML
}

export async function resolveLocalHtmlImageSources(options: {
  rawHtml: string
  markdownPath: string
  assetPaths: Set<string>
  cache?: Map<string, string>
}) {
  const { rawHtml, markdownPath, assetPaths, cache } = options
  const parser = new DOMParser()
  const parsed = parser.parseFromString(rawHtml, 'text/html')
  const images = Array.from(parsed.querySelectorAll('img[src]'))

  await Promise.all(images.map(async (img) => {
    const source = img.getAttribute('data-visualmd-local-src') || img.getAttribute('src') || ''
    const assetPath = resolveLocalImageAssetPath(markdownPath, source)
    if (!assetPath || !assetPaths.has(assetPath)) {
      return
    }

    const cached = cache?.get(assetPath)
    if (cached) {
      img.setAttribute('src', cached)
      img.removeAttribute('data-visualmd-local-src')
      return
    }

    const asset = await getLocalWorkspaceAssetBinary(assetPath)
    if (!asset?.contentBase64) {
      return
    }

    const dataUrl = buildLocalImageDataUrl(assetPath, asset.contentBase64, asset.mimeType)
    cache?.set(assetPath, dataUrl)
    img.setAttribute('src', dataUrl)
    img.removeAttribute('data-visualmd-local-src')
  }))

  return parsed.body.innerHTML
}

export async function resolveLocalImageSourceMap(options: {
  sources: string[]
  markdownPath: string
  assetPaths: Set<string>
  cache?: Map<string, string>
}) {
  const { sources, markdownPath, assetPaths, cache } = options
  const result: Record<string, string> = {}

  await Promise.all(sources.map(async (source) => {
    const assetPath = resolveLocalImageAssetPath(markdownPath, source)
    if (!assetPath || !assetPaths.has(assetPath)) {
      return
    }

    const cached = cache?.get(assetPath)
    if (cached) {
      result[source] = cached
      return
    }

    const asset = await getLocalWorkspaceAssetBinary(assetPath)
    if (!asset?.contentBase64) {
      return
    }

    const dataUrl = buildLocalImageDataUrl(assetPath, asset.contentBase64, asset.mimeType)
    cache?.set(assetPath, dataUrl)
    result[source] = dataUrl
  }))

  return result
}

export function createLocalAssetFileName(markdownPath: string, file: File) {
  const baseName = markdownPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'document'
  const extension = file.name.includes('.')
    ? file.name.split('.').pop()?.toLowerCase() || 'png'
    : file.type.split('/')[1]?.toLowerCase() || 'png'
  const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'png'
  const shortSuffix = nanoid(6).toLowerCase()

  return `${baseName}-${shortSuffix}.${safeExtension}`
}

export async function createLocalAssetRecord(markdownPath: string, file: File) {
  const now = Date.now()
  const fileName = createLocalAssetFileName(markdownPath, file)
  const assetPath = `${LOCAL_ASSET_DIRECTORY}/${fileName}`
  const contentBase64 = arrayBufferToBase64(await file.arrayBuffer())

  const metadata: WorkspaceAsset = {
    id: `local-asset:${assetPath}`,
    name: fileName,
    path: assetPath,
    mimeType: file.type || undefined,
    createdAt: now,
    updatedAt: now,
  }

  return {
    metadata,
    binary: {
      ...metadata,
      contentBase64,
    },
  }
}

export function buildRelativeAssetPath(markdownPath: string, assetPath: string) {
  const normalizedMarkdownPath = normalizeRelativePath(markdownPath)
  const markdownDir = normalizedMarkdownPath.includes('/')
    ? normalizedMarkdownPath.split('/').slice(0, -1)
    : []

  if (markdownDir.length === 0) {
    return encodeURI(assetPath)
  }

  return encodeURI(`${'../'.repeat(markdownDir.length)}${assetPath}`)
}

export function extractLocalMarkdownImageSources(markdown: string) {
  const sources: string[] = []
  const markdownImagePattern = /!\[[^\]]*]\(([^)\s]+(?:\s+"[^"]*")?)\)/g
  let match: RegExpExecArray | null

  while ((match = markdownImagePattern.exec(markdown)) !== null) {
    const raw = match[1].trim().replace(/\s+".*"$/, '')
    if (raw) {
      sources.push(raw)
    }
  }

  return sources
}
