// lib/cron-auth.ts — shared authorization for cron/worker endpoints.
//
// Cron routes are triggered by a scheduler (Supabase scheduled function, Vercel
// Cron, or an external pinger) and must present the shared CRON_SECRET. Accepts
// either `Authorization: Bearer <secret>` or an `x-cron-secret` header. The
// comparison is constant-time to avoid leaking the secret via timing.

export const CRON_SECRET_HEADER = 'x-cron-secret'

/** Constant-time string equality (length-aware; no early return on mismatch). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Pull the bearer token from an Authorization header value, if present. */
export function extractBearer(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  return m ? m[1].trim() : null
}

/**
 * Is this request authorized to run a cron job? Fails closed when the secret is
 * unset (so a misconfigured deploy can't be triggered anonymously).
 */
export function isAuthorizedCron(headers: Headers, expectedSecret: string | null | undefined): boolean {
  if (!expectedSecret) return false
  const provided = extractBearer(headers.get('authorization')) ?? headers.get(CRON_SECRET_HEADER)
  if (!provided) return false
  return constantTimeEqual(provided, expectedSecret)
}
