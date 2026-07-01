// components/admin/users/Badges.tsx — small role/status/KYC pills.
import type { Enums } from '@/types/supabase'
import { isStaffRole } from '@/lib/admin/rbac'

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' + className}>
      {children}
    </span>
  )
}

export function RoleBadge({ role }: { role: Enums<'user_role'> | null }) {
  if (!role) return <span className="text-muted-foreground">—</span>
  if (role === 'superadmin')
    return <Pill className="bg-amber-500/15 text-amber-600 dark:text-amber-400">👑 superadmin</Pill>
  if (isStaffRole(role)) return <Pill className="bg-primary/10 text-primary">{role}</Pill>
  if (role === 'creator' || role === 'marketer')
    return <Pill className="bg-violet-500/10 text-violet-600 dark:text-violet-400">{role}</Pill>
  return <Pill className="bg-muted text-muted-foreground">{role}</Pill>
}

export function StatusBadge({ status }: { status: Enums<'account_status'> | null }) {
  const map: Record<string, string> = {
    active: 'bg-green-500/10 text-green-600 dark:text-green-400',
    suspended: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    closed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  }
  if (!status) return <span className="text-muted-foreground">—</span>
  return <Pill className={map[status] ?? 'bg-muted text-muted-foreground'}>{status}</Pill>
}

export function KycBadge({ status }: { status: Enums<'kyc_status'> | null }) {
  const map: Record<string, string> = {
    verified: 'bg-green-500/10 text-green-600 dark:text-green-400',
    pending: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
    unverified: 'bg-muted text-muted-foreground',
  }
  if (!status) return <span className="text-muted-foreground">—</span>
  return <Pill className={map[status] ?? 'bg-muted text-muted-foreground'}>{status}</Pill>
}
