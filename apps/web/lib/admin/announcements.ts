// lib/admin/announcements.ts — Announcements console model (pure + server helpers).
//
// The pure cores (audience normalization, channel sanitisation, status
// derivation, audience description) MIRROR migration 014 exactly
// (announcement_recipients / admin_upsert_announcement) so the UI preview, the
// route validation and the DB agree. Unit-tested. Server helpers are thin.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// ---- Domain constants (lockstep with migration 014) -------------------------
export const ANNOUNCEMENT_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] as const
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number]

export const CHANNELS = ['in_app', 'sms', 'email'] as const
export type Channel = (typeof CHANNELS)[number]

// Segmentation dimensions — must match profiles.role / account_status enums.
export const AUDIENCE_ROLES = [
  'user',
  'creator',
  'marketer',
  'resolver',
  'support',
  'finance',
  'moderator',
  'admin',
  'superadmin',
] as const
export const AUDIENCE_STATUSES = ['active', 'suspended', 'closed'] as const

export interface Audience {
  countries: string[] | null // null = all countries
  roles: string[] | null // null = all roles
  statuses: string[] // never empty; defaults to ['active']
}

const CHANNEL_SET = new Set<string>(CHANNELS)
const ROLE_SET = new Set<string>(AUDIENCE_ROLES)
const STATUS_SET = new Set<string>(AUDIENCE_STATUSES)

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  return []
}

/**
 * Normalise a raw audience spec to the canonical shape used by the SQL
 * `announcement_recipients`:
 *   • countries → uppercased, deduped; empty ⇒ null (no filter)
 *   • roles     → filtered to known roles, deduped; empty ⇒ null (no filter)
 *   • statuses  → filtered to known statuses; empty ⇒ ['active']
 */
export function normalizeAudience(input: unknown): Audience {
  const obj = (input && typeof input === 'object' ? (input as Record<string, unknown>) : {}) ?? {}

  const countriesRaw = Array.from(
    new Set(asArray(obj.countries).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))
  )
  const rolesRaw = Array.from(new Set(asArray(obj.roles).map((r) => r.trim()).filter((r) => ROLE_SET.has(r))))
  const statusesRaw = Array.from(
    new Set(asArray(obj.statuses).map((s) => s.trim()).filter((s) => STATUS_SET.has(s)))
  )

  return {
    countries: countriesRaw.length ? countriesRaw : null,
    roles: rolesRaw.length ? rolesRaw : null,
    statuses: statusesRaw.length ? statusesRaw : ['active'],
  }
}

/** Serialise an Audience back to the JSONB shape stored on the row / sent to the RPC. */
export function audienceToJson(a: Audience): Record<string, unknown> {
  const out: Record<string, unknown> = { statuses: a.statuses }
  if (a.countries) out.countries = a.countries
  if (a.roles) out.roles = a.roles
  return out
}

/**
 * Sanitise a channel list (mirrors admin_upsert_announcement): dedupe, keep only
 * known channels, always fall back to ['in_app'] if nothing valid remains.
 */
export function sanitizeChannels(channels: unknown): Channel[] {
  const list = Array.from(new Set(asArray(channels).filter((c) => CHANNEL_SET.has(c)))) as Channel[]
  return list.length ? list : ['in_app']
}

/**
 * Derive the persisted status on upsert (mirrors admin_upsert_announcement):
 * a future scheduled_at ⇒ 'scheduled', otherwise 'draft'.
 */
export function computeStatus(scheduledAt: string | null | undefined, now: number = Date.now()): 'draft' | 'scheduled' {
  if (!scheduledAt) return 'draft'
  const t = new Date(scheduledAt).getTime()
  return Number.isFinite(t) && t > now ? 'scheduled' : 'draft'
}

/** May this announcement still be edited / cancelled? (not sent/sending) */
export function isEditable(status: string): boolean {
  return status === 'draft' || status === 'scheduled'
}

export function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
export const statusLabel = titleCase

const CHANNEL_LABELS: Record<Channel, string> = { in_app: 'In-app', sms: 'SMS', email: 'Email' }
export function channelLabel(c: string): string {
  return (CHANNEL_LABELS as Record<string, string>)[c] ?? c
}

/** Human-readable one-line summary of who an announcement targets. */
export function describeAudience(a: Audience): string {
  const parts: string[] = []
  parts.push(a.countries ? `${a.countries.join(', ')}` : 'All countries')
  if (a.roles) parts.push(`roles: ${a.roles.join(', ')}`)
  const statuses = a.statuses.join(', ')
  parts.push(statuses === 'active' ? 'active users' : `status: ${statuses}`)
  return parts.join(' · ')
}

// ---- List params ------------------------------------------------------------
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 200

export interface AnnouncementListParams {
  status: AnnouncementStatus | null
  q: string | null
  page: number
  pageSize: number
}

export function parseAnnouncementListParams(
  sp: Record<string, string | string[] | undefined> | URLSearchParams
): AnnouncementListParams {
  const get = (k: string): string | null => {
    if (sp instanceof URLSearchParams) return sp.get(k)
    const v = sp[k]
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  }
  const page = Math.max(1, parseInt(get('page') ?? '1', 10) || 1)
  const rawSize = parseInt(get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize))
  const status = (ANNOUNCEMENT_STATUSES as readonly string[]).includes(get('status') ?? '')
    ? (get('status') as AnnouncementStatus)
    : null
  return { status, q: (get('q') ?? '').trim() || null, page, pageSize }
}

// ---- Server helpers ---------------------------------------------------------
type AnnouncementRow = Database['public']['Tables']['announcements']['Row']

export async function fetchAnnouncements(
  supabase: SupabaseClient<Database>,
  params: AnnouncementListParams
): Promise<{ rows: AnnouncementRow[]; total: number }> {
  const from = (params.page - 1) * params.pageSize
  let query = supabase
    .from('announcements')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + params.pageSize - 1)
  if (params.status) query = query.eq('status', params.status)
  if (params.q) query = query.ilike('title', `%${params.q}%`)
  const { data, count } = await query
  return { rows: (data ?? []) as AnnouncementRow[], total: count ?? 0 }
}

/** Preview how many users an audience currently resolves to (RPC). */
export async function previewAudienceCount(
  supabase: SupabaseClient<Database>,
  audience: Audience
): Promise<number> {
  const { data } = await supabase.rpc('announcement_audience_count', {
    p_audience: audienceToJson(audience) as never,
  })
  return Number(data ?? 0)
}
