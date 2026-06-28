export function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function splitParagraphs(markdown: string) {
  return markdown
    .split(/\n{2,}/)
    .map((text, index) => ({
      index,
      text: text.trim(),
      start: markdown.indexOf(text),
    }))
    .filter((item) => item.text.length > 0)
}

export function tokenScore(left: string, right: string) {
  const leftTokens = new Set(normalizeText(left).split(/\s+/).filter(Boolean))
  const rightTokens = new Set(normalizeText(right).split(/\s+/).filter(Boolean))
  if (!leftTokens.size || !rightTokens.size) {
    return 0
  }

  let shared = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      shared += 1
    }
  })

  return shared / Math.max(leftTokens.size, rightTokens.size)
}

export function findNearestText(markdown: string, nearText?: string | null) {
  if (!nearText) return null
  const hitIndex = markdown.indexOf(nearText)
  return hitIndex >= 0 ? hitIndex : null
}
