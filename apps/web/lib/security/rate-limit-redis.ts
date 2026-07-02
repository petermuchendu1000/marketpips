// lib/security/rate-limit-redis.ts — distributed rate limiting (Upstash).
//
// The in-memory MemoryRateStore in rate-limit.ts counts per-isolate, which is
// WRONG once the app runs on more than one instance (each machine keeps its own
// counter, so the effective limit is N× the intended limit). This module adds a
// distributed fixed-window counter backed by Redis (atomic INCR + PEXPIRE) that
// is correct across all instances. It reuses the RateRule / RateDecision types
// and header helper from rate-limit.ts.
//
// GRACEFUL DEGRADATION: when Redis is unconfigured (client null) the caller
// should fall back to the in-memory `enforce`. `enforceDistributed` requires a
// client; `enforceEdge` wraps the choice.

import { getRedis, type KVClient } from '@/lib/cache/redis'
import { enforce, type RateRule, type RateDecision } from './rate-limit'

/**
 * Atomic distributed fixed-window rate limit. Increments the window counter and
 * sets its expiry on first hit, then derives the decision from the count and
 * remaining TTL. Correct across instances. Fails OPEN on Redis error (returns an
 * allowed decision) so a cache outage never locks users out of the whole app —
 * abuse protection degrades, availability does not.
 */
export async function enforceDistributed(
  key: string,
  rule: RateRule,
  client: KVClient,
  now: number = Date.now(),
): Promise<RateDecision> {
  const redisKey = `mp:rl:${key}`
  try {
    const count = await client.incr(redisKey)
    if (count === 1) {
      // First hit in this window — set the window TTL.
      await client.pexpire(redisKey, rule.windowMs)
    }
    let ttl = await client.pttl(redisKey)
    // PTTL returns -1 (no expire) / -2 (missing) in edge cases; repair the TTL.
    if (ttl < 0) {
      await client.pexpire(redisKey, rule.windowMs)
      ttl = rule.windowMs
    }
    const allowed = count <= rule.limit
    return {
      allowed,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetAt: now + ttl,
      retryAfter: allowed ? 0 : Math.max(1, Math.ceil(ttl / 1000)),
    }
  } catch {
    // Fail open: allow the request rather than hard-failing on a cache outage.
    return { allowed: true, limit: rule.limit, remaining: rule.limit - 1, resetAt: now + rule.windowMs, retryAfter: 0 }
  }
}

/**
 * Enforce using the distributed store when Redis is configured, otherwise the
 * in-memory store. This is the correct entrypoint for multi-instance deploys.
 */
export async function enforceEdge(
  key: string,
  rule: RateRule,
  opts: { client?: KVClient | null; now?: number } = {},
): Promise<RateDecision> {
  const client = opts.client !== undefined ? opts.client : getRedis()
  if (client) return enforceDistributed(key, rule, client, opts.now)
  // Fallback: per-isolate in-memory (sane for single instance / dev).
  return enforce(key, rule, { now: opts.now })
}
