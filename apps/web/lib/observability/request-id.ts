// lib/observability/request-id.ts — correlation id generation & propagation.
//
// A stable id per request lets us tie together middleware, route handlers and
// logs. Honours an inbound X-Request-Id (validated) or mints a new UUID.
// Edge-safe: uses the Web Crypto randomUUID available in both runtimes.

export const REQUEST_ID_HEADER = 'x-request-id'

// Accept UUIDs and typical trace ids; reject anything with control chars / too long.
const VALID_ID = /^[A-Za-z0-9._-]{8,128}$/

/** Generate a fresh request id (UUID v4). */
export function newRequestId(): string {
  // globalThis.crypto is present in Edge and modern Node (>=18).
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Fallback (very old runtimes): time + random, still unique enough for correlation.
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/** Validate an inbound id; returns it if acceptable, else null. */
export function sanitizeRequestId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.trim()
  return VALID_ID.test(v) ? v : null
}

/** Resolve a request id from headers, minting one if absent/invalid. */
export function resolveRequestId(headers: Headers): string {
  return sanitizeRequestId(headers.get(REQUEST_ID_HEADER)) ?? newRequestId()
}
