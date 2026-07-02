// lib/http/cache-headers.ts — typed Cache-Control builders & route classifier.
//
// The correctness contract for Module 15: anything gated by a user's JWT/RLS is
// `private, no-store`; public, non-user data is opt-in edge-cacheable with an
// s-maxage + stale-while-revalidate window. These pure helpers centralize that
// policy so it is consistent and unit-testable, and so a private route can never
// silently become cacheable.

export interface PublicCacheOptions {
  /** Shared-cache (CDN/edge) TTL in seconds. */
  sMaxAge: number
  /** Seconds a stale response may be served while revalidating. */
  staleWhileRevalidate?: number
  /** Browser TTL in seconds (default 0 → browser always revalidates). */
  maxAge?: number
}

/** Never cache: user-scoped / authenticated responses. */
export const PRIVATE_NO_STORE = 'private, no-store'

/** Build a `public` Cache-Control string with deterministic directive order. */
export function publicCache(o: PublicCacheOptions): string {
  const parts = ['public', `max-age=${o.maxAge ?? 0}`, `s-maxage=${o.sMaxAge}`]
  if (o.staleWhileRevalidate && o.staleWhileRevalidate > 0) {
    parts.push(`stale-while-revalidate=${o.staleWhileRevalidate}`)
  }
  return parts.join(', ')
}

/** Named presets (see docs/15-PERFORMANCE-CACHING.md §5). */
export const CACHE_PRESETS = {
  marketsList: { sMaxAge: 30, staleWhileRevalidate: 60 },
  marketActive: { sMaxAge: 15, staleWhileRevalidate: 30 },
  marketResolved: { sMaxAge: 3600, staleWhileRevalidate: 86400 },
  leaderboard: { sMaxAge: 60, staleWhileRevalidate: 120 },
  exchangeRates: { sMaxAge: 300, staleWhileRevalidate: 600 },
} as const satisfies Record<string, PublicCacheOptions>

export type CachePreset = keyof typeof CACHE_PRESETS

/** Convenience: Cache-Control header object for a named preset. */
export function presetHeaders(preset: CachePreset): Record<string, string> {
  return { 'Cache-Control': publicCache(CACHE_PRESETS[preset]) }
}

/** Header object that forbids any caching. */
export function noStoreHeaders(): Record<string, string> {
  return { 'Cache-Control': PRIVATE_NO_STORE }
}

// Route classification -------------------------------------------------------
// User-scoped or mutating surfaces that must NEVER be cached.
const PRIVATE_PREFIXES = [
  '/api/portfolio',
  '/api/notifications',
  '/api/admin',
  '/api/orders',
  '/api/payments',
  '/api/webhooks',
  '/api/cron',
]

// Public, cacheable GET surfaces.
const PUBLIC_CACHEABLE_PREFIXES = ['/api/markets', '/api/leaderboard']

export type RouteCacheClass = 'private' | 'public-cacheable' | 'dynamic'

/**
 * Classify a request path for caching. `private` → must be `no-store`;
 * `public-cacheable` → may be edge-cached; `dynamic` → not cached but not
 * inherently private (e.g. search results). Pure & unit-tested.
 */
export function classifyRoute(pathname: string): RouteCacheClass {
  if (PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return 'private'
  }
  if (PUBLIC_CACHEABLE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return 'public-cacheable'
  }
  return 'dynamic'
}

/** True when a path must be served `private, no-store`. */
export function isPrivatePath(pathname: string): boolean {
  return classifyRoute(pathname) === 'private'
}
