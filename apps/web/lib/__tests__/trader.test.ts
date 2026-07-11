import { describe, it, expect } from 'vitest'
import {
  traderHash,
  traderRng,
  hslToRgb,
  traderOrb,
  traderGradient,
  traderName,
  joinedMonthYear,
  ORB_POSITIONS,
} from '@/lib/trader'

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

describe('traderRng', () => {
  it('is deterministic for the same seed', () => {
    const a = traderRng(12345)
    const b = traderRng(12345)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('returns values in [0, 1)', () => {
    const r = traderRng(traderHash('seed'))
    for (let i = 0; i < 50; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('hslToRgb', () => {
  it('maps primary colors correctly', () => {
    expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0])
    expect(hslToRgb(120, 100, 50)).toEqual([0, 255, 0])
    expect(hslToRgb(240, 100, 50)).toEqual([0, 0, 255])
  })
  it('maps black and white', () => {
    expect(hslToRgb(0, 0, 0)).toEqual([0, 0, 0])
    expect(hslToRgb(0, 0, 100)).toEqual([255, 255, 255])
  })
})

describe('traderOrb', () => {
  it('is deterministic per id (stable across renders)', () => {
    const id = '7b697424-4a0a-46dc-8b64-1756e8439c9f'
    expect(traderOrb(id)).toEqual(traderOrb(id))
  })
  it('produces distinct orbs for distinct ids', () => {
    expect(traderOrb('user-a').image).not.toBe(traderOrb('user-b').image)
  })
  it('emits one radial-gradient layer per fixed anchor position (no letter)', () => {
    const { image, base } = traderOrb('x')
    const layers = image.match(/radial-gradient\(/g) ?? []
    expect(layers.length).toBe(ORB_POSITIONS.length)
    ORB_POSITIONS.forEach(([px, py]) => expect(image).toContain(`at ${px}% ${py}%`))
    expect(base).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
  })
})

describe('traderGradient (back-compat)', () => {
  it('returns the orb background-image string', () => {
    expect(traderGradient('x')).toBe(traderOrb('x').image)
    expect(traderGradient('x')).toContain('radial-gradient(')
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
