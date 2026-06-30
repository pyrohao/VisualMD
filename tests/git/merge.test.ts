import { describe, expect, it } from 'vitest'
import { mergeGitText } from '@/lib/git/merge'

describe('mergeGitText', () => {
  it('keeps shared local and remote content without conflicts', () => {
    const result = mergeGitText('# Title\nHello', '# Title\nHello world', '# Title\nHello world')

    expect(result.hasConflicts).toBe(false)
    expect(result.mergedText).toBe('# Title\nHello world')
  })

  it('accepts remote when local equals base', () => {
    const result = mergeGitText('# Title\nHello', '# Title\nHello', '# Title\nRemote')

    expect(result.hasConflicts).toBe(false)
    expect(result.mergedText).toBe('# Title\nRemote')
  })

  it('accepts local when remote equals base', () => {
    const result = mergeGitText('# Title\nHello', '# Title\nLocal', '# Title\nHello')

    expect(result.hasConflicts).toBe(false)
    expect(result.mergedText).toBe('# Title\nLocal')
  })

  it('preserves independent line edits automatically', () => {
    const result = mergeGitText(
      '# Title\nLine A\nLine B',
      '# Title\nLine A changed\nLine B',
      '# Title\nLine A\nLine B changed'
    )

    expect(result.hasConflicts).toBe(false)
    expect(result.mergedText).toBe('# Title\nLine A changed\nLine B changed')
  })

  it('creates explicit conflict markers when local and remote edit the same line differently', () => {
    const result = mergeGitText(
      '# Title\nHello',
      '# Title\nLocal change',
      '# Title\nRemote change'
    )

    expect(result.hasConflicts).toBe(true)
    expect(result.mergedText).toContain('<<<<<<< LOCAL')
    expect(result.mergedText).toContain('Local change')
    expect(result.mergedText).toContain('Remote change')
    expect(result.conflictBlocks).toHaveLength(1)
  })

  it('merges concurrent additions at the same base anchor with local appended after remote', () => {
    const result = mergeGitText(
      '# Title\nBody',
      '# Title\nLocal add\nBody',
      '# Title\nRemote add\nBody'
    )

    expect(result.hasConflicts).toBe(false)
    expect(result.mergedText).toBe('# Title\nRemote add\nLocal add\nBody')
  })

  it('merges concurrent eof additions when the base ends with a trailing newline', () => {
    const result = mergeGitText(
      '# Title\n## 原始内容\n',
      '# Title\n## 原始内容\n## 在web添加内容1\n',
      '# Title\n## 原始内容\n## 在gitee上添加的内容2\n'
    )

    expect(result.hasConflicts).toBe(false)
    expect(result.mergedText).toBe('# Title\n## 原始内容\n## 在gitee上添加的内容2\n## 在web添加内容1')
  })

  it('merges local delete with remote insert without conflict', () => {
    const result = mergeGitText(
      'Keep\nOld line\nTail',
      'Keep\nTail',
      'Keep\nRemote add\nOld line\nTail'
    )

    expect(result.hasConflicts).toBe(false)
    expect(result.mergedText).toBe('Keep\nRemote add\nTail')
  })

  it('treats concurrent modifications of the same base segment as a conflict', () => {
    const result = mergeGitText(
      'Line 1\nLine 2\nLine 3',
      'Line 1\nLocal 2\nLine 3',
      'Line 1\nRemote 2\nLine 3'
    )

    expect(result.hasConflicts).toBe(true)
    expect(result.conflictBlocks).toHaveLength(1)
    expect(result.mergedText).toContain('<<<<<<< LOCAL')
    expect(result.mergedText).toContain('Local 2')
    expect(result.mergedText).toContain('Remote 2')
  })

  it('treats modify vs delete on the same base segment as a conflict', () => {
    const result = mergeGitText(
      'Line 1\nLine 2\nLine 3',
      'Line 1\nLocal 2\nLine 3',
      'Line 1\nLine 3'
    )

    expect(result.hasConflicts).toBe(true)
    expect(result.conflictBlocks).toHaveLength(1)
    expect(result.mergedText).toContain('<<<<<<< LOCAL')
    expect(result.mergedText).toContain('Local 2')
  })

  it('treats insertions inside another side modified base range as a conflict', () => {
    const result = mergeGitText(
      'A\nB\nC\nD',
      'A\nB local\nC local\nD',
      'A\nB\nInserted\nC\nD'
    )

    expect(result.hasConflicts).toBe(true)
    expect(result.conflictBlocks).toHaveLength(1)
    expect(result.mergedText).toContain('Inserted')
    expect(result.mergedText).toContain('B local')
  })
})
