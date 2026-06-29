export function normalizeGitComparableContent(content: string) {
  return content.replace(/\s+/g, '')
}

export function hasMeaningfulGitContentChange(left: string, right: string) {
  return normalizeGitComparableContent(left) !== normalizeGitComparableContent(right)
}

export function hasMeaningfulLocalGitChange(localContent: string, baseContent: string) {
  return hasMeaningfulGitContentChange(localContent, baseContent)
}

export function hasMeaningfulRemoteGitChange(remoteContent: string, baseContent: string, remoteSha?: string, baseSha?: string) {
  if (remoteSha && baseSha && remoteSha === baseSha) {
    return false
  }

  return hasMeaningfulGitContentChange(remoteContent, baseContent)
}
