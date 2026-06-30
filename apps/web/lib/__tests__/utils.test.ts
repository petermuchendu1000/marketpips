import { describe, it, expect } from 'vitest'
import {
  formatVolume,
  formatPercent,
  slugify,
  truncate,
  avatarColor,
} from '@/lib/utils'

describe('formatVolume', () => {
  it('formats millions', () => expect(formatVolume(2_500_000)).toBe('$2.5M'))
  it('formats thousands', () => expect(formatVolume(12_300)).toBe('$12.3K'))
  it('formats small values', () => expect(formatVolume(450)).toBe('$450'))
})

describe('formatPercent', () => {
  it('defaults to 0 decimals', () => expect(formatPercent(0.731)).toBe('73%'))
  it('respects decimals', () => expect(formatPercent(0.7311, 1)).toBe('73.1%'))
})

describe('slugify', () => {
  it('lowercases and dashes', () =>
    expect(slugify('Will BTC hit $100k?')).toBe('will-btc-hit-100k'))
  it('trims dashes', () => expect(slugify('  Hello  World  ')).toBe('hello-world'))
})

describe('truncate', () => {
  it('leaves short strings', () => expect(truncate('abc', 10)).toBe('abc'))
  it('adds ellipsis', () => expect(truncate('abcdefghij', 5)).toBe('abcde…'))
})

describe('avatarColor', () => {
  it('is deterministic', () =>
    expect(avatarColor('user-123')).toBe(avatarColor('user-123')))
  it('returns a tailwind bg class', () =>
    expect(avatarColor('zeta')).toMatch(/^bg-[a-z]+-500$/))
})
