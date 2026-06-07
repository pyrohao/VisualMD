import type { GitFileKind } from './types'
import { getGitFileName, normalizeGitPath } from './utils'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'])
const PDF_EXTENSIONS = new Set(['pdf'])
const BINARY_EXTENSIONS = new Set([
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'exe', 'dll', 'so', 'dylib',
  'psd', 'ai', 'sketch', 'fig',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'key', 'numbers', 'pages',
])
const TEXT_EXTENSIONS = new Set([
  'md', 'markdown', 'txt', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'sass',
  'less', 'html', 'htm', 'xml', 'yml', 'yaml', 'toml', 'ini', 'conf', 'config',
  'env', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql', 'csv', 'tsv', 'log',
  'py', 'java', 'kt', 'kts', 'go', 'rs', 'c', 'cc', 'cpp', 'h', 'hpp', 'm', 'mm',
  'php', 'rb', 'swift', 'vue', 'svelte', 'astro', 'lock', 'gitignore', 'gitattributes',
  'dockerfile', 'makefile', 'gradle', 'properties', 'text',
])

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  m4v: 'video/x-m4v',
  pdf: 'application/pdf',
}

function getGitFileExtension(path: string) {
  const fileName = getGitFileName(normalizeGitPath(path)).toLowerCase()
  const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : ''
  if (extension) {
    return extension
  }

  if (TEXT_EXTENSIONS.has(fileName)) {
    return fileName
  }

  return ''
}

export function inferGitFileKind(path: string): GitFileKind {
  const extension = getGitFileExtension(path)
  const fileName = getGitFileName(normalizeGitPath(path)).toLowerCase()

  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (PDF_EXTENSIONS.has(extension)) return 'pdf'
  if (BINARY_EXTENSIONS.has(extension)) return 'binary'
  if (TEXT_EXTENSIONS.has(extension) || TEXT_EXTENSIONS.has(fileName) || !extension) return 'text'
  return 'text'
}

export function isGitBinaryFileKind(kind: GitFileKind) {
  return kind !== 'text'
}

export function inferGitFileMimeType(path: string, fallback?: string) {
  if (fallback) {
    return fallback
  }

  const extension = getGitFileExtension(path)
  return MIME_BY_EXTENSION[extension] || 'application/octet-stream'
}
