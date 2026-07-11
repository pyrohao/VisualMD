const MIRROR_TEXTAREA_STYLE_KEYS = [
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontStretch',
  'fontVariant',
  'fontVariantCaps',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'textIndent',
  'tabSize',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'boxSizing',
  'textAlign',
  'direction',
  'wordSpacing',
] as const

type MirrorElements = {
  root: HTMLDivElement
  prefix: Text
  marker: HTMLSpanElement
  suffix: Text
}

let sharedMirror: MirrorElements | null = null

function ensureSharedMirror() {
  if (sharedMirror) {
    return sharedMirror
  }

  const root = document.createElement('div')
  const prefix = document.createTextNode('')
  const marker = document.createElement('span')
  const suffix = document.createTextNode('')

  root.setAttribute('aria-hidden', 'true')
  root.style.position = 'absolute'
  root.style.top = '-100000px'
  root.style.left = '0'
  root.style.visibility = 'hidden'
  root.style.pointerEvents = 'none'
  root.style.whiteSpace = 'pre-wrap'
  root.style.overflowWrap = 'break-word'
  root.style.wordBreak = 'break-word'
  root.style.overflow = 'hidden'
  root.style.contain = 'layout style paint'

  marker.textContent = '\u200b'
  marker.style.display = 'inline'

  root.append(prefix, marker, suffix)
  document.body.append(root)

  sharedMirror = { root, prefix, marker, suffix }
  return sharedMirror
}

function parsePixelValue(value: string) {
  const parsed = Number.parseFloat(value || '0')
  return Number.isFinite(parsed) ? parsed : 0
}

function syncMirrorStyles(textarea: HTMLTextAreaElement, mirror: MirrorElements) {
  const computedStyle = window.getComputedStyle(textarea)

  for (const key of MIRROR_TEXTAREA_STYLE_KEYS) {
    mirror.root.style[key] = computedStyle[key]
  }

  const borderLeft = parsePixelValue(computedStyle.borderLeftWidth)
  const borderRight = parsePixelValue(computedStyle.borderRightWidth)
  mirror.root.style.width = `${textarea.clientWidth + borderLeft + borderRight}px`
}

function getTextareaScrollLimit(textarea: HTMLTextAreaElement) {
  return Math.max(0, textarea.scrollHeight - textarea.clientHeight)
}

function measureTextareaOffsetTop(
  textarea: HTMLTextAreaElement,
  value: string,
  offset: number
) {
  const mirror = ensureSharedMirror()
  syncMirrorStyles(textarea, mirror)

  const safeOffset = Math.min(Math.max(0, offset), value.length)
  mirror.prefix.data = value.slice(0, safeOffset)
  mirror.suffix.data = value.slice(safeOffset)

  const markerRect = mirror.marker.getBoundingClientRect()
  const rootRect = mirror.root.getBoundingClientRect()
  return markerRect.top - rootRect.top
}

export function getTextareaSourceOffsetAtViewportRatio(
  textarea: HTMLTextAreaElement,
  value: string,
  viewportRatio: number,
  options?: {
    topInset?: number
    bottomInset?: number
  }
) {
  const topInset = Math.max(0, options?.topInset || 0)
  const bottomInset = Math.max(0, options?.bottomInset || 0)
  const availableHeight = Math.max(0, textarea.clientHeight - topInset - bottomInset)
  const targetY = textarea.scrollTop + topInset + availableHeight * viewportRatio
  let low = 0
  let high = value.length
  let bestOffset = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midTop = measureTextareaOffsetTop(textarea, value, mid)

    if (midTop <= targetY) {
      bestOffset = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return bestOffset
}

export function getTextareaScrollTopForSourceOffset(
  textarea: HTMLTextAreaElement,
  value: string,
  sourceOffset: number,
  viewportRatio: number,
  options?: {
    topInset?: number
    bottomInset?: number
  }
) {
  const topInset = Math.max(0, options?.topInset || 0)
  const bottomInset = Math.max(0, options?.bottomInset || 0)
  const availableHeight = Math.max(0, textarea.clientHeight - topInset - bottomInset)
  const offsetTop = measureTextareaOffsetTop(textarea, value, sourceOffset)
  const nextScrollTop = offsetTop - (topInset + availableHeight * viewportRatio)
  return Math.min(Math.max(0, nextScrollTop), getTextareaScrollLimit(textarea))
}
