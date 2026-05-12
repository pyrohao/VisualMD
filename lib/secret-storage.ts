const SECRET_PREFIX = 'sec:v2:'
const LEGACY_PREFIX = 'enc:'
const STATIC_SECRET = 'VisualMD::LocalSecret::2026'

function encodeUtf8(value: string) {
  return new TextEncoder().encode(value)
}

function decodeUtf8(value: Uint8Array) {
  return new TextDecoder().decode(value)
}

function toBase64(value: Uint8Array) {
  let binary = ''
  value.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function xorBytes(input: Uint8Array, secret: Uint8Array) {
  return Uint8Array.from(input, (byte, index) => {
    const secretByte = secret[index % secret.length]
    const mixedByte = (secretByte + (index * 31 % 251)) & 0xff
    return byte ^ mixedByte
  })
}

export function encryptSecret(value: string) {
  if (!value) return ''
  if (value.startsWith(SECRET_PREFIX)) return value

  const payload = encodeUtf8(value)
  const secret = encodeUtf8(STATIC_SECRET)
  const encrypted = xorBytes(payload, secret)
  return `${SECRET_PREFIX}${toBase64(encrypted)}`
}

export function decryptSecret(value: string) {
  if (!value) return ''

  if (value.startsWith(SECRET_PREFIX)) {
    try {
      const encrypted = fromBase64(value.slice(SECRET_PREFIX.length))
      const secret = encodeUtf8(STATIC_SECRET)
      return decodeUtf8(xorBytes(encrypted, secret))
    } catch {
      return ''
    }
  }

  if (value.startsWith(LEGACY_PREFIX)) {
    try {
      return atob(value.slice(LEGACY_PREFIX.length))
    } catch {
      return ''
    }
  }

  return value
}

export function normalizeEncryptedSecret(value: string) {
  if (!value) return ''
  return encryptSecret(decryptSecret(value))
}

export function isEncryptedSecret(value: string) {
  return value.startsWith(SECRET_PREFIX) || value.startsWith(LEGACY_PREFIX)
}
