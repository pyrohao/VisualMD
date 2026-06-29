import { describe, expect, it } from 'vitest'
import {
  hasMeaningfulGitContentChange,
  hasMeaningfulLocalGitChange,
  hasMeaningfulRemoteGitChange,
  normalizeGitComparableContent,
} from '@/lib/git/sync'

describe('git sync comparison helpers', () => {
  it('normalizes whitespace and newlines for comparison', () => {
    expect(normalizeGitComparableContent('a \n\t b  c')).toBe('abc')
  })

  it('treats whitespace-only local changes as clean', () => {
    expect(hasMeaningfulLocalGitChange('# Title\n\nHello world', '# Title \n Hello   world')).toBe(false)
  })

  it('detects meaningful local text changes', () => {
    expect(hasMeaningfulLocalGitChange('# Title\n\nHello world', '# Title\n\nHello VisualMD')).toBe(true)
  })

  it('treats whitespace-only remote changes as unchanged even when sha differs', () => {
    expect(
      hasMeaningfulRemoteGitChange('# Title \n Hello   world', '# Title\n\nHello world', 'remote-sha', 'base-sha')
    ).toBe(false)
  })

  it('uses matching sha as a fast path for remote equality', () => {
    expect(
      hasMeaningfulRemoteGitChange('# Title\n\nHello VisualMD', '# Title\n\nHello world', 'same-sha', 'same-sha')
    ).toBe(false)
  })

  it('detects meaningful remote text changes when base and remote differ', () => {
    expect(hasMeaningfulRemoteGitChange('# Title\n\nHello VisualMD', '# Title\n\nHello world')).toBe(true)
    expect(hasMeaningfulGitContentChange('alpha', 'beta')).toBe(true)
  })
})
