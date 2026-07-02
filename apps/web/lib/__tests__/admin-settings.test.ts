import { describe, it, expect } from 'vitest'
import {
  SETTINGS_SCHEMA,
  SETTINGS_BY_KEY,
  coerceSettingValue,
  readSettingValue,
  mergeSettings,
  groupSettings,
} from '@/lib/admin/settings'

describe('coerceSettingValue', () => {
  it('coerces booleans from strings and native', () => {
    const def = SETTINGS_BY_KEY['flags.withdrawals_enabled']
    expect(coerceSettingValue(def, 'true')).toBe(true)
    expect(coerceSettingValue(def, 'on')).toBe(true)
    expect(coerceSettingValue(def, false)).toBe(false)
    expect(coerceSettingValue(def, 'nope')).toBe(false)
  })

  it('validates numeric ranges', () => {
    const def = SETTINGS_BY_KEY['fees.platform_pct']
    expect(coerceSettingValue(def, '2.5')).toBe(2.5)
    expect(() => coerceSettingValue(def, 'abc')).toThrow()
    expect(() => coerceSettingValue(def, '-1')).toThrow() // below min 0
    expect(() => coerceSettingValue(def, '999')).toThrow() // above max 20
  })

  it('passes through strings', () => {
    const def = SETTINGS_BY_KEY['branding.support_email']
    expect(coerceSettingValue(def, 'x@y.z')).toBe('x@y.z')
  })
})

describe('readSettingValue', () => {
  it('falls back to default when absent', () => {
    const def = SETTINGS_BY_KEY['limits.withdraw_max_usd']
    expect(readSettingValue(def, undefined)).toBe(def.default)
    expect(readSettingValue(def, null)).toBe(def.default)
  })

  it('reads typed values from stored json', () => {
    expect(readSettingValue(SETTINGS_BY_KEY['maintenance.enabled'], true)).toBe(true)
    expect(readSettingValue(SETTINGS_BY_KEY['fees.min_bet_usd'], 1.25)).toBe(1.25)
    expect(readSettingValue(SETTINGS_BY_KEY['fees.min_bet_usd'], '1.25')).toBe(1.25)
  })
})

describe('mergeSettings & groupSettings', () => {
  it('merges stored rows with schema defaults and flags overrides', () => {
    const merged = mergeSettings([{ key: 'fees.platform_pct', value: 3.5 }])
    const platform = merged.find((m) => m.key === 'fees.platform_pct')!
    expect(platform.value).toBe(3.5)
    expect(platform.isDefault).toBe(false)
    // an unset key keeps its default and is flagged
    const minBet = merged.find((m) => m.key === 'fees.min_bet_usd')!
    expect(minBet.isDefault).toBe(true)
    expect(minBet.value).toBe(SETTINGS_BY_KEY['fees.min_bet_usd'].default)
  })

  it('returns one resolved entry per schema key', () => {
    expect(mergeSettings([])).toHaveLength(SETTINGS_SCHEMA.length)
  })

  it('groups by the schema group label', () => {
    const groups = groupSettings(mergeSettings([]))
    expect(Object.keys(groups)).toContain('Fees & economics')
    expect(Object.keys(groups)).toContain('Feature flags')
    expect(groups['Feature flags'].every((s) => s.group === 'Feature flags')).toBe(true)
  })
})

describe('schema integrity', () => {
  it('has unique keys', () => {
    const keys = SETTINGS_SCHEMA.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
