import { describe, expect, it } from 'vitest'
import { isPureLocalNewGitDraft } from '@/lib/git/draft-guards'

describe('git store behavior guards', () => {
  it('treats local staged new drafts as non-remote documents', () => {
    expect(isPureLocalNewGitDraft({ isNew: true, creationSource: 'local' })).toBe(true)
    expect(isPureLocalNewGitDraft({ isNew: true, creationSource: 'git' })).toBe(false)
    expect(isPureLocalNewGitDraft({ isNew: false, creationSource: 'local' })).toBe(false)
    expect(isPureLocalNewGitDraft(undefined)).toBe(false)
  })
})
