import type { GitProviderConfig } from './types'

export function buildGitDocumentId(config: Pick<GitProviderConfig, 'provider' | 'ownerOrNamespace' | 'repo' | 'branch'>, path: string) {
  return `git:${config.provider}:${config.ownerOrNamespace}/${config.repo}:${config.branch}:${path}`
}

export function normalizeGitPath(path: string) {
  return path.replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+/g, '/')
}

export function joinGitPath(...parts: Array<string | undefined>) {
  return normalizeGitPath(parts.filter(Boolean).join('/'))
}

export function getGitFileName(path: string) {
  const normalized = normalizeGitPath(path)
  const segments = normalized.split('/')
  return segments[segments.length - 1] || normalized
}

export function encodeBase64(content: string) {
  const bytes = new TextEncoder().encode(content)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

export function decodeBase64(content: string) {
  const binary = atob(content)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export async function safeJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const data = await response.json()
      message = data?.message || data?.error || data?.error_description || message
    } catch {
      try {
        message = await response.text()
      } catch {
        // ignore
      }
    }
    throw new Error(message || `HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  return response.json() as Promise<T>
}
