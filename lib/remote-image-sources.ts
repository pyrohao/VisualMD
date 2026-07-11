const REMOTE_IMAGE_PATH_PATTERN = /\.(?:png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i

function parseUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isGitHubHost(hostname: string) {
  const normalized = hostname.toLowerCase()
  return normalized === 'github.com' || normalized === 'www.github.com'
}

function looksLikeRemoteImagePath(pathname: string) {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '')
  const fileName = withoutTrailingSlash.split('/').pop() || ''
  return REMOTE_IMAGE_PATH_PATTERN.test(fileName)
}

function normalizeGitHubImageSource(src: string) {
  const parsed = parseUrl(src)
  if (!parsed || !isGitHubHost(parsed.hostname)) {
    return src
  }

  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 5) {
    return src
  }

  const [owner, repo, route, ref, ...pathSegments] = segments
  if ((route !== 'blob' && route !== 'tree') || !ref || pathSegments.length === 0) {
    return src
  }

  const repoPath = pathSegments.join('/')
  if (!looksLikeRemoteImagePath(repoPath)) {
    return src
  }

  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${repoPath}`
}

export function normalizeKnownRemoteImageSource(src: string) {
  return normalizeGitHubImageSource(src)
}

export function normalizeRenderedHtmlImageSources(rawHtml: string) {
  const parser = new DOMParser()
  const parsed = parser.parseFromString(rawHtml, 'text/html')
  const images = Array.from(parsed.querySelectorAll('img[src]'))

  for (const image of images) {
    const source = image.getAttribute('src') || ''
    const normalizedSource = normalizeKnownRemoteImageSource(source)
    if (normalizedSource !== source) {
      image.setAttribute('src', normalizedSource)
    }
  }

  return parsed.body.innerHTML
}
