// lib/admin/audit.ts — Centralized audit-log writer for admin actions.
//
// Every mutating admin action MUST call writeAudit(). It records who did what,
// to which entity, with before/after snapshots and request context (IP, UA).
// Writes use the service-role client so the row is always recorded regardless
// of the caller's RLS scope; reads are gated by the `audit:read` capability.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export interface AuditEntry {
  /** The staff member performing the action (profiles.id / auth uid). */
  actorId: string
  /** Machine action name, e.g. 'user.role_grant', 'gateway.rotate_secret'. */
  action: string
  /** Logical entity type, e.g. 'profile', 'market', 'payment_gateway'. */
  entityType?: string
  /** Affected entity id (UUID) when applicable. */
  entityId?: string | null
  /** State before the change (redact secrets before passing in). */
  oldData?: Record<string, unknown> | null
  /** State after the change (redact secrets before passing in). */
  newData?: Record<string, unknown> | null
  /** Request IP (from x-forwarded-for). */
  ipAddress?: string | null
  /** Request user-agent. */
  userAgent?: string | null
}

/**
 * Persist an audit entry. Never throws into the caller's happy path — audit
 * failures are logged but must not break the operator action they describe
 * (the action itself is the source of truth; we still surface the error).
 */
export async function writeAudit(
  supabase: SupabaseClient<Database>,
  entry: AuditEntry
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    old_data: (entry.oldData ?? null) as Database['public']['Tables']['audit_log']['Insert']['old_data'],
    new_data: (entry.newData ?? null) as Database['public']['Tables']['audit_log']['Insert']['new_data'],
    ip_address: entry.ipAddress ?? null,
    user_agent: entry.userAgent ?? null,
  })
  if (error) {
    console.error('[audit] failed to write audit entry', entry.action, error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

/** Extract client IP + UA from Next.js request headers for an audit entry. */
export function requestContext(headers: Headers): {
  ipAddress: string | null
  userAgent: string | null
} {
  const fwd = headers.get('x-forwarded-for')
  const ipAddress = fwd ? fwd.split(',')[0].trim() : headers.get('x-real-ip')
  return { ipAddress: ipAddress || null, userAgent: headers.get('user-agent') }
}

/** Redact known-sensitive keys from an object before it enters the audit log. */
export function redact<T extends Record<string, unknown>>(
  obj: T,
  sensitiveKeys: string[] = [
    'consumer_secret',
    'passkey',
    'security_credential',
    'api_key',
    'client_secret',
    'pin',
    'password',
    'secret',
    'secret_ref',
  ]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = sensitiveKeys.some((s) => k.toLowerCase().includes(s)) ? '***redacted***' : v
  }
  return out
}
