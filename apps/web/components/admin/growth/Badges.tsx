// components/admin/growth/Badges.tsx — status pills for Module E (creators,
// marketers, campaigns, payout runs & items).
function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' + className}>
      {children}
    </span>
  )
}

const PROFILE_MAP: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600 dark:text-green-400',
  suspended: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  revoked: 'bg-red-500/10 text-red-600 dark:text-red-400',
}
export function ProfileStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return <Pill className={PROFILE_MAP[status] ?? 'bg-muted text-muted-foreground'}>{status}</Pill>
}

const TIER_MAP: Record<string, string> = {
  bronze: 'bg-amber-700/15 text-amber-700 dark:text-amber-500',
  silver: 'bg-slate-400/20 text-slate-600 dark:text-slate-300',
  gold: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
}
export function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return <span className="text-muted-foreground">—</span>
  return <Pill className={TIER_MAP[tier] ?? 'bg-primary/10 text-primary'}>{tier}</Pill>
}

const APP_MAP: Record<string, string> = {
  pending: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
}
export function ApplicationStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return <Pill className={APP_MAP[status] ?? 'bg-muted text-muted-foreground'}>{status}</Pill>
}

const CAMPAIGN_MAP: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600 dark:text-green-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  ended: 'bg-muted text-muted-foreground',
}
export function CampaignStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return <Pill className={CAMPAIGN_MAP[status] ?? 'bg-muted text-muted-foreground'}>{status}</Pill>
}

const RUN_MAP: Record<string, string> = {
  draft: 'bg-slate-400/20 text-slate-600 dark:text-slate-300',
  computed: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  disbursed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  cancelled: 'bg-muted text-muted-foreground',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
}
export function RunStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return <Pill className={RUN_MAP[status] ?? 'bg-muted text-muted-foreground'}>{status}</Pill>
}

const ITEM_MAP: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  paid: 'bg-green-500/10 text-green-600 dark:text-green-400',
  held: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  clawed_back: 'bg-red-500/10 text-red-600 dark:text-red-400',
}
export function ItemStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  return <Pill className={ITEM_MAP[status] ?? 'bg-muted text-muted-foreground'}>{status.replace('_', ' ')}</Pill>
}

export function SettlementBadge({ settlement }: { settlement: string | null }) {
  if (!settlement) return <span className="text-muted-foreground">—</span>
  const cls =
    settlement === 'credited'
      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
      : 'bg-slate-400/20 text-slate-600 dark:text-slate-300'
  return <Pill className={cls}>{settlement === 'credited' ? 'credited' : 'statement'}</Pill>
}

export function KindBadge({ kind }: { kind: string | null }) {
  if (!kind) return <span className="text-muted-foreground">—</span>
  return <Pill className="bg-primary/10 text-primary">{kind}</Pill>
}
