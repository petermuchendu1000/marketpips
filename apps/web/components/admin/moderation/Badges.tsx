// components/admin/moderation/Badges.tsx — report status / reason / SLA pills.
import { reasonLabel, statusLabel, entityLabel } from '@/lib/admin/moderation'

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' + className}>
      {children}
    </span>
  )
}

const STATUS_MAP: Record<string, string> = {
  open: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  reviewing: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  actioned: 'bg-green-500/10 text-green-600 dark:text-green-400',
  dismissed: 'bg-muted text-muted-foreground',
}

const REASON_MAP: Record<string, string> = {
  illegal: 'bg-red-500/10 text-red-600 dark:text-red-400',
  fraud: 'bg-red-500/10 text-red-600 dark:text-red-400',
  harassment: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  abuse: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  misinformation: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  spam: 'bg-muted text-muted-foreground',
  other: 'bg-muted text-muted-foreground',
}

export function ReportStatusBadge({ status }: { status: string }) {
  return <Pill className={STATUS_MAP[status] ?? 'bg-muted text-muted-foreground'}>{statusLabel(status)}</Pill>
}

export function ReasonBadge({ reason }: { reason: string }) {
  return <Pill className={REASON_MAP[reason] ?? 'bg-muted text-muted-foreground'}>{reasonLabel(reason)}</Pill>
}

export function EntityBadge({ entityType }: { entityType: string }) {
  return <Pill className="bg-muted text-muted-foreground">{entityLabel(entityType)}</Pill>
}

/** SLA pill: red when overdue, muted with the due time otherwise. */
export function SlaBadge({ overdue, dueLabel }: { overdue: boolean; dueLabel: string }) {
  return overdue ? (
    <Pill className="bg-red-500/10 text-red-600 dark:text-red-400">Overdue</Pill>
  ) : (
    <Pill className="bg-muted text-muted-foreground">Due {dueLabel}</Pill>
  )
}
