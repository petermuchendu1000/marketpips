import { describe, it, expect } from 'vitest'
import { hasRole, ADMIN_ROLES, RESOLVER_ROLES, type Role } from '@/lib/auth'

describe('hasRole', () => {
  it('grants when role is in the allowed set', () => {
    expect(hasRole('admin', ADMIN_ROLES)).toBe(true)
    expect(hasRole('moderator', ADMIN_ROLES)).toBe(true)
  })
  it('denies when role is not allowed', () => {
    expect(hasRole('user', ADMIN_ROLES)).toBe(false)
    expect(hasRole('resolver', ADMIN_ROLES)).toBe(false)
  })
  it('handles null/undefined safely', () => {
    expect(hasRole(null, ADMIN_ROLES)).toBe(false)
    expect(hasRole(undefined, RESOLVER_ROLES)).toBe(false)
  })
  it('resolver set includes admin/moderator/resolver but not user', () => {
    for (const r of ['admin', 'moderator', 'resolver'] as Role[]) {
      expect(hasRole(r, RESOLVER_ROLES)).toBe(true)
    }
    expect(hasRole('user', RESOLVER_ROLES)).toBe(false)
  })
})
