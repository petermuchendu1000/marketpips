import { describe, it, expect } from 'vitest'
import {
  publicCache,
  presetHeaders,
  noStoreHeaders,
  classifyRoute,
  isPrivatePath,
  PRIVATE_NO_STORE,
  CACHE_PRESETS,
} from '@/lib/http/cache-headers'

describe('cache-headers: publicCache builder', () => {
  it('emits directives in deterministic order', () => {
    expect(publicCache({ sMaxAge: 30, staleWhileRevalidate: 60 })).toBe(
      'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
    )
  })
  it('omits SWR when not provided', () => {
    expect(publicCache({ sMaxAge: 15 })).toBe('public, max-age=0, s-maxage=15')
  })
  it('honors a browser max-age override', () => {
    expect(publicCache({ sMaxAge: 3600, maxAge: 60, staleWhileRevalidate: 86400 })).toBe(
      'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400',
    )
  })
})

describe('cache-headers: presets & helpers', () => {
  it('presetHeaders returns a Cache-Control header for each preset', () => {
    for (const key of Object.keys(CACHE_PRESETS) as (keyof typeof CACHE_PRESETS)[]) {
      const h = presetHeaders(key)
      expect(h['Cache-Control']).toContain('public')
      expect(h['Cache-Control']).toContain('s-maxage=')
    }
  })
  it('noStoreHeaders forbids caching', () => {
    expect(noStoreHeaders()['Cache-Control']).toBe(PRIVATE_NO_STORE)
  })
})

describe('cache-headers: route classification (correctness contract)', () => {
  it('classifies user-scoped/mutating routes as private (no-store)', () => {
    for (const p of [
      '/api/portfolio',
      '/api/notifications',
      '/api/notifications/preferences',
      '/api/admin/users',
      '/api/orders',
      '/api/payments/deposit',
      '/api/webhooks/mpesa',
      '/api/cron/close-markets',
    ]) {
      expect(classifyRoute(p)).toBe('private')
      expect(isPrivatePath(p)).toBe(true)
    }
  })

  it('classifies public market/leaderboard reads as cacheable', () => {
    expect(classifyRoute('/api/markets')).toBe('public-cacheable')
    expect(classifyRoute('/api/markets/some-slug')).toBe('public-cacheable')
    expect(classifyRoute('/api/leaderboard')).toBe('public-cacheable')
    expect(isPrivatePath('/api/markets')).toBe(false)
  })

  it('treats unknown/search routes as dynamic (not private, not cached)', () => {
    expect(classifyRoute('/api/search')).toBe('dynamic')
  })

  it('does not treat a prefix collision as a match', () => {
    // '/api/orders-export' should NOT match the '/api/orders' private prefix.
    expect(classifyRoute('/api/orders-export')).toBe('dynamic')
  })
})
