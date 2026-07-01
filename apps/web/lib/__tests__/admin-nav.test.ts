import { describe, it, expect } from 'vitest'
import { ADMIN_NAV, visibleNav, canSeeNavItem } from '@/lib/admin/nav'
import type { Role } from '@/lib/admin/rbac'

function hrefs(role: Role) {
  return visibleNav(role).flatMap((g) => g.items.map((i) => i.href))
}

describe('admin nav visibility', () => {
  it('superadmin sees every nav item', () => {
    const all = ADMIN_NAV.flatMap((g) => g.items.map((i) => i.href))
    expect(hrefs('superadmin').sort()).toEqual(all.sort())
  })

  it('everyone with portal access sees the dashboard', () => {
    for (const r of ['support', 'finance', 'moderator', 'admin', 'superadmin', 'resolver'] as Role[]) {
      expect(hrefs(r)).toContain('/admin')
    }
  })

  it('finance sees finance & gateways but not settings or moderation', () => {
    const f = hrefs('finance')
    expect(f).toContain('/admin/finance')
    expect(f).toContain('/admin/settings/gateways')
    expect(f).toContain('/admin/marketers/payouts')
    expect(f).not.toContain('/admin/settings')
    expect(f).not.toContain('/admin/moderation')
  })

  it('support sees users & kyc only (plus dashboard)', () => {
    const s = hrefs('support')
    expect(s).toContain('/admin/users')
    expect(s).toContain('/admin/kyc')
    expect(s).not.toContain('/admin/finance')
    expect(s).not.toContain('/admin/settings/gateways')
  })

  it('resolver sees the markets section', () => {
    expect(hrefs('resolver')).toContain('/admin/markets')
  })

  it('non-portal roles see nothing', () => {
    expect(visibleNav('user')).toEqual([])
    expect(visibleNav('creator')).toEqual([])
    expect(visibleNav('marketer')).toEqual([])
  })

  it('empty groups are pruned', () => {
    for (const group of visibleNav('support')) {
      expect(group.items.length).toBeGreaterThan(0)
    }
  })

  it('canSeeNavItem respects any-of capabilities', () => {
    const marketsItem = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.href === '/admin/markets')!
    expect(canSeeNavItem('resolver', marketsItem)).toBe(true) // has markets:resolve
    expect(canSeeNavItem('support', marketsItem)).toBe(false)
  })
})
