// lib/auth-redirect.ts — pure helpers for preserving a post-auth return path.
//
// A guest who starts a bet and hits the sign-in gate must come back to exactly
// where they were. That return path (`next`) has to survive every hop of the
// auth flow: the login⇄register cross-links and the email-confirmation
// callback. This module centralizes that one decision — "attach a safe next to
// an auth route" — so the three call sites don't drift, and the open-redirect
// guard is applied uniformly. Pure + unit-tested (edge-safe, no DOM/Node APIs).
import { safeRedirectPath } from '@/lib/security/sanitize'

/**
 * Append a sanitized `next` return path to an auth route as a query param.
 *
 *   withNext('/auth/register', '/markets/abc') -> '/auth/register?next=%2Fmarkets%2Fabc'
 *   withNext('/auth/login', null)              -> '/auth/login'
 *   withNext('/auth/login', '//evil.com')      -> '/auth/login'   (open-redirect dropped)
 *   withNext('/auth/login', '/')               -> '/auth/login'   (no-op destination dropped)
 *
 * A missing, empty, root, or unsafe target is dropped and the bare path is
 * returned, so a poisoned `next` can never ride along a link.
 */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeRedirectPath(next ?? '', '')
  if (!safe || safe === '/') return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}next=${encodeURIComponent(safe)}`
}
