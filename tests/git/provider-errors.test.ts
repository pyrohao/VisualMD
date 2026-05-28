import { describe, expect, it } from 'vitest'
import { GitProviderError, normalizeGitProviderError } from '@/lib/git/provider-errors'

describe('normalizeGitProviderError', () => {
  it('maps 401 errors to auth_failed', () => {
    const error = normalizeGitProviderError('github', {
      status: 401,
      message: 'Bad credentials',
    })

    expect(error).toBeInstanceOf(GitProviderError)
    expect(error.code).toBe('auth_failed')
    expect(error.message).toContain('Authentication failed')
  })

  it('maps rate limit errors to rate_limited', () => {
    const error = normalizeGitProviderError('github', {
      status: 403,
      message: 'API rate limit exceeded',
    })

    expect(error.code).toBe('rate_limited')
    expect(error.message).toContain('rate limit')
  })

  it('maps conflict-like messages to conflict', () => {
    const error = normalizeGitProviderError('gitee', {
      status: 422,
      message: 'sha does not match current revision',
    })

    expect(error.code).toBe('conflict')
    expect(error.message).toContain('Remote conflict')
  })

  it('maps plain thrown errors to network_error when status is missing', () => {
    const error = normalizeGitProviderError('gitlab', new Error('socket hang up'))

    expect(error.code).toBe('network_error')
    expect(error.message).toContain('socket hang up')
  })
})
