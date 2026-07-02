import { describe, it, expect } from 'vitest'
import { parseAuditParams, isSecurityAction } from '@/lib/admin/audit'

const UUID = '11111111-2222-3333-4444-555555555555'

describe('parseAuditParams', () => {
  it('defaults are sane', () => {
    expect(parseAuditParams({})).toEqual({
      actor: null,
      entityType: null,
      entityId: null,
      action: null,
      from: null,
      to: null,
      page: 1,
      pageSize: 50,
    })
  })
  it('accepts valid UUIDs and rejects invalid ones', () => {
    expect(parseAuditParams({ actor: UUID, entityId: UUID }).actor).toBe(UUID)
    expect(parseAuditParams({ actor: 'not-a-uuid' }).actor).toBe(null)
    expect(parseAuditParams({ entityId: '123' }).entityId).toBe(null)
  })
  it('validates ISO date filters', () => {
    const p = parseAuditParams({ from: '2026-01-01', to: '2026-02-01' })
    expect(p.from).toBe('2026-01-01')
    expect(p.to).toBe('2026-02-01')
    expect(parseAuditParams({ from: '01/01/2026' }).from).toBe(null)
    expect(parseAuditParams({ to: 'yesterday' }).to).toBe(null)
  })
  it('trims free-text action/entityType', () => {
    expect(parseAuditParams({ action: '  moderation ', entityType: ' market ' })).toMatchObject({
      action: 'moderation',
      entityType: 'market',
    })
  })
  it('clamps paging', () => {
    expect(parseAuditParams({ page: '0' }).page).toBe(1)
    expect(parseAuditParams({ pageSize: '99999' }).pageSize).toBe(500)
    expect(parseAuditParams({ pageSize: '0' }).pageSize).toBe(50) // 0 -> default
    expect(parseAuditParams({ pageSize: '-5' }).pageSize).toBe(1) // negative -> floor
  })
})

describe('isSecurityAction', () => {
  it('flags security-relevant actions', () => {
    expect(isSecurityAction('moderation.take_down')).toBe(true)
    expect(isSecurityAction('announcement.send')).toBe(true)
    expect(isSecurityAction('user.role_grant')).toBe(true)
    expect(isSecurityAction('gateway.rotate_secret')).toBe(true)
  })
  it('ignores ordinary actions', () => {
    expect(isSecurityAction('creator.set_status')).toBe(false)
    expect(isSecurityAction('market.resolve')).toBe(false)
  })
})
