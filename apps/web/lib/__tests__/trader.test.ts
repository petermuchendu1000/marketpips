import { describe, it, expect } from 'vitest'
import { traderHash, traderGradient, traderName, joinedMonthYear } from '@/lib/trader'

describe('traderHash', () => {
  it('is deterministic for the same input', () => {
    expect(traderHash('abc')).toBe(traderHash('abc'))
  })
  it('differs for different inputs', () => {
    expect(traderHash('abc')).not.toBe(traderHash('abd'))
  })
  it('returns an unsigned 32-bit integer', () => {
    const h = traderHash('some-uuid-value')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
    expect(Number.isInteger(h)).toBe(true)
  })
})

describe('traderGradient', () => {
  it('is deterministic per id (stable across renders)', () => {
    const id = '7b697424-4a0a-46dc-8b64-1756e8439c9f'
    expect(traderGradient(id)).toBe(traderGradient(id))
  })
  it('produces distinct gradients for distinct ids', () => {
    expect(traderGradient('user-a')).not.toBe(traderGradient('user-b'))
  })
  it('emits a valid layered CSS gradient', () => {
    const g = traderGradient('x')
    expect(g).toContain('radial-gradient(')
    expect(g).toContain('linear-gradient(')
    expect(g).toContain('hsl(')
  })
})

describe('traderName', () => {
  it('prefers display_name', () => {
    expect(traderName({ display_name: 'Ada', username: 'ada99' }, 'id123456')).toBe('Ada')
  })
  it('falls back to @username', () => {
    expect(traderName({ display_name: null, username: 'ada99' }, 'id123456')).toBe('@ada99')
  })
  it('falls back to a short id label — never raw uuid soup', () => {
    expect(traderName({ display_name: null, username: null }, 'abcd1234-0000')).toBe('Trader abcd')
  })
  it('handles null/undefined user', () => {
    expect(traderName(null, 'wxyz9999')).toBe('Trader wxyz')
    expect(traderName(undefined, 'wxyz9999')).toBe('Trader wxyz')
  })
})

describe('joinedMonthYear', () => {
  it('formats an ISO date to "Mon YYYY"', () => {
    expect(joinedMonthYear('2026-01-15T00:00:00Z')).toBe('Jan 2026')
  })
  it('returns empty string for null/invalid', () => {
    expect(joinedMonthYear(null)).toBe('')
    expect(joinedMonthYear('not-a-date')).toBe('')
  })
})
