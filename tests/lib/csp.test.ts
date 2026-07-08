import { describe, expect, it } from 'vitest'
import { buildCspHeader } from '@/lib/csp'

describe('buildCspHeader', () => {
  it('includes the required CSP directives for the app', () => {
    const nonce = 'testnonce123'
    const csp = buildCspHeader(nonce)

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' https:`)
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("img-src 'self' data: blob: https:")
    expect(csp).toContain("connect-src 'self' https:")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
  })
})
