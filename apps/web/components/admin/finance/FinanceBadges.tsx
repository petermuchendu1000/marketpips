// components/admin/finance/FinanceBadges.tsx — transaction status / provider / type
// pills, delegating to the shared tone-driven admin Pill so finance reads as one
// system with the rest of the control plane.
import type { Enums } from '@/types/supabase'
import { Pill, toneFor, type PillTone } from '@/components/admin/ui'

const DASH = <span className="text-[var(--text-muted)]">—</span>

/** Money-lifecycle status → tone. Terminal-good is green, in-flight blue,
 *  waiting amber, failure red, reversal violet. */
const STATUS_TONE: Record<string, PillTone> = {
  completed: 'green',
  processing: 'blue',
  pending: 'amber',
  failed: 'red',
  refunded: 'violet',
}

export function TxnStatusBadge({ status }: { status: Enums<'transaction_status'> | null }) {
  if (!status) return DASH
  return (
    <Pill tone={toneFor(status, STATUS_TONE)} dot>
      {status}
    </Pill>
  )
}

/** Providers are neutral by default — they identify a rail, not a state. */
const PROVIDER_LABEL: Record<string, string> = {
  mpesa: 'M-Pesa',
  mtn_momo: 'MTN MoMo',
  airtel_money: 'Airtel Money',
  pesapal: 'Pesapal',
  bank_transfer: 'Bank',
  internal: 'Internal',
}

export function ProviderBadge({ provider }: { provider: Enums<'payment_provider'> | null }) {
  if (!provider) return DASH
  return <Pill tone="slate">{PROVIDER_LABEL[provider] ?? provider}</Pill>
}

/** Ledger transaction type → tone. Inflows green, outflows red, wagering blue,
 *  incentives teal-ish violet, fees amber. */
const TYPE_TONE: Record<string, PillTone> = {
  deposit: 'green',
  bet_won: 'green',
  bonus: 'green',
  referral_bonus: 'violet',
  creator_reward: 'violet',
  withdrawal: 'red',
  bet_lost: 'slate',
  bet_placed: 'blue',
  bet_refunded: 'violet',
  fee: 'amber',
}

export function TxnTypeBadge({ type }: { type: Enums<'transaction_type'> | string | null }) {
  if (!type) return DASH
  return <Pill tone={toneFor(type, TYPE_TONE)}>{String(type).replace(/_/g, ' ')}</Pill>
}
