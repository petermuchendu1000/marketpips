// lib/security/webhook.ts — HMAC webhook signature verification (Node runtime).
//
// Payment provider callbacks must be authenticated so an attacker cannot forge
// a "deposit succeeded" event. This provides timing-safe HMAC verification and
// a constant-time string compare. Uses node:crypto — import ONLY from route
// handlers that run in the Node runtime (not Edge middleware).
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Compute a hex HMAC of `payload` with `secret` using the given algorithm. */
export function hmacHex(payload: string, secret: string, algorithm = 'sha256'): string {
  return createHmac(algorithm, secret).update(payload, 'utf8').digest('hex')
}

/** Constant-time compare of two strings (returns false on length mismatch). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export interface VerifyOptions {
  /** Hash algorithm (default sha256). */
  algorithm?: string
  /** If the provider prefixes the signature (e.g. "sha256="), strip it. */
  stripPrefix?: string
}

/**
 * Verify an HMAC signature over the raw request body. `signature` is the value
 * the provider sent (hex). Returns true only when it matches and inputs are
 * present — fail-closed on any missing value.
 */
export function verifyHmacSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined,
  opts: VerifyOptions = {}
): boolean {
  if (!signature || !secret || rawBody == null) return false
  let sig = signature.trim()
  if (opts.stripPrefix && sig.startsWith(opts.stripPrefix)) sig = sig.slice(opts.stripPrefix.length)
  const expected = hmacHex(rawBody, secret, opts.algorithm ?? 'sha256')
  // Compare case-insensitively on hex.
  return safeEqual(sig.toLowerCase(), expected.toLowerCase())
}

/**
 * Guard a timestamped webhook against replay: the provided epoch-seconds
 * timestamp must be within `toleranceSec` of now. Returns true if fresh.
 */
export function isFreshTimestamp(
  tsSeconds: number | string | null | undefined,
  toleranceSec = 300,
  now: number = Date.now()
): boolean {
  if (tsSeconds == null) return false
  const ts = typeof tsSeconds === 'string' ? Number(tsSeconds) : tsSeconds
  if (!Number.isFinite(ts)) return false
  const deltaSec = Math.abs(now / 1000 - ts)
  return deltaSec <= toleranceSec
}
