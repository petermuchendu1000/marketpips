// lib/auth.ts — Centralized authentication & RBAC helpers (server-side).
//
// One place to resolve the current user + profile and enforce roles, so
// route handlers and server components don't re-implement auth checks.
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Enums } from '@/types/supabase'

export type Role = Enums<'user_role'> // 'user' | 'admin' | 'moderator' | 'resolver'

/** Roles allowed to access the admin dashboard / management actions. */
export const ADMIN_ROLES: Role[] = ['admin', 'moderator']
/** Roles allowed to resolve markets. */
export const RESOLVER_ROLES: Role[] = ['admin', 'moderator', 'resolver']

/** Pure, testable role check. */
export function hasRole(role: Role | null | undefined, allowed: Role[]): boolean {
  return role != null && allowed.includes(role)
}

export interface AuthContext {
  user: User
  role: Role
  accountStatus: Enums<'account_status'>
  kycStatus: Enums<'kyc_status'>
  // The request-scoped Supabase client (RLS-enforced, user session).
  supabase: Awaited<ReturnType<typeof createClient>>
}

/**
 * Resolve the current user and their profile fields.
 * Returns null when unauthenticated.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, account_status, kyc_status')
    .eq('id', user.id)
    .single()

  return {
    user,
    supabase,
    role: (profile?.role ?? 'user') as Role,
    accountStatus: (profile?.account_status ?? 'active') as Enums<'account_status'>,
    kycStatus: (profile?.kyc_status ?? 'unverified') as Enums<'kyc_status'>,
  }
}

/** Discriminated result used by route guards. */
export type GuardResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse }

const err = (status: number, error: string, extra?: Record<string, unknown>) => ({
  ok: false as const,
  response: NextResponse.json({ error, ...extra }, { status }),
})

/** Require an authenticated, active user. */
export async function requireUser(): Promise<GuardResult> {
  const ctx = await getAuthContext()
  if (!ctx) return err(401, 'Unauthorized')
  if (ctx.accountStatus !== 'active') return err(403, 'Account is not active')
  return { ok: true, ctx }
}

/** Require an authenticated, active user with one of the allowed roles. */
export async function requireRole(allowed: Role[]): Promise<GuardResult> {
  const guard = await requireUser()
  if (!guard.ok) return guard
  if (!hasRole(guard.ctx.role, allowed)) {
    return err(403, 'Insufficient permissions')
  }
  return guard
}
