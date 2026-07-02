import { describe, it, expect } from 'vitest'
import {
  slaHoursFor,
  reportAgeHours,
  slaDueAt,
  isOverdue,
  entityLabel,
  entityHref,
  reasonLabel,
  parseReportListParams,
  SLA_HOURS,
} from '@/lib/admin/moderation'

describe('SLA policy', () => {
  it('maps known reasons to their hour targets', () => {
    expect(slaHoursFor('illegal')).toBe(4)
    expect(slaHoursFor('fraud')).toBe(8)
    expect(slaHoursFor('spam')).toBe(48)
  })
  it('falls back to "other" for unknown reasons', () => {
    expect(slaHoursFor('nonsense')).toBe(SLA_HOURS.other)
  })
})

describe('reportAgeHours', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  it('computes fractional hours since creation', () => {
    expect(reportAgeHours('2026-01-01T10:00:00Z', now)).toBeCloseTo(2, 5)
    expect(reportAgeHours('2026-01-01T11:30:00Z', now)).toBeCloseTo(0.5, 5)
  })
  it('clamps future timestamps to 0 and tolerates garbage', () => {
    expect(reportAgeHours('2026-01-01T13:00:00Z', now)).toBe(0)
    expect(reportAgeHours('not-a-date', now)).toBe(0)
  })
})

describe('slaDueAt', () => {
  it('adds the reason SLA to creation time', () => {
    const due = slaDueAt('2026-01-01T00:00:00Z', 'illegal') // +4h
    expect(due.toISOString()).toBe('2026-01-01T04:00:00.000Z')
  })
})

describe('isOverdue', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  it('is true for an open report past its SLA', () => {
    expect(isOverdue({ reason: 'illegal', status: 'open', created_at: '2026-01-01T07:00:00Z' }, now)).toBe(true)
  })
  it('is false when still within SLA', () => {
    expect(isOverdue({ reason: 'spam', status: 'open', created_at: '2026-01-01T07:00:00Z' }, now)).toBe(false)
  })
  it('resolved reports are never overdue', () => {
    expect(isOverdue({ reason: 'illegal', status: 'actioned', created_at: '2020-01-01T00:00:00Z' }, now)).toBe(false)
    expect(isOverdue({ reason: 'illegal', status: 'dismissed', created_at: '2020-01-01T00:00:00Z' }, now)).toBe(false)
  })
  it('reviewing still counts toward SLA', () => {
    expect(isOverdue({ reason: 'illegal', status: 'reviewing', created_at: '2026-01-01T07:00:00Z' }, now)).toBe(true)
  })
})

describe('labels & deep links', () => {
  it('labels entities', () => {
    expect(entityLabel('market')).toBe('Market')
    expect(entityLabel('comment')).toBe('Comment')
    expect(entityLabel('weird')).toBe('weird')
  })
  it('title-cases reasons', () => {
    expect(reasonLabel('harassment')).toBe('Harassment')
  })
  it('builds inspection links', () => {
    expect(entityHref('market', 'abc')).toBe('/markets/abc')
    expect(entityHref('profile', 'u1')).toBe('/admin/users/u1')
    expect(entityHref('comment', 'c1')).toBe('/admin/moderation')
  })
})

describe('parseReportListParams', () => {
  it('defaults are sane', () => {
    const p = parseReportListParams({})
    expect(p).toMatchObject({ status: null, entity_type: null, reason: null, q: null, page: 1, pageSize: 25 })
  })
  it('accepts valid filters and rejects invalid enums', () => {
    const p = parseReportListParams({ status: 'open', entity_type: 'market', reason: 'spam', q: '  hi ', page: '3' })
    expect(p).toMatchObject({ status: 'open', entity_type: 'market', reason: 'spam', q: 'hi', page: 3 })
    const bad = parseReportListParams({ status: 'nope', entity_type: 'nope', reason: 'nope' })
    expect(bad).toMatchObject({ status: null, entity_type: null, reason: null })
  })
  it('clamps pageSize and floors page at 1', () => {
    expect(parseReportListParams({ pageSize: '9999' }).pageSize).toBe(200)
    expect(parseReportListParams({ page: '0' }).page).toBe(1)
    expect(parseReportListParams({ pageSize: '0' }).pageSize).toBe(25) // 0 -> default
    expect(parseReportListParams({ pageSize: '-5' }).pageSize).toBe(1) // negative -> floor
  })
})
