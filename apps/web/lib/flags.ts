// lib/flags.ts — Feature-flag layer (Module 16.6): deploy ≠ release.
//
// Flags let us ship code dark and turn it on via config — a gradual rollout and
// an instant kill-switch for risky money paths (a cheaper "rollback" than a
// redeploy). Resolution order (highest precedence first):
//
//   1. ENV override  (FLAG_<UPPER_SNAKE>)  — instant, ops-controlled kill-switch
//                                            that needs no DB round-trip.
//   2. DB value      (platform_settings `flags.*`) — admin-editable via the M11
//                                            settings console; toggles are
//                                            audit-logged (M11/M14).
//   3. Schema default (SETTINGS_SCHEMA)     — safe fallback (dark-launch = off).
//
// Flags are the boolean settings in the "Feature flags" group, so they inherit
// the console UI, RLS (`settings:write` to change), and audit trail for free.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/supabase'
import { SETTINGS_SCHEMA, SETTINGS_BY_KEY, readSettingValue, type SettingDef } from '@/lib/admin/settings'

/** All boolean flags in the "Feature flags" settings group. */
export const FEATURE_FLAG_DEFS: SettingDef[] = SETTINGS_SCHEMA.filter(
  (s) => s.group === 'Feature flags' && s.type === 'boolean'
)

export const FEATURE_FLAG_KEYS = FEATURE_FLAG_DEFS.map((d) => d.key)
export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number]

/** Map a flag key to its env-override variable, e.g. flags.social_sharing -> FLAG_SOCIAL_SHARING. */
export function flagEnvVar(key: string): string {
  const suffix = key.replace(/^flags\./, '').replace(/[.-]/g, '_').toUpperCase()
  return `FLAG_${suffix}`
}

/** Parse an env override into a tri-state: true/false, or undefined if unset. */
export function readFlagFromEnv(
  key: string,
  env: NodeJS.ProcessEnv = process.env
): boolean | undefined {
  const raw = env[flagEnvVar(key)]
  if (raw === undefined) return undefined
  const v = raw.trim().toLowerCase()
  if (['1', 'true', 'on', 'yes'].includes(v)) return true
  if (['0', 'false', 'off', 'no'].includes(v)) return false
  return undefined // unrecognized value -> ignore the override
}

/**
 * PURE resolver (unit-tested): apply precedence env > stored DB value > default.
 * Unknown keys resolve to `false` (fail-safe).
 */
export function resolveFlag(
  key: string,
  storedValue: Json | undefined,
  envOverride: boolean | undefined
): boolean {
  if (envOverride !== undefined) return envOverride
  const def = SETTINGS_BY_KEY[key]
  if (!def || def.type !== 'boolean') return false
  return Boolean(readSettingValue(def, storedValue))
}

/**
 * Resolve a single flag for the current environment. Env override wins (no DB
 * hit needed); otherwise reads the stored value from platform_settings.
 */
export async function isFeatureEnabled(
  supabase: SupabaseClient<Database>,
  key: FeatureFlagKey
): Promise<boolean> {
  const envOverride = readFlagFromEnv(key)
  if (envOverride !== undefined) return envOverride

  const { data } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  return resolveFlag(key, (data?.value ?? undefined) as Json | undefined, undefined)
}

/** Resolve every feature flag at once (one query). Useful for SSR bootstrapping. */
export async function getAllFlags(
  supabase: SupabaseClient<Database>
): Promise<Record<string, boolean>> {
  const { data } = await supabase.from('platform_settings').select('key, value').in('key', FEATURE_FLAG_KEYS)
  const stored = new Map((data ?? []).map((r) => [r.key as string, r.value as Json]))
  const out: Record<string, boolean> = {}
  for (const key of FEATURE_FLAG_KEYS) {
    out[key] = resolveFlag(key, stored.get(key), readFlagFromEnv(key))
  }
  return out
}
