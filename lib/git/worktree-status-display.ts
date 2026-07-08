import type { GitWorktreeStatus } from './worktree'

export function getGitWorktreeStatusBadge(status: GitWorktreeStatus | undefined) {
  if (!status) {
    return null
  }

  if (status.index === 'deleted' || status.worktree === 'deleted') {
    return 'D'
  }

  if (status.worktree === 'untracked') {
    return 'U'
  }

  if (status.worktree === 'modified') {
    return 'M'
  }

  if (status.index === 'added') {
    return 'A'
  }

  return null
}

export function getGitWorktreeStatusTitle(status: GitWorktreeStatus | undefined) {
  const badge = getGitWorktreeStatusBadge(status)
  if (!badge) {
    return null
  }

  if (badge === 'D') {
    return 'Deleted'
  }

  if (badge === 'U') {
    return 'Untracked'
  }

  if (badge === 'A') {
    return 'Added'
  }

  return 'Modified'
}
