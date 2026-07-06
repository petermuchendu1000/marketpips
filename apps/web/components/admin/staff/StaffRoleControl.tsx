'use client'

// components/admin/staff/StaffRoleControl.tsx — inline role grant/revoke for the
// Staff & Roles console. Reuses the guarded POST /api/admin/users/[id]/role
// endpoint (DB RPC admin_set_user_role is the real backstop); the client only
// offers targets that pass canChangeUserRole() so the UI never presents an
// action the operator can't perform. Superadmin targets are immutable.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { canChangeUserRole, isSuperadmin, type Role } from '@/lib/admin/rbac'
import { Pill } from '@/components/admin/ui'

// Display order for the role dropdown (low → high privilege).
const ROLE_ORDER: Role[] = [
  'user',
  'creator',
  'marketer',
  'resolver',
  'support',
  'finance',
  'moderator',
  'admin',
  'superadmin',
]

export function StaffRoleControl({
  userId,
  userName,
  currentRole,
  actorRole,
}: {
  userId: string
  userName: string
  currentRole: Role
  actorRole: Role
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Superadmin accounts are immutable through the app.
  if (isSuperadmin(currentRole)) {
    return (
      <Pill tone="amber" className="whitespace-nowrap">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2v-7a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 016 0v3H9z" />
        </svg>
        Immutable
      </Pill>
    )
  }

  const targets = ROLE_ORDER.filter((r) => canChangeUserRole(actorRole, currentRole, r))
  if (targets.length === 0) {
    return <span className="text-xs text-[var(--text-muted)]">No permission</span>
  }

  async function onChange(next: string) {
    if (!next || next === currentRole) return
    const ok = window.confirm(
      `Change ${userName}'s role from "${currentRole}" to "${next}"? This takes effect immediately.`,
    )
    if (!ok) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || `Failed (${res.status})`)
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError('Network error')
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <select
        aria-label={`Change role for ${userName}`}
        defaultValue={currentRole}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border bg-[var(--bg-secondary)] px-2 py-1 text-xs disabled:opacity-50"
      >
        <option value={currentRole}>{currentRole} (current)</option>
        {targets.map((r) => (
          <option key={r} value={r}>
            → {r}
          </option>
        ))}
      </select>
      {error && <span className="text-[0.7rem] text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
