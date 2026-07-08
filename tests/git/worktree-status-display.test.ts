import { describe, expect, it } from 'vitest'
import { getGitWorktreeStatusBadge, getGitWorktreeStatusTitle } from '@/lib/git/worktree-status-display'

describe('git worktree status display', () => {
  it('shows untracked files as U instead of porcelain ??', () => {
    expect(getGitWorktreeStatusBadge({ worktree: 'untracked' })).toBe('U')
    expect(getGitWorktreeStatusTitle({ worktree: 'untracked' })).toBe('Untracked')
  })

  it('hides tracked staged-only modifications from the worktree tree badge', () => {
    expect(getGitWorktreeStatusBadge({ index: 'modified' })).toBeNull()
    expect(getGitWorktreeStatusTitle({ index: 'modified' })).toBeNull()
  })

  it('shows staged new files as A', () => {
    expect(getGitWorktreeStatusBadge({ index: 'added' })).toBe('A')
    expect(getGitWorktreeStatusTitle({ index: 'added' })).toBe('Added')
  })

  it('shows M after a file is edited again relative to the staged snapshot', () => {
    expect(getGitWorktreeStatusBadge({ index: 'modified', worktree: 'modified' })).toBe('M')
    expect(getGitWorktreeStatusBadge({ index: 'added', worktree: 'modified' })).toBe('M')
  })

  it('shows deletes as D', () => {
    expect(getGitWorktreeStatusBadge({ index: 'deleted' })).toBe('D')
    expect(getGitWorktreeStatusBadge({ worktree: 'deleted' })).toBe('D')
    expect(getGitWorktreeStatusTitle({ index: 'deleted' })).toBe('Deleted')
  })
})
