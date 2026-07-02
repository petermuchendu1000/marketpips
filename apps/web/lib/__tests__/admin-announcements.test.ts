import { describe, it, expect } from 'vitest'
import {
  normalizeAudience,
  audienceToJson,
  sanitizeChannels,
  computeStatus,
  isEditable,
  describeAudience,
  channelLabel,
  parseAnnouncementListParams,
} from '@/lib/admin/announcements'

describe('normalizeAudience (mirrors SQL announcement_recipients)', () => {
  it('empty spec -> all countries/roles, active-only', () => {
    expect(normalizeAudience({})).toEqual({ countries: null, roles: null, statuses: ['active'] })
    expect(normalizeAudience(null)).toEqual({ countries: null, roles: null, statuses: ['active'] })
    expect(normalizeAudience('garbage')).toEqual({ countries: null, roles: null, statuses: ['active'] })
  })
  it('uppercases + validates countries, dedupes', () => {
    const a = normalizeAudience({ countries: ['ke', 'UG', 'ke', 'xxx', '1'] })
    expect(a.countries).toEqual(['KE', 'UG'])
  })
  it('filters roles to known values', () => {
    const a = normalizeAudience({ roles: ['user', 'creator', 'wizard'] })
    expect(a.roles).toEqual(['user', 'creator'])
  })
  it('defaults statuses to active, filters unknowns', () => {
    expect(normalizeAudience({ statuses: [] }).statuses).toEqual(['active'])
    expect(normalizeAudience({ statuses: ['suspended', 'ghost'] }).statuses).toEqual(['suspended'])
  })
})

describe('audienceToJson', () => {
  it('omits null dimensions, always keeps statuses', () => {
    expect(audienceToJson({ countries: null, roles: null, statuses: ['active'] })).toEqual({ statuses: ['active'] })
    expect(audienceToJson({ countries: ['KE'], roles: ['user'], statuses: ['active', 'suspended'] })).toEqual({
      statuses: ['active', 'suspended'],
      countries: ['KE'],
      roles: ['user'],
    })
  })
})

describe('sanitizeChannels (mirrors admin_upsert_announcement)', () => {
  it('keeps only known channels, dedupes', () => {
    expect(sanitizeChannels(['in_app', 'sms', 'bogus'])).toEqual(['in_app', 'sms'])
    expect(sanitizeChannels(['sms', 'sms'])).toEqual(['sms'])
  })
  it('falls back to in_app when empty/invalid', () => {
    expect(sanitizeChannels([])).toEqual(['in_app'])
    expect(sanitizeChannels(['nope'])).toEqual(['in_app'])
    expect(sanitizeChannels(null)).toEqual(['in_app'])
  })
})

describe('computeStatus', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  it('no schedule -> draft', () => {
    expect(computeStatus(null, now)).toBe('draft')
    expect(computeStatus(undefined, now)).toBe('draft')
  })
  it('future schedule -> scheduled, past -> draft', () => {
    expect(computeStatus('2026-01-01T13:00:00Z', now)).toBe('scheduled')
    expect(computeStatus('2026-01-01T11:00:00Z', now)).toBe('draft')
  })
})

describe('isEditable', () => {
  it('only draft/scheduled are editable', () => {
    expect(isEditable('draft')).toBe(true)
    expect(isEditable('scheduled')).toBe(true)
    expect(isEditable('sent')).toBe(false)
    expect(isEditable('sending')).toBe(false)
    expect(isEditable('cancelled')).toBe(false)
  })
})

describe('describeAudience', () => {
  it('summarises all-users', () => {
    expect(describeAudience({ countries: null, roles: null, statuses: ['active'] })).toBe(
      'All countries · active users'
    )
  })
  it('summarises segmented', () => {
    expect(
      describeAudience({ countries: ['KE', 'UG'], roles: ['creator'], statuses: ['active', 'suspended'] })
    ).toBe('KE, UG · roles: creator · status: active, suspended')
  })
})

describe('channelLabel', () => {
  it('labels channels', () => {
    expect(channelLabel('in_app')).toBe('In-app')
    expect(channelLabel('sms')).toBe('SMS')
    expect(channelLabel('email')).toBe('Email')
    expect(channelLabel('x')).toBe('x')
  })
})

describe('parseAnnouncementListParams', () => {
  it('defaults + valid status', () => {
    expect(parseAnnouncementListParams({})).toMatchObject({ status: null, q: null, page: 1, pageSize: 25 })
    expect(parseAnnouncementListParams({ status: 'sent' }).status).toBe('sent')
    expect(parseAnnouncementListParams({ status: 'bogus' }).status).toBe(null)
  })
})
