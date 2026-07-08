import { describe, expect, it } from 'vitest'
import {
  initialsFor,
  monogram,
  hashString,
  normalizeDomain,
  isHttpUrl,
  faviconUrl,
  resolveEntityImage,
} from '@/lib/media/entity-image'

describe('initialsFor', () => {
  it('takes two letters from a single word', () => {
    expect(initialsFor('Anthropic')).toBe('AN')
  })
  it('takes first + last initial from multiple words', () => {
    expect(initialsFor('Bola Ahmed Tinubu')).toBe('BT')
  })
  it('handles punctuation and empties', () => {
    expect(initialsFor('OpenAI, Inc.')).toBe('OI')
    expect(initialsFor('')).toBe('?')
    expect(initialsFor('   ')).toBe('?')
  })
})

describe('monogram', () => {
  it('is deterministic for the same name', () => {
    expect(monogram('Discord')).toEqual(monogram('Discord'))
  })
  it('is case/space-insensitive on colour', () => {
    expect(monogram('Discord').bg).toBe(monogram('  discord ').bg)
  })
  it('produces valid HSL strings', () => {
    const m = monogram('Kenya 2027')
    expect(m.bg).toMatch(/^hsl\(\d+ \d+% \d+%\)$/)
    expect(m.fg).toMatch(/^hsl\(\d+ \d+% \d+%\)$/)
  })
})

describe('hashString', () => {
  it('is stable and unsigned', () => {
    expect(hashString('a')).toBe(hashString('a'))
    expect(hashString('a')).toBeGreaterThanOrEqual(0)
    expect(hashString('a')).not.toBe(hashString('b'))
  })
})

describe('normalizeDomain', () => {
  it('strips scheme, path, www and lowercases', () => {
    expect(normalizeDomain('https://www.OpenAI.com/path')).toBe('openai.com')
    expect(normalizeDomain('Discord.com')).toBe('discord.com')
  })
  it('rejects non-domains', () => {
    expect(normalizeDomain('not a domain')).toBeNull()
    expect(normalizeDomain('')).toBeNull()
    expect(normalizeDomain(null)).toBeNull()
  })
})

describe('isHttpUrl', () => {
  it('accepts http(s) only', () => {
    expect(isHttpUrl('https://x.com/a.png')).toBe(true)
    expect(isHttpUrl('ftp://x')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
    expect(isHttpUrl(undefined)).toBe(false)
  })
})

describe('faviconUrl', () => {
  it('builds a sized favicon URL from a domain', () => {
    expect(faviconUrl('https://openai.com', 128)).toBe(
      'https://www.google.com/s2/favicons?domain=openai.com&sz=128',
    )
    expect(faviconUrl('nonsense here')).toBeNull()
  })
})

describe('resolveEntityImage', () => {
  it('prefers a valid image URL', () => {
    const r = resolveEntityImage({ name: 'Discord', imageUrl: 'https://cdn/x.webp' })
    expect(r.kind).toBe('image')
    expect(r.src).toBe('https://cdn/x.webp')
    expect(r.mono.initials).toBe('DI')
  })
  it('falls back to a monogram when the URL is missing/invalid', () => {
    expect(resolveEntityImage({ name: 'Discord', imageUrl: null }).kind).toBe('monogram')
    expect(resolveEntityImage({ name: 'Discord', imageUrl: 'javascript:1' }).kind).toBe('monogram')
  })
})
