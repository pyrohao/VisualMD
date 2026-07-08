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
  const elements = Array.from(doc.body.querySelectorAll('*'))

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

  return doc.body.innerHTML
}

export function sanitizeRenderedHtml(html: string) {
  const purified = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true },
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['target', 'rel'],
  })

  const parser = new DOMParser()
  const doc = parser.parseFromString(purified, 'text/html')
  return normalizeSanitizedDocument(doc)
}

export default sanitizeRenderedHtml
