import { describe, expect, it } from 'vitest'
import { getGitProviderErrorContext, normalizeGitProviderError } from '@/lib/git/provider-errors'

describe('provider error normalization', () => {
  it('maps auth failures into the shared provider error contract', () => {
    const error = normalizeGitProviderError('github', {
      status: 401,
      message: 'Bad credentials',
    })

    expect(error.name).toBe('GitProviderError')
    expect(error.code).toBe('auth_failed')
    expect(error.message).toBe('Authentication failed. Please check your access token.')
    expect(error.status).toBe(401)
  })

  it('maps 404 branch problems separately from generic not found errors', () => {
    const branchError = normalizeGitProviderError('gitee', {
      status: 404,
      message: 'Branch main does not exist',
    })
    const pathError = normalizeGitProviderError('gitee', {
      status: 404,
      message: 'Not Found',
    })

    expect(branchError.code).toBe('branch_not_found')
    expect(pathError.code).toBe('not_found')
  })

  it('maps sha/outdated failures into conflict and exposes normalized context', () => {
    const error = normalizeGitProviderError('gitlab', {
      status: 422,
      message: 'sha does not match the current version',
    })

    expect(error.code).toBe('conflict')
    expect(getGitProviderErrorContext(error)).toEqual({
      code: 'conflict',
      status: 422,
      message: 'Remote conflict detected. Please refresh and resolve local changes first.',
    })
  })

  it('maps missing status failures into network_error with fallback message', () => {
    const error = normalizeGitProviderError('custom', new Error('socket hang up'))

    expect(error.code).toBe('network_error')
    expect(error.message).toBe('socket hang up')
  })
})
