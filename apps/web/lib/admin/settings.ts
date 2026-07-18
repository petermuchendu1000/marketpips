// lib/admin/settings.ts — Typed platform-settings model (pure + fetch helpers).
//
// platform_settings is a JSONB key/value store; this module gives it a TYPED
// schema so the console can render grouped, validated inputs and the app can
// read strongly-typed values with sensible defaults. Mirrors migration 012's
// seed. PURE parsing/coercion is unit-tested.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/supabase'

export type SettingType = 'number' | 'percent' | 'boolean' | 'string' | 'text'

export interface SettingDef {
  key: string
  label: string
  group: string
  type: SettingType
  default: number | boolean | string
  /** Readable by non-staff app code (feature flags, limits shown to users). */
  isPublic: boolean
  help?: string
  min?: number
  max?: number
}

export const SETTINGS_SCHEMA: SettingDef[] = [
  // Fees & economics
  { key: 'fees.platform_pct', label: 'Platform fee %', group: 'Fees & economics', type: 'percent', default: 2.0, isPublic: false, min: 0, max: 20, help: 'Fee taken from settled volume.' },
  { key: 'fees.creator_reward_pct', label: 'Creator reward %', group: 'Fees & economics', type: 'percent', default: 0.25, isPublic: false, min: 0, max: 10 },
  { key: 'fees.marketer_commission_pct', label: 'Marketer commission %', group: 'Fees & economics', type: 'percent', default: 1.0, isPublic: false, min: 0, max: 20 },
  { key: 'fees.min_bet_usd', label: 'Minimum bet (USD)', group: 'Fees & economics', type: 'number', default: 0.5, isPublic: true, min: 0 },
  // Limits
  { key: 'limits.deposit_min_usd', label: 'Deposit min (USD)', group: 'Limits', type: 'number', default: 1, isPublic: true, min: 0 },
  { key: 'limits.deposit_max_usd', label: 'Deposit max (USD)', group: 'Limits', type: 'number', default: 5000, isPublic: true, min: 0 },
  { key: 'limits.withdraw_min_usd', label: 'Withdraw min (USD)', group: 'Limits', type: 'number', default: 2, isPublic: true, min: 0 },
  { key: 'limits.withdraw_max_usd', label: 'Withdraw max (USD)', group: 'Limits', type: 'number', default: 3000, isPublic: true, min: 0 },
  { key: 'limits.daily_withdraw_max_usd', label: 'Daily withdraw cap (USD)', group: 'Limits', type: 'number', default: 5000, isPublic: false, min: 0 },
  { key: 'limits.max_open_markets_per_creator', label: 'Max open markets / creator', group: 'Limits', type: 'number', default: 10, isPublic: false, min: 0 },
  // Feature flags
  { key: 'flags.market_creation_enabled', label: 'Market creation', group: 'Feature flags', type: 'boolean', default: true, isPublic: true },
  { key: 'flags.deposits_enabled', label: 'Deposits', group: 'Feature flags', type: 'boolean', default: true, isPublic: true },
  { key: 'flags.withdrawals_enabled', label: 'Withdrawals', group: 'Feature flags', type: 'boolean', default: true, isPublic: true },
  { key: 'flags.leaderboard_enabled', label: 'Leaderboard', group: 'Feature flags', type: 'boolean', default: true, isPublic: true },
  // Dark-launch flags — default OFF so they ship dark and enable via config
  // (decouples deploy from release; see lib/flags.ts + docs/16-CICD-IAC.md §6).
  { key: 'flags.new_market_ui', label: 'New market UI (dark launch)', group: 'Feature flags', type: 'boolean', default: false, isPublic: true, help: 'Gradual rollout of the redesigned market page. Ships off; enable per environment.' },
  { key: 'flags.social_sharing', label: 'Social sharing (dark launch)', group: 'Feature flags', type: 'boolean', default: false, isPublic: true, help: 'Share buttons on markets. Ships off; enable when ready.' },
  { key: 'flags.independent_options', label: 'Independent option lines (dark launch)', group: 'Feature flags', type: 'boolean', default: false, isPublic: true, help: 'Polymarket/Kalshi-style per-candidate Yes/No pricing (each candidate an independent binary line). Ships off; only affects markets migrated to independent mode. Kill-switch for Phase C.' },
  { key: 'flags.guided_bet_flow', label: 'Guided bet flow (dark launch)', group: 'Feature flags', type: 'boolean', default: false, isPublic: true, help: 'Beginner-first "Guided 2-Step" checkout (pick side → stake → confirm) that replaces the pro order ticket on the market page. Same LMSR economics; ships off, enable per environment.' },
  { key: 'flags.pm_ticket', label: 'Polymarket-style order ticket (dark launch)', group: 'Feature flags', type: 'boolean', default: false, isPublic: true, help: 'Compact Polymarket-style order ticket (Buy/Sell · Market/Limit · Yes/No ¢ pills · Amount · quick-add chips · Trade) on the market page + mobile sheet. Same LMSR economics via previewBet/place_bet; ships off, enable per environment. Takes precedence over the guided flow.' },
  { key: 'flags.clob', label: 'CLOB order book (dark launch)', group: 'Feature flags', type: 'boolean', default: false, isPublic: true, help: 'Polymarket-style per-candidate Central Limit Order Book: real resting limit orders matched by price-time priority with complementary minting, plus the inline Order Book / Graph / Resolution drawer and Buy-Yes/Buy-No per candidate. Only affects markets with pricing_engine=clob. Ships off; instant kill-switch for the money path.' },
  // Maintenance
  { key: 'maintenance.enabled', label: 'Maintenance mode', group: 'Maintenance', type: 'boolean', default: false, isPublic: true, help: 'Puts the platform into read-only / freeze mode.' },
  { key: 'maintenance.message', label: 'Maintenance banner message', group: 'Maintenance', type: 'text', default: '', isPublic: true },
  // Branding
  { key: 'branding.support_email', label: 'Support email', group: 'Branding', type: 'string', default: 'support@marketpips.co.ke', isPublic: true },
  { key: 'branding.terms_url', label: 'Terms URL', group: 'Branding', type: 'string', default: '/legal/terms', isPublic: true },
  { key: 'branding.privacy_url', label: 'Privacy URL', group: 'Branding', type: 'string', default: '/legal/privacy', isPublic: true },
]

