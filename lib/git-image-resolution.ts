import { getGitProviderClient } from '@/lib/git/providers'
import type { GitProviderConfig, StagedGitChange } from '@/lib/git/types'
import { joinGitPath, normalizeGitPath } from '@/lib/git/utils'
import { decryptSecret } from '@/lib/secret-storage'

export interface GitImageMeta {
  provider: GitProviderConfig['provider']
  ownerOrNamespace: string
  repo: string
  branch: string
  path: string
}

export const GIT_IMAGE_PLACEHOLDER_DATA_URL =
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

function normalizeRepoRelativePath(path: string) {
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

export function resolveGitImageRepoPath(markdownPath: string, rawSrc: string) {
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
    return normalizeRepoRelativePath(decodedPath.slice(1))
  }

  const normalizedMarkdownPath = normalizeGitPath(markdownPath)
  const markdownDir = normalizedMarkdownPath.includes('/')
    ? normalizedMarkdownPath.split('/').slice(0, -1).join('/')
    : ''
  const joinedPath = markdownDir ? joinGitPath(markdownDir, decodedPath) : normalizeGitPath(decodedPath)

  return normalizeRepoRelativePath(joinedPath)
}

export function inferGitImageMimeType(repoPath: string, mimeType?: string) {
  if (mimeType?.startsWith('image/')) {
    return mimeType
  }

  const extension = repoPath.split('.').pop()?.toLowerCase() || ''
  return IMAGE_MIME_BY_EXTENSION[extension] || 'application/octet-stream'
}

export function collectGitAssetMap(
  stagedChanges: StagedGitChange[],
  pendingAssetChanges: StagedGitChange[] = []
) {
  const assets = new Map<string, { contentBase64: string; mimeType?: string }>()

  for (const change of [...pendingAssetChanges, ...stagedChanges]) {
    if (change.kind !== 'git-asset' || !change.contentBase64) {
      continue
    }

    assets.set(normalizeGitPath(change.repoPath), {
      contentBase64: change.contentBase64,
      mimeType: change.mimeType,
    })
  }

  return assets
}

export function buildGitImageRuntimeConfig(
  config: GitProviderConfig,
  gitMeta: GitImageMeta
): GitProviderConfig | null {
  const decryptedToken = decryptSecret(config.token || '')
  if (!decryptedToken) {
    return null
  }

  return {
    ...config,
    provider: gitMeta.provider,
    ownerOrNamespace: gitMeta.ownerOrNamespace,
    repo: gitMeta.repo,
    branch: gitMeta.branch,
    token: decryptedToken,
  }
}

function buildGitImageCacheKey(runtimeConfig: GitProviderConfig, repoPath: string) {
  return `${runtimeConfig.provider}:${runtimeConfig.ownerOrNamespace}/${runtimeConfig.repo}:${runtimeConfig.branch}:${repoPath}`
}

function buildGitImageDataUrl(repoPath: string, contentBase64: string, mimeType?: string) {
  return `data:${inferGitImageMimeType(repoPath, mimeType)};base64,${contentBase64}`
}

async function fetchGitImageDataUrl(
  runtimeConfig: GitProviderConfig,
  repoPath: string,
  cache?: Map<string, string>
) {
  const normalizedRepoPath = normalizeGitPath(repoPath)
  const cacheKey = buildGitImageCacheKey(runtimeConfig, normalizedRepoPath)
  const cached = cache?.get(cacheKey)
  if (cached) {
    return cached
  }

  const getBinaryFile = getGitProviderClient(runtimeConfig).getBinaryFile
  if (!getBinaryFile) {
    return null
  }

  const binary = await getBinaryFile(runtimeConfig, normalizedRepoPath)
  if (!binary?.contentBase64) {
    return null
  }

  const dataUrl = buildGitImageDataUrl(normalizedRepoPath, binary.contentBase64, binary.mimeType)
  cache?.set(cacheKey, dataUrl)
  return dataUrl
}

