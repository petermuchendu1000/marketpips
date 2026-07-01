// components/admin/finance/FinanceBadges.tsx — transaction status & provider pills.
import type { Enums } from '@/types/supabase'

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' + className}>
      {children}
    </span>
  )
}

const STATUS_MAP: Record<string, string> = {
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  processing: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  refunded: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
}

export function TxnStatusBadge({ status }: { status: Enums<'transaction_status'> | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return <Pill className={STATUS_MAP[status] ?? 'bg-muted text-muted-foreground'}>{status}</Pill>
}

export function ProviderBadge({ provider }: { provider: Enums<'payment_provider'> | null }) {
  if (!provider) return <span className="text-muted-foreground">—</span>
  return <Pill className="bg-muted text-muted-foreground">{provider}</Pill>
}
