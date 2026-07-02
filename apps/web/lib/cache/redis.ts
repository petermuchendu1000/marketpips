// lib/cache/redis.ts — Upstash Redis REST client (edge-safe, env-guarded).
//
// A minimal key/value client over the Upstash REST API using `fetch` only (no
// TCP, no Node-only APIs) so it runs in the Edge middleware runtime as well as
// Node route handlers. It is intentionally tiny — just the primitives the
// read-through cache (cache.ts) and the distributed rate-limiter
// (security/rate-limit-redis.ts) need.
//
// GRACEFUL DEGRADATION: if the Upstash env vars are unset, `getRedis()` returns
// null and every caller degrades to a no-cache / in-memory path. A network or
// provider error never throws to the caller — the primitives fail soft.

/** The narrow K/V surface the app depends on. Mockable in unit tests. */
export interface KVClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  incr(key: string): Promise<number>
  pexpire(key: string, ms: number): Promise<void>
  pttl(key: string): Promise<number>
  del(key: string): Promise<void>
}

type Command = (string | number)[]

class UpstashClient implements KVClient {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly timeoutMs = 1500,
  ) {}

  /** Execute one Redis command via the Upstash REST endpoint. */
  private async exec<T = unknown>(cmd: Command): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cmd),
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`)
      const json = (await res.json()) as { result?: T; error?: string }
      if (json.error) throw new Error(json.error)
      return json.result as T
    } finally {
      clearTimeout(timer)
    }
  }

  async get(key: string): Promise<string | null> {
    const r = await this.exec<string | null>(['GET', key])
    return r ?? null
  }
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const cmd: Command = ttlSeconds && ttlSeconds > 0
      ? ['SET', key, value, 'EX', Math.ceil(ttlSeconds)]
      : ['SET', key, value]
    await this.exec(cmd)
  }
  async incr(key: string): Promise<number> {
    return Number(await this.exec<number>(['INCR', key]))
  }
  async pexpire(key: string, ms: number): Promise<void> {
    await this.exec(['PEXPIRE', key, Math.ceil(ms)])
  }
  async pttl(key: string): Promise<number> {
    return Number(await this.exec<number>(['PTTL', key]))
  }
  async del(key: string): Promise<void> {
    await this.exec(['DEL', key])
  }
}

let _client: KVClient | null | undefined

/**
 * Resolve the process-wide Redis client, or null when Upstash isn't configured.
 * Memoized. Never throws — misconfiguration degrades to null (no cache).
 */
export function getRedis(): KVClient | null {
  if (_client !== undefined) return _client
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  _client = url && token ? new UpstashClient(url, token) : null
  return _client
}

/** Test seam: override/reset the memoized client. */
export function __setRedisForTests(client: KVClient | null | undefined): void {
  _client = client
}
