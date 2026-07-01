// lib/admin/page-guard.ts — Server-component capability guard for admin pages.
//
// The admin layout already blocks non-portal users; this adds per-page
// capability enforcement (defence in depth, mirrors requireCapability for API
// routes). Returns the resolved context so the page can render role-aware data.
import { redirect } from 'next/navigation'
import { getAuthContext, type AuthContext } from '@/lib/auth'
import { roleHasCapability } from '@/lib/admin/rbac'
import type { Capability } from '@/lib/admin/rbac'

/**
 * Require the current operator to hold at least one of `caps` (any-of).
 * Redirects to /admin on failure and /auth/login when unauthenticated.
 */
export async function requirePageCapability(
  caps: Capability | Capability[]
): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/auth/login?next=/admin')
  const list = Array.isArray(caps) ? caps : [caps]
  if (!list.some((c) => roleHasCapability(ctx.role, c))) redirect('/admin')
  return ctx
}
