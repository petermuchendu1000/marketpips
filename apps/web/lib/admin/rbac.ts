// lib/admin/rbac.ts — Role/capability model for the admin control plane.
//
// This is the single, PURE, testable source of truth that MIRRORS the database
// (migration 009 `role_permissions` + `has_capability()`). The DB is the final
// backstop (RLS + triggers); this module lets server guards and the UI reason
// about capabilities without a round-trip, and lets us unit-test the rules.
//
// Golden rules encoded here:
//   • superadmin holds EVERY capability implicitly (god-mode).
//   • superadmin is immutable: it can never be demoted/removed via the app.
//   • Only a superadmin can grant/revoke STAFF roles (incl. creating a superadmin).
import type { Enums } from '@/types/supabase'

export type Role = Enums<'user_role'>

/** Every capability string used across the admin module (`resource:action`). */
export const ALL_CAPABILITIES = [
  'users:read',
  'users:update',
  'users:suspend',
  'users:role_grant',
  'users:impersonate',
  'kyc:review',
  'creators:manage',
  'marketers:manage',
  'markets:approve',
  'markets:resolve',
  'markets:cancel',
  'finance:deposits',
  'finance:withdrawals',
  'finance:ledger',
  'payouts:run',
  'gateways:read',
  'gateways:write',
  'gateways:secrets',
  'settings:write',
  'moderation:read',
  'moderation:action',
  'announcements:send',
  'staff:read',
  'audit:read',
] as const

export type Capability = (typeof ALL_CAPABILITIES)[number]

/**
 * Staff roles = internal operators. These are the roles for which:
 *   • granting/revoking is superadmin-only, and
 *   • broad operator RLS reads apply (mirrors SQL `staff_roles()`).
 * NOTE: `resolver`, `creator`, `marketer` are NOT staff (see ADMIN_PORTAL_ROLES).
 */
export const STAFF_ROLES: readonly Role[] = [
  'support',
  'finance',
  'moderator',
  'admin',
  'superadmin',
] as const

/** Roles permitted to load the /admin portal at all (edge middleware gate). */
export const ADMIN_PORTAL_ROLES: readonly Role[] = [
  ...STAFF_ROLES,
  'resolver', // needs the market-resolution queue
] as const

/** User-facing elevated roles that get their own consoles (not /admin staff). */
export const ELEVATED_USER_ROLES: readonly Role[] = ['creator', 'marketer'] as const

/**
 * Role → capabilities. MUST stay in lockstep with migration 009's seed.
 * `superadmin` is intentionally omitted: it is granted every capability by
 * `roleHasCapability()` below (god-mode), matching `has_capability()` in SQL.
 */
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  user: [],
  creator: [],
  marketer: [],
  resolver: ['markets:resolve'],
  support: ['users:read', 'users:suspend', 'kyc:review'],
  finance: [
    'users:read',
    'marketers:manage',
    'finance:deposits',
    'finance:withdrawals',
    'finance:ledger',
    'payouts:run',
    'gateways:read',
    'audit:read',
  ],
  moderator: [
    'users:read',
    'users:suspend',
    'kyc:review',
    'creators:manage',
    'marketers:manage',
    'markets:approve',
    'markets:resolve',
    'markets:cancel',
    'moderation:read',
    'moderation:action',
    'announcements:send',
    'audit:read',
  ],
  admin: [
    'users:read',
    'users:update',
    'users:suspend',
    'users:role_grant',
    'users:impersonate',
    'kyc:review',
    'creators:manage',
    'marketers:manage',
    'markets:approve',
    'markets:resolve',
    'markets:cancel',
    'finance:deposits',
    'finance:withdrawals',
    'finance:ledger',
    'payouts:run',
    'gateways:read',
    'gateways:write',
    'settings:write',
    'moderation:read',
    'moderation:action',
    'announcements:send',
    'staff:read',
    'audit:read',
  ],
  // superadmin: god-mode — see roleHasCapability(). Left empty on purpose.
  superadmin: [],
}

/** Is this role a staff (internal operator) role? */
export function isStaffRole(role: Role | null | undefined): boolean {
  return role != null && STAFF_ROLES.includes(role)
}

/** May this role load the /admin portal at all? */
export function canAccessAdminPortal(role: Role | null | undefined): boolean {
  return role != null && ADMIN_PORTAL_ROLES.includes(role)
}

/** Is this the god-like owner role? */
export function isSuperadmin(role: Role | null | undefined): boolean {
  return role === 'superadmin'
}

/**
 * Does `role` hold `cap`? superadmin always returns true (god-mode). Mirrors the
 * SQL `has_capability()` short-circuit exactly.
 */
export function roleHasCapability(
  role: Role | null | undefined,
  cap: Capability
): boolean {
  if (role == null) return false
  if (role === 'superadmin') return true
  return ROLE_CAPABILITIES[role]?.includes(cap) ?? false
}

/** All capabilities effectively held by a role (superadmin → all). */
export function effectiveCapabilities(role: Role | null | undefined): Capability[] {
  if (role == null) return []
  if (role === 'superadmin') return [...ALL_CAPABILITIES]
  return [...(ROLE_CAPABILITIES[role] ?? [])]
}

/**
 * Can `actorRole` assign `targetRole` to some user?
 *   • Must hold `users:role_grant`.
 *   • `superadmin` can NEVER be granted via the app — the system allows exactly
 *     one superadmin, fixed at bootstrap and immutable thereafter.
 *   • Granting any other STAFF role is SUPERADMIN-ONLY.
 *   • Non-staff roles (user/creator/marketer/resolver) may be granted by anyone
 *     with `users:role_grant` (admin or superadmin).
 */
export function canGrantRole(
  actorRole: Role | null | undefined,
  targetRole: Role
): boolean {
  if (!roleHasCapability(actorRole, 'users:role_grant')) return false
  if (targetRole === 'superadmin') return false // exactly one, bootstrap-only
  if (isStaffRole(targetRole)) return isSuperadmin(actorRole)
  return true
}

/**
 * Can `actorRole` change a user whose CURRENT role is `currentRole` to
 * `newRole`? Enforces the superadmin immutability invariant in addition to
 * grant rules:
 *   • A superadmin target can NEVER be changed (immutable) — even by another
 *     superadmin, through the app. (DB triggers are the ultimate backstop.)
 *   • Otherwise, delegates to canGrantRole for the new role, and demoting a
 *     staff member is also superadmin-only.
 */
export function canChangeUserRole(
  actorRole: Role | null | undefined,
  currentRole: Role,
  newRole: Role
): boolean {
  if (currentRole === 'superadmin') return false // immutable
  if (currentRole === newRole) return false // no-op
  if (isStaffRole(currentRole) && !isSuperadmin(actorRole)) return false // demoting staff
  return canGrantRole(actorRole, newRole)
}

/**
 * Can `actorRole` change the account_status (suspend/close/reactivate) of a user
 * whose role is `targetRole`? A superadmin can never be suspended/closed.
 */
export function canChangeAccountStatus(
  actorRole: Role | null | undefined,
  targetRole: Role
): boolean {
  if (targetRole === 'superadmin') return false // immutable
  // Suspending another staff member is superadmin-only; suspending regular
  // users needs users:suspend.
  if (isStaffRole(targetRole)) return isSuperadmin(actorRole)
  return roleHasCapability(actorRole, 'users:suspend')
}
