// components/admin/markets/MarketBadges.tsx — market status pill.
import type { Enums } from '@/types/supabase'

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' + className}>
      {children}
    </span>
  )
}

const MAP: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  active: 'bg-green-500/10 text-green-600 dark:text-green-400',
  closed: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  resolved: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  disputed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  cancelled: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

export function MarketStatusBadge({ status }: { status: Enums<'market_status'> | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return <Pill className={MAP[status] ?? 'bg-muted text-muted-foreground'}>{status}</Pill>
}

export function OutcomeBadge({ outcome }: { outcome: Enums<'order_side'> | null }) {
  if (!outcome) return <span className="text-muted-foreground">—</span>
  return (
    <Pill className={outcome === 'yes' ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}>
      {outcome.toUpperCase()}
    </Pill>
  )
}
