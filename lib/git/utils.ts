import type { GitProviderConfig } from './types'

export function buildGitDocumentId(config: Pick<GitProviderConfig, 'provider' | 'ownerOrNamespace' | 'repo' | 'branch'>, path: string) {
  return `git:${config.provider}:${config.ownerOrNamespace}/${config.repo}:${config.branch}:${path}`
}

export function parseGitDocumentId(documentId: string): (Pick<
  GitProviderConfig,
  'provider' | 'ownerOrNamespace' | 'repo' | 'branch'
> & { path: string }) | null {
  const match = /^git:([^:]+):([^/]+)\/([^:]+):([^:]+):(.+)$/.exec(documentId)
  if (!match) {
    return null
  }

  const [, provider, ownerOrNamespace, repo, branch, path] = match
  return {
    provider: provider as GitProviderConfig['provider'],
    ownerOrNamespace,
    repo,
    branch,
    path,
  }
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

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
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

function leftRotate32(value: number, shift: number) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0
}

function sha1Hex(bytes: Uint8Array) {
  const originalBitLength = bytes.length * 8
  const withPaddingLength = (((bytes.length + 9 + 63) >> 6) << 6)
  const padded = new Uint8Array(withPaddingLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80

  const view = new DataView(padded.buffer)
  view.setUint32(withPaddingLength - 4, originalBitLength >>> 0, false)
  view.setUint32(withPaddingLength - 8, Math.floor(originalBitLength / 0x100000000), false)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const words = new Uint32Array(80)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false)
    }

    for (let index = 16; index < 80; index += 1) {
      words[index] = leftRotate32(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let index = 0; index < 80; index += 1) {
      let f = 0
      let k = 0
      if (index < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (index < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }

      const temp = (leftRotate32(a, 5) + f + e + k + words[index]) >>> 0
      e = d
      d = c
      c = leftRotate32(b, 30)
      b = a
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  return [h0, h1, h2, h3, h4]
    .map((value) => value.toString(16).padStart(8, '0'))
    .join('')
}

export function computeGitBlobShaFromBytes(bytes: Uint8Array) {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`)
  const payload = new Uint8Array(header.length + bytes.length)
  payload.set(header)
  payload.set(bytes, header.length)
  return sha1Hex(payload)
}

export function computeGitBlobSha(content: string) {
  return computeGitBlobShaFromBytes(new TextEncoder().encode(content))
}

export function computeGitBlobShaFromBase64(contentBase64: string) {
  const binary = atob(contentBase64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return computeGitBlobShaFromBytes(bytes)
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
