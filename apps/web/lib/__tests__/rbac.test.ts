import { describe, it, expect } from 'vitest'
import {
  ALL_CAPABILITIES,
  ROLE_CAPABILITIES,
  STAFF_ROLES,
  isStaffRole,
  isSuperadmin,
  canAccessAdminPortal,
  roleHasCapability,
  effectiveCapabilities,
  canGrantRole,
  canChangeUserRole,
  canChangeAccountStatus,
  type Role,
  type Capability,
} from '@/lib/admin/rbac'

describe('roleHasCapability', () => {
  it('superadmin holds EVERY capability (god-mode)', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(roleHasCapability('superadmin', cap)).toBe(true)
    }
  })

  it('regular user holds no admin capabilities', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(roleHasCapability('user', cap)).toBe(false)
    }
  })

  it('admin holds broad but not owner-only capabilities', () => {
    expect(roleHasCapability('admin', 'users:update')).toBe(true)
    expect(roleHasCapability('admin', 'settings:write')).toBe(true)
    expect(roleHasCapability('admin', 'gateways:write')).toBe(true)
    // owner-only: raw gateway secrets are superadmin-only
    expect(roleHasCapability('admin', 'gateways:secrets')).toBe(false)
  })

  it('support / finance / moderator match their seeded matrices', () => {
    expect(roleHasCapability('support', 'kyc:review')).toBe(true)
    expect(roleHasCapability('support', 'finance:withdrawals')).toBe(false)
    expect(roleHasCapability('finance', 'finance:withdrawals')).toBe(true)
    expect(roleHasCapability('finance', 'markets:approve')).toBe(false)
    expect(roleHasCapability('moderator', 'markets:approve')).toBe(true)
    expect(roleHasCapability('moderator', 'finance:ledger')).toBe(false)
  })

  it('resolver can only resolve markets', () => {
    expect(roleHasCapability('resolver', 'markets:resolve')).toBe(true)
    expect(roleHasCapability('resolver', 'markets:approve')).toBe(false)
  })

  it('null/undefined role is denied', () => {
    expect(roleHasCapability(null, 'users:read')).toBe(false)
    expect(roleHasCapability(undefined, 'users:read')).toBe(false)
  })
})

describe('effectiveCapabilities', () => {
  it('superadmin resolves to the full capability set', () => {
    expect(effectiveCapabilities('superadmin').sort()).toEqual([...ALL_CAPABILITIES].sort())
  })
  it('user resolves to nothing', () => {
    expect(effectiveCapabilities('user')).toEqual([])
  })
})

describe('role classification', () => {
  it('staff set is exactly support/finance/moderator/admin/superadmin', () => {
    expect([...STAFF_ROLES].sort()).toEqual(
      ['admin', 'finance', 'moderator', 'superadmin', 'support'].sort()
    )
  })
  it('isStaffRole', () => {
    for (const r of STAFF_ROLES) expect(isStaffRole(r)).toBe(true)
    expect(isStaffRole('user')).toBe(false)
    expect(isStaffRole('creator')).toBe(false)
    expect(isStaffRole('resolver')).toBe(false)
  })
  it('portal access includes resolver but not creator/marketer/user', () => {
    expect(canAccessAdminPortal('resolver')).toBe(true)
    expect(canAccessAdminPortal('admin')).toBe(true)
    expect(canAccessAdminPortal('superadmin')).toBe(true)
    expect(canAccessAdminPortal('creator')).toBe(false)
    expect(canAccessAdminPortal('marketer')).toBe(false)
    expect(canAccessAdminPortal('user')).toBe(false)
    expect(canAccessAdminPortal(null)).toBe(false)
  })
  it('isSuperadmin', () => {
    expect(isSuperadmin('superadmin')).toBe(true)
    expect(isSuperadmin('admin')).toBe(false)
  })
})

describe('canGrantRole (grant guardrails)', () => {
  it('superadmin can NEVER be granted via the app (exactly one, bootstrap-only)', () => {
    for (const actor of ['superadmin', 'admin', 'moderator', 'user'] as Role[]) {
      expect(canGrantRole(actor, 'superadmin')).toBe(false)
    }
  })
  it('only superadmin can grant the other STAFF roles', () => {
    const staff: Role[] = ['support', 'finance', 'moderator', 'admin']
    for (const target of staff) {
      expect(canGrantRole('superadmin', target)).toBe(true)
      expect(canGrantRole('admin', target)).toBe(false)
    }
  })
  it('admin can grant non-staff roles', () => {
    for (const target of ['user', 'creator', 'marketer', 'resolver'] as Role[]) {
      expect(canGrantRole('admin', target)).toBe(true)
    }
  })
  it('roles without users:role_grant cannot grant anything', () => {
    for (const target of ['user', 'creator', 'admin'] as Role[]) {
      expect(canGrantRole('support', target)).toBe(false)
      expect(canGrantRole('moderator', target)).toBe(false)
      expect(canGrantRole('finance', target)).toBe(false)
      expect(canGrantRole('user', target)).toBe(false)
    }
  })
})

describe('Superadmin immutability', () => {
  it('a superadmin can NEVER be role-changed, even by another superadmin', () => {
    for (const actor of ['superadmin', 'admin', 'moderator'] as Role[]) {
      for (const to of ['user', 'admin', 'support'] as Role[]) {
        expect(canChangeUserRole(actor, 'superadmin', to)).toBe(false)
      }
    }
  })
  it('a superadmin can NEVER be suspended/closed', () => {
    for (const actor of ['superadmin', 'admin'] as Role[]) {
      expect(canChangeAccountStatus(actor, 'superadmin')).toBe(false)
    }
  })
  it('demoting a staff member is superadmin-only', () => {
    expect(canChangeUserRole('admin', 'finance', 'user')).toBe(false)
    expect(canChangeUserRole('superadmin', 'finance', 'user')).toBe(true)
  })
  it('admin can change a normal user to a non-staff role', () => {
    expect(canChangeUserRole('admin', 'user', 'creator')).toBe(true)
    expect(canChangeUserRole('admin', 'user', 'admin')).toBe(false) // staff → superadmin-only
  })
  it('no-op role change is rejected', () => {
    expect(canChangeUserRole('admin', 'user', 'user')).toBe(false)
  })
  it('admin can suspend a normal user but not a staff member', () => {
    expect(canChangeAccountStatus('admin', 'user')).toBe(true)
    expect(canChangeAccountStatus('admin', 'moderator')).toBe(false)
    expect(canChangeAccountStatus('superadmin', 'moderator')).toBe(true)
  })
})

describe('capability matrix integrity', () => {
  it('every seeded capability is a known capability string', () => {
    const known = new Set<string>(ALL_CAPABILITIES)
    for (const caps of Object.values(ROLE_CAPABILITIES)) {
      for (const c of caps) expect(known.has(c)).toBe(true)
    }
  })
  it('capability list has no duplicates', () => {
    expect(new Set(ALL_CAPABILITIES).size).toBe(ALL_CAPABILITIES.length)
  })
})
