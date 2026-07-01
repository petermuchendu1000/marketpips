// app/admin/users/[id]/page.tsx — User detail: profile, wallet, KYC, activity,
// roles, notes, and audited operator actions (all capability-scoped).
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePageCapability } from '@/lib/admin/page-guard'
import {
  roleHasCapability,
  canGrantRole,
  canChangeAccountStatus,
  isStaffRole,
  isSuperadmin,
  ALL_CAPABILITIES,
} from '@/lib/admin/rbac'
import type { Role } from '@/lib/admin/rbac'
import { RoleBadge, StatusBadge, KycBadge } from '@/components/admin/users/Badges'
import { UserActions } from '@/components/admin/users/UserActions'

export const dynamic = 'force-dynamic'

const ALL_ROLES: Role[] = [
  'user', 'creator', 'marketer', 'resolver', 'support', 'finance', 'moderator', 'admin', 'superadmin',
]

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePageCapability('users:read')
  const supabase = ctx.supabase
  const actorRole = ctx.role

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', id).single()
  if (!profile) notFound()

  const [wallets, txs, kycDocs, notes, positionsCount] = await Promise.all([
    supabase.from('wallets').select('*').eq('user_id', id).order('currency'),
    supabase.from('transactions').select('id, type, status, amount, currency, amount_usd, description, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
    supabase.from('kyc_documents').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('admin_user_notes').select('id, note, author_id, created_at').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('positions').select('id', { count: 'exact', head: true }).eq('user_id', id).eq('is_active', true),
  ])

  const targetRole = (profile.role ?? 'user') as Role
  const targetImmutable = isSuperadmin(targetRole)

  // Compute the operator's permitted actions (server-authoritative).
  const allowedRoles = roleHasCapability(actorRole, 'users:role_grant') && !targetImmutable
    ? ALL_ROLES.filter((r) => r !== targetRole && canGrantRole(actorRole, r))
    : []
  const canStatus = canChangeAccountStatus(actorRole, targetRole)
  const canBalance = roleHasCapability(actorRole, 'users:update')
  const canImpersonate =
    roleHasCapability(actorRole, 'users:impersonate') &&
    !targetImmutable &&
    (!isStaffRole(targetRole) || isSuperadmin(actorRole))
  const canNote = roleHasCapability(actorRole, 'users:read')
  const effectiveCaps = isSuperadmin(targetRole) ? [...ALL_CAPABILITIES] : undefined

  const walletRows = wallets.data ?? []
  const currencies = walletRows.map((w) => w.currency)

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/users" className="text-sm text-primary hover:underline">← All users</Link>

      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black">{profile.display_name || profile.username || id.slice(0, 8)}</h1>
        <RoleBadge role={profile.role} />
        <StatusBadge status={profile.account_status} />
        <KycBadge status={profile.kyc_status} />
        {targetImmutable && (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            👑 Immutable — cannot be demoted or removed
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: profile + wallet + activity */}
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">Profile</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Field label="Username" value={profile.username} />
              <Field label="Phone" value={profile.phone_number} />
              <Field label="Country" value={profile.country_code} />
              <Field label="Currency" value={profile.preferred_currency} />
              <Field label="Referral code" value={profile.referral_code} />
              <Field label="Referrals" value={String(profile.referral_count ?? 0)} />
              <Field label="Total bets" value={String(profile.total_bets ?? 0)} />
              <Field label="Volume USD" value={(profile.total_volume_usd ?? 0).toLocaleString()} />
              <Field label="P/L USD" value={(profile.profit_loss_usd ?? 0).toLocaleString()} />
              <Field label="Open positions" value={String(positionsCount.count ?? 0)} />
              <Field label="Joined" value={profile.created_at ? new Date(profile.created_at).toLocaleString() : '—'} />
              <Field label="Last login" value={profile.last_login_at ? new Date(profile.last_login_at).toLocaleString() : '—'} />
            </dl>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">Wallets</h2>
            <div className="table-wrapper overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Currency</th>
                    <th className="py-2 text-right">Available</th>
                    <th className="py-2 text-right">Reserved</th>
                    <th className="py-2 text-right">Deposited</th>
                    <th className="py-2 text-right">Withdrawn</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {walletRows.map((w) => (
                    <tr key={w.id}>
                      <td className="py-2 font-medium">{w.currency}</td>
                      <td className="py-2 text-right tabular-nums">{Number(w.available_balance).toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{Number(w.reserved_balance).toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{Number(w.total_deposited).toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{Number(w.total_withdrawn).toLocaleString()}</td>
                    </tr>
                  ))}
                  {walletRows.length === 0 && (
                    <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No wallets</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">Recent transactions</h2>
            <div className="divide-y text-sm">
              {(txs.data ?? []).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-muted-foreground">{t.type}</span>
                  <span className="truncate">{t.description ?? ''}</span>
                  <span className="tabular-nums">{Number(t.amount).toLocaleString()} {t.currency}</span>
                  <span className="text-xs text-muted-foreground">{t.created_at ? new Date(t.created_at).toLocaleDateString() : ''}</span>
                </div>
              ))}
              {(txs.data ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">No transactions</p>}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">KYC documents</h2>
            <div className="space-y-2 text-sm">
              {(kycDocs.data ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                  <span>{d.document_type} {d.document_number ? `· ${d.document_number}` : ''}</span>
                  <KycBadge status={d.status} />
                </div>
              ))}
              {(kycDocs.data ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">No KYC documents</p>}
            </div>
          </section>
        </div>

        {/* Right: actions + notes */}
        <div className="space-y-6">
          <UserActions
            userId={id}
            currentRole={targetRole}
            currentStatus={(profile.account_status ?? 'active')}
            currencies={currencies}
            allowedRoles={allowedRoles}
            canStatus={canStatus}
            canBalance={canBalance}
            canImpersonate={canImpersonate}
            canNote={canNote}
            immutable={targetImmutable}
          />

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">Effective capabilities</h2>
            {effectiveCaps ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">👑 Superadmin — all capabilities</p>
            ) : (
              <CapList role={targetRole} />
            )}
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 font-semibold">Internal notes</h2>
            <div className="space-y-2 text-sm">
              {(notes.data ?? []).map((n) => (
                <div key={n.id} className="rounded-lg border px-3 py-2">
                  <p>{n.note}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                  </p>
                </div>
              ))}
              {(notes.data ?? []).length === 0 && <p className="text-muted-foreground">No notes yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  )
}

function CapList({ role }: { role: Role }) {
  const caps = ALL_CAPABILITIES.filter((c) => roleHasCapability(role, c))
  if (caps.length === 0) return <p className="text-sm text-muted-foreground">None (regular user)</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {caps.map((c) => (
        <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{c}</span>
      ))}
    </div>
  )
}
