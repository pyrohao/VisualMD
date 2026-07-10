'use client'

import DOMPurify from 'dompurify'

const FORBID_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
]

const FORBID_ATTR = ['style']
const SVG_FORBID_TAGS = ['script']
const SVG_PLACEHOLDER_ATTR = 'data-visualmd-foreign-object'

const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href'] as const

function hasExplicitScheme(value: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

function isProtocolRelative(value: string) {
  return value.startsWith('//')
}

function isSafeRelativeUrl(value: string) {
  return !hasExplicitScheme(value) && !isProtocolRelative(value)
}

function isAllowedHref(value: string) {
  if (!value) return false
  if (value.startsWith('#')) return true
  if (isSafeRelativeUrl(value)) return true

  const lower = value.toLowerCase()
  return (
    lower.startsWith('http:') ||
    lower.startsWith('https:') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:')
  )
}

function isAllowedSrc(value: string) {
  if (!value) return false
  if (isSafeRelativeUrl(value)) return true

  const lower = value.toLowerCase()
  return (
    lower.startsWith('http:') ||
    lower.startsWith('https:') ||
    lower.startsWith('data:image/')
  )
}

function sanitizeUrlAttribute(tagName: string, attrName: string, attrValue: string) {
  const trimmed = attrValue.trim()
  if (!trimmed) {
    return null
  }

  if (attrName === 'href') {
    return isAllowedHref(trimmed) ? trimmed : null
  }

  if (attrName === 'src' || attrName === 'xlink:href') {
    return isAllowedSrc(trimmed) ? trimmed : null
  }

  if (attrName === 'action' || attrName === 'formaction') {
    return tagName === 'form' && isAllowedHref(trimmed) ? trimmed : null
  }

  return trimmed
}

function normalizeSanitizedDocument(doc: Document) {
  const root = doc.body ?? doc.documentElement
  const elements = Array.from(root.querySelectorAll('*'))

  for (const element of elements) {
    for (const attr of Array.from(element.attributes)) {
      const attrName = attr.name.toLowerCase()
      if (attrName.startsWith('on')) {
        element.removeAttribute(attr.name)
        continue
      }

      if ((URL_ATTRS as readonly string[]).includes(attrName)) {
        const nextValue = sanitizeUrlAttribute(element.tagName.toLowerCase(), attrName, attr.value)
        if (nextValue === null) {
          element.removeAttribute(attr.name)
        } else {
          element.setAttribute(attr.name, nextValue)
        }
      }
    }

    if (element.tagName.toLowerCase() === 'a') {
      const href = element.getAttribute('href')
      if (!href) {
        element.removeAttribute('target')
        element.removeAttribute('rel')
        continue
      }

      const target = element.getAttribute('target')
      if (target === '_blank') {
        element.setAttribute('rel', 'noopener noreferrer')
      }
    }
  }

  return doc.body ? doc.body.innerHTML : doc.documentElement.outerHTML
}

function sanitizeHtmlFragment(html: string, options?: { forbidAttrs?: string[] }) {
  const purified = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: false },
    FORBID_TAGS,
    FORBID_ATTR: options?.forbidAttrs,
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['target', 'rel'],
  })

  const parser = new DOMParser()
  const doc = parser.parseFromString(purified, 'text/html')
  return normalizeSanitizedDocument(doc)
}

function sanitizeForeignObjectFragment(html: string) {
  const purified = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: false },
    FORBID_TAGS,
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['target', 'rel', 'xmlns', 'style', 'class'],
  })

  const parser = new DOMParser()
  const doc = parser.parseFromString(purified, 'text/html')
  return normalizeSanitizedDocument(doc)
}

function convertHtmlFragmentToXhtml(html: string) {
  return html.replace(/<(br|hr|img|input|meta|link)([^>]*)>/gi, (_match, tagName: string, attrs: string) => {
    const trimmedAttrs = attrs.trimEnd()
    if (trimmedAttrs.endsWith('/')) {
      return `<${tagName}${trimmedAttrs}>`
    }
    return `<${tagName}${attrs} />`
  })
}

function sanitizeMarkup(
  html: string,
  options: {
    useHtmlProfile: boolean
    useSvgProfile: boolean
    forbidTags: string[]
    forbidAttrs?: string[]
    addAttrs?: string[]
    addTags?: string[]
    parserMediaType?: DOMParserSupportedType
    serialize?: (doc: Document) => string
  }
) {
  const purified = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: options.useHtmlProfile, svg: options.useSvgProfile },
    FORBID_TAGS: options.forbidTags,
    FORBID_ATTR: options.forbidAttrs,
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: options.addAttrs,
    ADD_TAGS: options.addTags,
  })

  const parser = new DOMParser()
  const doc = parser.parseFromString(purified, options.parserMediaType || 'text/html')
  if (options.serialize) {
    normalizeSanitizedDocument(doc)
    return options.serialize(doc)
  }
  return normalizeSanitizedDocument(doc)
}

export function sanitizeRenderedHtml(html: string) {
  return sanitizeMarkup(html, {
    useHtmlProfile: true,
    useSvgProfile: true,
    forbidTags: FORBID_TAGS,
    forbidAttrs: FORBID_ATTR,
    addAttrs: ['target', 'rel'],
    parserMediaType: 'text/html',
  })
}

export function sanitizeRenderedSvg(svg: string) {
  const preservedForeignObjects: string[] = []
  const svgWithPlaceholders = svg.replace(/<foreignObject\b([^>]*)>[\s\S]*?<\/foreignObject>/gi, (match, attrs: string) => {
    const innerMatch = match.match(/^<foreignObject\b[^>]*>([\s\S]*?)<\/foreignObject>$/i)
    preservedForeignObjects.push(innerMatch?.[1] || '')
    const placeholderIndex = preservedForeignObjects.length - 1
    return `<foreignObject${attrs} ${SVG_PLACEHOLDER_ATTR}="${placeholderIndex}"></foreignObject>`
  })

  const purified = sanitizeMarkup(svgWithPlaceholders, {
    useHtmlProfile: true,
    useSvgProfile: true,
    forbidTags: SVG_FORBID_TAGS,
    addTags: ['foreignObject'],
    addAttrs: [SVG_PLACEHOLDER_ATTR],
    parserMediaType: 'image/svg+xml',
    serialize: (doc) => doc.documentElement.outerHTML,
  })

  return purified.replace(
    new RegExp(`<foreignObject([^>]*) ${SVG_PLACEHOLDER_ATTR}="(\\d+)"([^>]*)(?:><\\/foreignObject>|\\s*\\/>)`, 'gi'),
    (_match, beforeAttrs: string, indexText: string, afterAttrs: string) => {
      const foreignObjectIndex = Number.parseInt(indexText, 10)
      const originalInner = preservedForeignObjects[foreignObjectIndex] || ''
      const sanitizedInner = convertHtmlFragmentToXhtml(sanitizeForeignObjectFragment(originalInner))
      return `<foreignObject${beforeAttrs}${afterAttrs}>${sanitizedInner}</foreignObject>`
    }
  )
}

export default sanitizeRenderedHtml
