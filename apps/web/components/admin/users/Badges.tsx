// components/admin/users/Badges.tsx — role / status / KYC pills.
// Delegates to the shared tone-driven Pill so colour semantics stay consistent
// with every other status badge in the console.
import type { Enums } from '@/types/supabase'
import { isStaffRole } from '@/lib/admin/rbac'
import { Pill } from '@/components/admin/ui'

const dash = <span className="text-[var(--text-muted)]">—</span>

export function RoleBadge({ role }: { role: Enums<'user_role'> | null }) {
  if (!role) return dash
  if (role === 'superadmin')
    return (
      <Pill tone="amber">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M5 18h14l1-9-4.5 3L12 5 8.5 12 4 9z" /></svg>
        superadmin
      </Pill>
    )
  if (isStaffRole(role)) return <Pill tone="blue">{role}</Pill>
  if (role === 'creator' || role === 'marketer') return <Pill tone="violet">{role}</Pill>
  return <Pill tone="neutral">{role}</Pill>
}

export function StatusBadge({ status }: { status: Enums<'account_status'> | null }) {
  if (!status) return dash
  const tone = status === 'active' ? 'green' : status === 'suspended' ? 'amber' : status === 'closed' ? 'red' : 'neutral'
  return <Pill tone={tone} dot>{status}</Pill>
}

export function KycBadge({ status }: { status: Enums<'kyc_status'> | null }) {
  if (!status) return dash
  const tone = status === 'verified' ? 'green' : status === 'pending' ? 'blue' : status === 'rejected' ? 'red' : 'neutral'
  return <Pill tone={tone}>{status}</Pill>
}
