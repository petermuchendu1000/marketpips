import { describe, it, expect } from 'vitest'
import { withNext } from '@/lib/auth-redirect'

describe('withNext', () => {
  it('appends a sanitized, encoded next to a bare path', () => {
    expect(withNext('/auth/register', '/markets/abc')).toBe('/auth/register?next=%2Fmarkets%2Fabc')
    expect(withNext('/auth/login', '/portfolio')).toBe('/auth/login?next=%2Fportfolio')
  })

  it('encodes query strings inside the next value', () => {
    expect(withNext('/auth/login', '/markets/x?ref=abc')).toBe(
      '/auth/login?next=%2Fmarkets%2Fx%3Fref%3Dabc',
    )
  })

  it('uses & when the base path already has a query', () => {
    expect(withNext('/auth/login?foo=1', '/markets/x')).toBe('/auth/login?foo=1&next=%2Fmarkets%2Fx')
  })

  it('drops a missing / empty next', () => {
    expect(withNext('/auth/login', null)).toBe('/auth/login')
    expect(withNext('/auth/login', undefined)).toBe('/auth/login')
    expect(withNext('/auth/login', '')).toBe('/auth/login')
  })

  it('drops a no-op root destination', () => {
    expect(withNext('/auth/login', '/')).toBe('/auth/login')
  })

  it('drops open-redirect attempts (protocol-relative, backslash, scheme)', () => {
    expect(withNext('/auth/login', '//evil.com')).toBe('/auth/login')
    expect(withNext('/auth/login', '/\\evil.com')).toBe('/auth/login')
    expect(withNext('/auth/login', 'https://evil.com')).toBe('/auth/login')
    expect(withNext('/auth/login', 'javascript:alert(1)')).toBe('/auth/login')
  })

  it('is idempotent-safe: a preserved next round-trips through decode', () => {
    const href = withNext('/auth/register', '/markets/abc')
    const value = new URLSearchParams(href.split('?')[1]).get('next')
    expect(value).toBe('/markets/abc')
  })
})
