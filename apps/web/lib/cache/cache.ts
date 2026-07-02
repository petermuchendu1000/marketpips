// lib/cache/cache.ts — read-through cache with single-flight & key versioning.
//
// `cached(key, ttl, loader)` returns a cached value or computes it via `loader`,
// storing the result. Keys are namespaced and version-prefixed (`mp:v1:…`) so a
// version bump (or new deploy shipping a new prefix) invalidates everything at
// once. In-process single-flight de-dupes concurrent misses for the same key so
// a cold cache doesn't stampede the DB. When Redis is unconfigured, `cached`
// transparently calls the loader (no caching) — correctness is never affected.

import { getRedis, type KVClient } from './redis'

export const CACHE_VERSION = 'v1'
const NAMESPACE = 'mp'

/** Build a namespaced, versioned cache key. */
export function cacheKey(parts: string | string[], version = CACHE_VERSION): string {
  const tail = Array.isArray(parts) ? parts.join(':') : parts
  return `${NAMESPACE}:${version}:${tail}`
}

// Per-isolate in-flight map for single-flight de-duplication.
const inflight = new Map<string, Promise<unknown>>()

export interface CachedOptions {
  /** Inject a client (tests); defaults to the process Redis client. */
  client?: KVClient | null
  /** Version override for the key namespace. */
  version?: string
  /**
   * Cache falsy/empty results too? Default false — we skip caching `null`/
   * `undefined` to avoid pinning a transient miss (negative-cache guard).
   */
  cacheEmpty?: boolean
}

/**
 * Read-through cache. Returns the parsed cached value on hit; otherwise runs
 * `loader`, stores the JSON result with `ttlSeconds`, and returns it.
 * Fails soft: any cache error falls back to `loader`.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  opts: CachedOptions = {},
): Promise<T> {
  const client = opts.client !== undefined ? opts.client : getRedis()
  const fullKey = cacheKey(key, opts.version)

  if (!client) return loader() // no cache configured → passthrough

  // Try a cache hit.
  try {
    const hit = await client.get(fullKey)
    if (hit != null) return JSON.parse(hit) as T
  } catch {
    // fall through to loader on any read error
  }

  // Single-flight: coalesce concurrent misses for the same key.
  const existing = inflight.get(fullKey)
  if (existing) return existing as Promise<T>

  const p = (async (): Promise<T> => {
    const value = await loader()
    const shouldStore = opts.cacheEmpty || (value !== null && value !== undefined)
    if (shouldStore) {
      try {
        await client.set(fullKey, JSON.stringify(value), ttlSeconds)
      } catch {
        // best-effort write; ignore
      }
    }
    return value
  })()

  inflight.set(fullKey, p)
  try {
    return await p
  } finally {
    inflight.delete(fullKey)
  }
}

/** Explicitly invalidate a cached key (best-effort). */
export async function cacheBust(key: string, opts: { client?: KVClient | null; version?: string } = {}): Promise<void> {
  const client = opts.client !== undefined ? opts.client : getRedis()
  if (!client) return
  try {
    await client.del(cacheKey(key, opts.version))
  } catch {
    // best-effort
  }
}
