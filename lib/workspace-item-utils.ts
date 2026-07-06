function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function ensureMarkdownExtension(name: string) {
  return name.endsWith('.md') ? name : `${name}.md`
}

export function createDefaultMarkdownDocumentContent(fileName: string) {
  const docName = ensureMarkdownExtension(fileName).replace(/\.md$/, '')

  return `---
name: ${docName}
description:
---

# 新节点

开始编辑...`
}

export function generateUniqueItemName(
  existingNames: string[],
  desiredName: string,
  options: {
    extensionMode?: 'preserve' | 'markdown'
  } = {}
) {
  const extensionMode = options.extensionMode || 'preserve'
  const normalizedDesiredName = extensionMode === 'markdown'
    ? ensureMarkdownExtension(desiredName)
    : desiredName

  if (!existingNames.includes(normalizedDesiredName)) {
    return normalizedDesiredName
  }

  const hasExtension = extensionMode === 'markdown' || /\.[^./\\]+$/.test(normalizedDesiredName)
  const extension = hasExtension
    ? normalizedDesiredName.slice(normalizedDesiredName.lastIndexOf('.'))
    : ''
  const baseName = hasExtension
    ? normalizedDesiredName.slice(0, normalizedDesiredName.length - extension.length)
    : normalizedDesiredName
  const matcher = new RegExp(`^${escapeRegExp(baseName)}\\s*\\((\\d+)\\)${escapeRegExp(extension)}$`)

  let maxIndex = 0
  for (const existingName of existingNames) {
    const match = existingName.match(matcher)
    if (!match) continue

    const index = Number.parseInt(match[1] || '0', 10)
    if (index > maxIndex) {
      maxIndex = index
    }
  }

  return `${baseName} (${maxIndex + 1})${extension}`
}
