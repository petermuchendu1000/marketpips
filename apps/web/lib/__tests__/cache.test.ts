import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cached, cacheKey, cacheBust, CACHE_VERSION } from '@/lib/cache/cache'
import { enforceDistributed, enforceEdge } from '@/lib/security/rate-limit-redis'
import type { KVClient } from '@/lib/cache/redis'

// A minimal in-memory KVClient mock with TTL + INCR semantics for tests.
class FakeKV implements KVClient {
  store = new Map<string, { v: string; expireAt: number | null }>()
  now = 0
  getCalls = 0
  setCalls = 0
  private live(key: string) {
    const e = this.store.get(key)
    if (!e) return undefined
    if (e.expireAt != null && this.now >= e.expireAt) {
      this.store.delete(key)
      return undefined
    }
    return e
  }
  async get(key: string) {
    this.getCalls++
    return this.live(key)?.v ?? null
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    this.setCalls++
    this.store.set(key, { v: value, expireAt: ttlSeconds ? this.now + ttlSeconds * 1000 : null })
  }
  async incr(key: string) {
    const e = this.live(key)
    const n = (e ? Number(e.v) : 0) + 1
    this.store.set(key, { v: String(n), expireAt: e?.expireAt ?? null })
    return n
  }
  async pexpire(key: string, ms: number) {
    const e = this.store.get(key)
    if (e) e.expireAt = this.now + ms
  }
  async pttl(key: string) {
    const e = this.live(key)
    if (!e) return -2
    return e.expireAt == null ? -1 : e.expireAt - this.now
  }
  async del(key: string) {
    this.store.delete(key)
  }
}

describe('cache: cacheKey namespacing/versioning', () => {
  it('namespaces and version-prefixes keys', () => {
    expect(cacheKey('markets:list')).toBe(`mp:${CACHE_VERSION}:markets:list`)
    expect(cacheKey(['market', 'abc'])).toBe(`mp:${CACHE_VERSION}:market:abc`)
    expect(cacheKey('x', 'v2')).toBe('mp:v2:x')
  })
})

