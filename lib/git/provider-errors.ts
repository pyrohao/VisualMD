type GitProviderName = 'github' | 'gitee' | 'gitlab' | 'custom'

export type GitProviderErrorCode =
  | 'auth_failed'
  | 'permission_denied'
  | 'not_found'
  | 'branch_not_found'
  | 'rate_limited'
  | 'conflict'
  | 'validation_failed'
  | 'service_unavailable'
  | 'network_error'
  | 'unknown'

export class GitProviderError extends Error {
  code: GitProviderErrorCode
  provider: GitProviderName
  status?: number
  details?: string

  constructor(message: string, options: {
    code: GitProviderErrorCode
    provider: GitProviderName
    status?: number
    details?: string
    cause?: unknown
  }) {
    super(message)
    this.name = 'GitProviderError'
    this.code = options.code
    this.provider = options.provider
    this.status = options.status
    this.details = options.details
    if ('cause' in Error.prototype) {
      // no-op for runtimes without structured cause support
    }
    ;(this as Error & { cause?: unknown }).cause = options.cause
  }
}

function readMessage(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message

  if (typeof error === 'object') {
    const anyError = error as Record<string, unknown>
    const response = anyError.response as Record<string, unknown> | undefined
    const responseData = response?.data as Record<string, unknown> | undefined

    const candidates = [
      anyError.message,
      anyError.error,
      anyError.error_description,
      responseData?.message,
      responseData?.error,
      responseData?.error_description,
      responseData?.msg,
    ]
    const first = candidates.find((item) => typeof item === 'string' && item.trim())
    return typeof first === 'string' ? first : ''
  }

  return ''
}

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined

  const anyError = error as Record<string, unknown>
  const rawStatus = anyError.status
  if (typeof rawStatus === 'number') return rawStatus

  const response = anyError.response as Record<string, unknown> | undefined
  if (typeof response?.status === 'number') return response.status

  return undefined
}

function looksLikeRateLimit(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('rate limit') || normalized.includes('too many requests')
}

function looksLikeConflict(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('conflict') ||
    normalized.includes('sha') ||
    normalized.includes('outdated') ||
    normalized.includes('already exists') ||
    normalized.includes('not match') ||
    normalized.includes('failed to update') ||
    normalized.includes('fast forward')
  )
}

function looksLikeBranchNotFound(message: string) {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('branch') &&
    (normalized.includes('not found') || normalized.includes('does not exist'))
  )
}

function resolveCode(status: number | undefined, message: string): GitProviderErrorCode {
  if (status === 401) return 'auth_failed'
  if (status === 403) {
    if (looksLikeRateLimit(message)) return 'rate_limited'
    return 'permission_denied'
  }
  if (status === 404) {
    if (looksLikeBranchNotFound(message)) return 'branch_not_found'
    return 'not_found'
  }
  if (status === 409) return 'conflict'
  if (status === 422) {
    if (looksLikeConflict(message)) return 'conflict'
    return 'validation_failed'
  }
  if (status === 429 || looksLikeRateLimit(message)) return 'rate_limited'
  if (status !== undefined && status >= 500) return 'service_unavailable'
  if (looksLikeConflict(message)) return 'conflict'
  return status === undefined ? 'network_error' : 'unknown'
}

function toUserMessage(code: GitProviderErrorCode, fallback: string) {
  if (code === 'auth_failed') return 'Authentication failed. Please check your access token.'
  if (code === 'permission_denied') return 'Permission denied. You do not have access to this repository or action.'
  if (code === 'not_found') return 'Repository resource not found. Please verify owner, repo, and path.'
  if (code === 'branch_not_found') return 'Branch not found. Please verify the selected branch.'
  if (code === 'rate_limited') return 'API rate limit reached. Please retry later.'
  if (code === 'conflict') return 'Remote conflict detected. Please refresh and resolve local changes first.'
  if (code === 'validation_failed') return 'Request validation failed. Please verify your commit payload.'
  if (code === 'service_unavailable') return 'Git service is temporarily unavailable. Please retry later.'
  if (code === 'network_error') return fallback || 'Network error. Please check connectivity and retry.'
  return fallback || 'Git operation failed.'
}

export function normalizeGitProviderError(provider: GitProviderName, error: unknown) {
  if (error instanceof GitProviderError) return error

  const message = readMessage(error)
  const status = readStatus(error)
  const code = resolveCode(status, message)
  const userMessage = toUserMessage(code, message)

  return new GitProviderError(userMessage, {
    code,
    provider,
    status,
    details: message || undefined,
    cause: error,
  })
}

export async function withGitProviderError<T>(
  provider: GitProviderName,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw normalizeGitProviderError(provider, error)
  }
}

export function getGitProviderErrorContext(error: unknown): {
  code?: GitProviderErrorCode
  status?: number
  message: string
} {
  if (error instanceof GitProviderError) {
    return {
      code: error.code,
      status: error.status,
      message: error.message,
    }
  }

  const message = readMessage(error)
  const status = readStatus(error)

  return {
    status,
    message: message || 'Git operation failed.',
  }
}
