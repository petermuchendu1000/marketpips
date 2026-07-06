// components/admin/markets/MarketBadges.tsx — market status + outcome pills.
import type { Enums } from '@/types/supabase'
import { Pill, type PillTone } from '@/components/admin/ui'

const MAP: Record<string, PillTone> = {
  draft: 'slate',
  pending: 'blue',
  active: 'green',
  closed: 'amber',
  resolved: 'violet',
  disputed: 'red',
  cancelled: 'slate',
}

export function MarketStatusBadge({ status }: { status: Enums<'market_status'> | null }) {
  if (!status) return <span className="text-[var(--text-muted)]">—</span>
  return <Pill tone={MAP[status] ?? 'neutral'} dot>{status}</Pill>
}

export function OutcomeBadge({ outcome }: { outcome: Enums<'order_side'> | null }) {
  if (!outcome) return <span className="text-[var(--text-muted)]">—</span>
  return <Pill tone={outcome === 'yes' ? 'green' : 'red'}>{outcome.toUpperCase()}</Pill>
}
