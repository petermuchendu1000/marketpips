// lib/notifications/delivery.ts — pure delivery-pipeline logic (unit-tested).
//
// Backoff schedule, destination validation, SMS truncation, provider-result
// normalization and batch summaries used by the send-notifications cron worker.
// No I/O here so it is fully deterministic and testable.
import { isPlausibleEmail } from '@/lib/security/sanitize'

export const DELIVERY_CHANNELS = ['email', 'sms', 'push'] as const
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number]

export const DELIVERY_STATUSES = ['pending', 'sending', 'sent', 'failed', 'skipped'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

/** Africa's Talking / most gateways cap a single SMS segment; keep messages short. */
export const SMS_MAX_LENGTH = 320

/**
 * Exponential backoff (seconds) for the Nth attempt just completed (1-based):
 * 1 -> 1m, 2 -> 5m, 3 -> 30m, 4 -> 2h, 5+ -> 6h (capped). Deterministic.
 */
export function backoffSeconds(attempt: number): number {
  const schedule = [60, 300, 1800, 7200, 21600]
  const i = Math.max(1, Math.floor(attempt)) - 1
  return schedule[Math.min(i, schedule.length - 1)]
}

/** Should another attempt be made given attempts-so-far and the cap? */
export function shouldRetry(attempts: number, maxAttempts: number): boolean {
  return attempts < maxAttempts
}

/** Minimal E.164 phone validation (+ and 8–15 digits, first digit 1–9). */
export function isValidE164(phone: unknown): boolean {
  const s = String(phone ?? '').trim()
  return /^\+[1-9]\d{7,14}$/.test(s)
}

/** Is a destination usable for the given channel? */
export function isValidDestination(channel: DeliveryChannel, destination: unknown): boolean {
  const s = String(destination ?? '').trim()
  if (!s) return false
  if (channel === 'sms') return isValidE164(s)
  if (channel === 'email') return isPlausibleEmail(s)
  return true // push tokens: opaque, non-empty is enough here
}

/** Clamp an SMS body to the segment cap, appending an ellipsis when truncated. */
export function truncateSms(body: string, max: number = SMS_MAX_LENGTH): string {
  if (body.length <= max) return body
  return body.slice(0, max - 1).trimEnd() + '…'
}

export interface ProviderResult {
  success: boolean
  providerMessageId?: string | null
  error?: string | null
}

/** Normalise a boolean/throwing provider call into a ProviderResult. */
export function normalizeProviderResult(
  ok: boolean,
  opts: { providerMessageId?: string | null; error?: string | null } = {}
): ProviderResult {
  return ok
    ? { success: true, providerMessageId: opts.providerMessageId ?? null }
    : { success: false, error: opts.error ?? 'provider returned failure' }
}

export interface BatchSummary {
  claimed: number
  sent: number
  failed: number
  skipped: number
}

/** Aggregate per-delivery outcomes into a batch summary for logging/response. */
export function summarizeBatch(
  outcomes: { status: 'sent' | 'failed' | 'skipped' }[]
): BatchSummary {
  return {
    claimed: outcomes.length,
    sent: outcomes.filter((o) => o.status === 'sent').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
  }
}