export const SETTINGS_BY_KEY: Record<string, SettingDef> = Object.fromEntries(
  SETTINGS_SCHEMA.map((s) => [s.key, s])
)

export const SETTINGS_GROUPS: string[] = Array.from(
  SETTINGS_SCHEMA.reduce((set, s) => set.add(s.group), new Set<string>())
)

export type SettingValue = number | boolean | string

/**
 * Coerce a raw form string into the typed value for a setting, validating
 * against the schema. Throws on invalid input so the API returns a clean 400.
 */
export function coerceSettingValue(def: SettingDef, raw: unknown): SettingValue {
  switch (def.type) {
    case 'boolean':
      return raw === true || raw === 'true' || raw === 'on' || raw === '1'
    case 'number':
    case 'percent': {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
      if (!Number.isFinite(n)) throw new Error(`${def.label} must be a number`)
      if (def.min != null && n < def.min) throw new Error(`${def.label} must be ≥ ${def.min}`)
      if (def.max != null && n > def.max) throw new Error(`${def.label} must be ≤ ${def.max}`)
      return n
    }
    case 'string':
    case 'text':
    default:
      return String(raw ?? '')
  }
}

/** Read a typed value out of a raw JSON stored value, defaulting on absence. */
export function readSettingValue(def: SettingDef, stored: Json | undefined): SettingValue {
  if (stored === undefined || stored === null) return def.default
  switch (def.type) {
    case 'boolean':
      return stored === true || stored === 'true'
    case 'number':
    case 'percent': {
      const n = typeof stored === 'number' ? stored : parseFloat(String(stored))
      return Number.isFinite(n) ? n : (def.default as number)
    }
    default:
      return typeof stored === 'string' ? stored : String(stored)
  }
}

export interface ResolvedSetting extends SettingDef {
  value: SettingValue
  isDefault: boolean
}

/** Merge stored rows with the schema, applying defaults for missing keys. */
export function mergeSettings(rows: { key: string; value: Json }[]): ResolvedSetting[] {
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return SETTINGS_SCHEMA.map((def) => {
    const present = map.has(def.key)
    return {
      ...def,
      value: readSettingValue(def, present ? map.get(def.key) : undefined),
      isDefault: !present,
    }
  })
}

/** Group resolved settings for rendering. */
export function groupSettings(resolved: ResolvedSetting[]): Record<string, ResolvedSetting[]> {
  const out: Record<string, ResolvedSetting[]> = {}
  for (const s of resolved) (out[s.group] ??= []).push(s)
  return out
}

export async function fetchSettings(
  supabase: SupabaseClient<Database>
): Promise<ResolvedSetting[]> {
  const { data, error } = await supabase.from('platform_settings').select('key, value')
  if (error) throw new Error(error.message)
  return mergeSettings((data ?? []) as { key: string; value: Json }[])
}