describe('cache: cached() read-through', () => {
  let kv: FakeKV
  beforeEach(() => {
    kv = new FakeKV()
  })

  it('miss then hit: loader runs once, second call served from cache', async () => {
    const loader = vi.fn().mockResolvedValue({ a: 1 })
    const first = await cached('k', 60, loader, { client: kv })
    const second = await cached('k', 60, loader, { client: kv })
    expect(first).toEqual({ a: 1 })
    expect(second).toEqual({ a: 1 })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(kv.setCalls).toBe(1)
  })

  it('expires after TTL and reloads', async () => {
    const loader = vi.fn().mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    expect(await cached('k', 1, loader, { client: kv })).toBe('one')
    kv.now += 1500 // past 1s TTL
    expect(await cached('k', 1, loader, { client: kv })).toBe('two')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('single-flight: concurrent misses call loader once', async () => {
    let resolve!: (v: string) => void
    const deferred = new Promise<string>((r) => {
      resolve = r
    })
    const loader = vi.fn(() => deferred)
    const p1 = cached('sf', 60, loader, { client: kv })
    const p2 = cached('sf', 60, loader, { client: kv })
    // Flush the async get() misses so both calls reach the single-flight stage.
    await Promise.resolve()
    await Promise.resolve()
    resolve('shared')
    const [a, b] = await Promise.all([p1, p2])
    expect(a).toBe('shared')
    expect(b).toBe('shared')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('negative-cache guard: null result is not stored by default', async () => {
    const loader = vi.fn().mockResolvedValue(null)
    await cached('n', 60, loader, { client: kv })
    expect(kv.setCalls).toBe(0)
    await cached('n', 60, loader, { client: kv }) // still a miss → loader again
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('cacheEmpty stores null when requested', async () => {
    const loader = vi.fn().mockResolvedValue(null)
    await cached('n', 60, loader, { client: kv, cacheEmpty: true })
    expect(kv.setCalls).toBe(1)
  })

  it('no client configured → passthrough to loader every time', async () => {
    const loader = vi.fn().mockResolvedValue(42)
    expect(await cached('k', 60, loader, { client: null })).toBe(42)
    expect(await cached('k', 60, loader, { client: null })).toBe(42)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('read error falls back to loader', async () => {
    const broken: KVClient = {
      ...kv,
      get: vi.fn().mockRejectedValue(new Error('down')),
      set: vi.fn().mockResolvedValue(undefined),
      incr: kv.incr.bind(kv),
      pexpire: kv.pexpire.bind(kv),
      pttl: kv.pttl.bind(kv),
      del: kv.del.bind(kv),
    }
    const loader = vi.fn().mockResolvedValue('ok')
    expect(await cached('k', 60, loader, { client: broken })).toBe('ok')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('cacheBust deletes the key', async () => {
    const loader = vi.fn().mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    await cached('k', 60, loader, { client: kv })
    await cacheBust('k', { client: kv })
    expect(await cached('k', 60, loader, { client: kv })).toBe('two')
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

describe('rate-limit-redis: enforceDistributed (fixed window)', () => {
  let kv: FakeKV
  const rule = { limit: 3, windowMs: 60_000 }
  beforeEach(() => {
    kv = new FakeKV()
  })

  it('allows up to limit then blocks, with correct remaining/retryAfter', async () => {
    const d1 = await enforceDistributed('ip', rule, kv, kv.now)
    const d2 = await enforceDistributed('ip', rule, kv, kv.now)
    const d3 = await enforceDistributed('ip', rule, kv, kv.now)
    const d4 = await enforceDistributed('ip', rule, kv, kv.now)
    expect([d1.allowed, d2.allowed, d3.allowed]).toEqual([true, true, true])
    expect(d1.remaining).toBe(2)
    expect(d3.remaining).toBe(0)
    expect(d4.allowed).toBe(false)
    expect(d4.retryAfter).toBeGreaterThan(0)
    expect(d4.remaining).toBe(0)
  })

  it('resets after the window elapses', async () => {
    for (let i = 0; i < 3; i++) await enforceDistributed('ip', rule, kv, kv.now)
    expect((await enforceDistributed('ip', rule, kv, kv.now)).allowed).toBe(false)
    kv.now += 61_000 // window elapsed → counter key expired
    const after = await enforceDistributed('ip', rule, kv, kv.now)
    expect(after.allowed).toBe(true)
    expect(after.remaining).toBe(2)
  })

  it('separate keys are independent', async () => {
    for (let i = 0; i < 3; i++) await enforceDistributed('a', rule, kv, kv.now)
    const b = await enforceDistributed('b', rule, kv, kv.now)
    expect(b.allowed).toBe(true)
  })

  it('fails open on client error', async () => {
    const broken: KVClient = {
      get: vi.fn(), set: vi.fn(), del: vi.fn(), pexpire: vi.fn(), pttl: vi.fn(),
      incr: vi.fn().mockRejectedValue(new Error('down')),
    }
    const d = await enforceDistributed('ip', rule, broken, 0)
    expect(d.allowed).toBe(true)
  })
})

describe('rate-limit-redis: enforceEdge fallback', () => {
  it('uses in-memory store when no client configured', async () => {
    const rule = { limit: 2, windowMs: 60_000 }
    const d1 = await enforceEdge('edge-key-unique', rule, { client: null, now: 1 })
    const d2 = await enforceEdge('edge-key-unique', rule, { client: null, now: 2 })
    const d3 = await enforceEdge('edge-key-unique', rule, { client: null, now: 3 })
    expect(d1.allowed).toBe(true)
    expect(d2.allowed).toBe(true)
    expect(d3.allowed).toBe(false)
  })
})