export function prepareGitHtmlImageSources(
  rawHtml: string,
  markdownPath: string,
  gitAssets: Map<string, { contentBase64: string; mimeType?: string }>
) {
  const parser = new DOMParser()
  const parsed = parser.parseFromString(rawHtml, 'text/html')
  const images = Array.from(parsed.querySelectorAll('img[src]'))

  for (const img of images) {
    const src = img.getAttribute('src') || ''
    const repoPath = resolveGitImageRepoPath(markdownPath, src)
    if (!repoPath) {
      continue
    }

    const normalizedRepoPath = normalizeGitPath(repoPath)
    const asset = gitAssets.get(normalizedRepoPath)
    if (asset?.contentBase64) {
      img.setAttribute('src', buildGitImageDataUrl(normalizedRepoPath, asset.contentBase64, asset.mimeType))
      img.removeAttribute('data-visualmd-git-src')
      continue
    }

    img.setAttribute('data-visualmd-git-src', src)
    img.setAttribute('src', GIT_IMAGE_PLACEHOLDER_DATA_URL)
  }

  return parsed.body.innerHTML
}

export async function resolveGitHtmlImageSources(options: {
  rawHtml: string
  markdownPath: string
  gitAssets: Map<string, { contentBase64: string; mimeType?: string }>
  runtimeConfig: GitProviderConfig | null
  cache?: Map<string, string>
}) {
  const { rawHtml, markdownPath, gitAssets, runtimeConfig, cache } = options
  const parser = new DOMParser()
  const parsed = parser.parseFromString(rawHtml, 'text/html')
  const images = Array.from(parsed.querySelectorAll('img[src]'))

  await Promise.all(images.map(async (img) => {
    const source = img.getAttribute('data-visualmd-git-src') || img.getAttribute('src') || ''
    const repoPath = resolveGitImageRepoPath(markdownPath, source)
    if (!repoPath) {
      return
    }

    const normalizedRepoPath = normalizeGitPath(repoPath)
    const asset = gitAssets.get(normalizedRepoPath)
    if (asset?.contentBase64) {
      img.setAttribute('src', buildGitImageDataUrl(normalizedRepoPath, asset.contentBase64, asset.mimeType))
      img.removeAttribute('data-visualmd-git-src')
      return
    }

    if (!runtimeConfig) {
      return
    }

    try {
      const dataUrl = await fetchGitImageDataUrl(runtimeConfig, normalizedRepoPath, cache)
      if (!dataUrl) {
        return
      }
      img.setAttribute('src', dataUrl)
      img.removeAttribute('data-visualmd-git-src')
    } catch {
      // Keep the placeholder when remote fetch fails.
    }
  }))

  return parsed.body.innerHTML
}

export async function resolveGitImageSourceMap(options: {
  sources: string[]
  markdownPath: string
  gitAssets: Map<string, { contentBase64: string; mimeType?: string }>
  runtimeConfig: GitProviderConfig | null
  cache?: Map<string, string>
}) {
  const { sources, markdownPath, gitAssets, runtimeConfig, cache } = options
  const entries = await Promise.all(sources.map(async (source) => {
    const repoPath = resolveGitImageRepoPath(markdownPath, source)
    if (!repoPath) {
      return null
    }

    const normalizedRepoPath = normalizeGitPath(repoPath)
    const asset = gitAssets.get(normalizedRepoPath)
    if (asset?.contentBase64) {
      return [source, buildGitImageDataUrl(normalizedRepoPath, asset.contentBase64, asset.mimeType)] as const
    }

    if (!runtimeConfig) {
      return null
    }

    try {
      const dataUrl = await fetchGitImageDataUrl(runtimeConfig, normalizedRepoPath, cache)
      return dataUrl ? ([source, dataUrl] as const) : null
    } catch {
      return null
    }
  }))

  const result: Record<string, string> = {}
  for (const entry of entries) {
    if (!entry) continue
    result[entry[0]] = entry[1]
  }
  return result
}
