// app/admin/users/page.tsx — User directory: search / filter / segment / export.
import Link from 'next/link'
import { requirePageCapability } from '@/lib/admin/page-guard'
import {
  parseUserListParams,
  fetchUsers,
  USER_SORTS,
  type UserListParams,
} from '@/lib/admin/users'
import { RoleBadge, StatusBadge, KycBadge } from '@/components/admin/users/Badges'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Users' }

const ROLE_OPTIONS = ['', 'user', 'creator', 'marketer', 'resolver', 'support', 'finance', 'moderator', 'admin', 'superadmin']
const STATUS_OPTIONS = ['', 'active', 'suspended', 'closed']
const KYC_OPTIONS = ['', 'unverified', 'pending', 'verified', 'rejected']

function qs(params: UserListParams, overrides: Partial<UserListParams>): string {
  const merged = { ...params, ...overrides }
  const sp = new URLSearchParams()
  if (merged.q) sp.set('q', merged.q)
  if (merged.role) sp.set('role', merged.role)
  if (merged.status) sp.set('status', merged.status)
  if (merged.kyc) sp.set('kyc', merged.kyc)
  if (merged.country) sp.set('country', merged.country)
  sp.set('sort', merged.sort)
  sp.set('dir', merged.dir)
  sp.set('page', String(merged.page))
  sp.set('pageSize', String(merged.pageSize))
  return sp.toString()
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePageCapability('users:read')
  const sp = await searchParams
  const params = parseUserListParams(sp)
  const ctx = await requirePageCapability('users:read')
  const { rows, total } = await fetchUsers(ctx.supabase, params)

  const totalPages = Math.max(1, Math.ceil(total / params.pageSize))
  const from = total === 0 ? 0 : (params.page - 1) * params.pageSize + 1
  const to = Math.min(total, params.page * params.pageSize)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Users</h1>
        <a
          href={`/api/admin/users/export?${qs(params, { page: 1 })}`}
          className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          ⬇ Export CSV
        </a>
      </div>

      {/* Filters (server-rendered GET form) */}
      <form method="get" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Search name, phone, referral…"
          className="rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-2"
        />
        <select name="role" defaultValue={params.role ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm">
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{r === '' ? 'Any role' : r}</option>
          ))}
        </select>
        <select name="status" defaultValue={params.status ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((r) => (
            <option key={r} value={r}>{r === '' ? 'Any status' : r}</option>
          ))}
        </select>
        <select name="kyc" defaultValue={params.kyc ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm">
          {KYC_OPTIONS.map((r) => (
            <option key={r} value={r}>{r === '' ? 'Any KYC' : r}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <select name="sort" defaultValue={params.sort} className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-2 text-sm">
            {USER_SORTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select name="dir" defaultValue={params.dir} className="rounded-lg border bg-background px-2 py-2 text-sm">
            <option value="desc">↓</option>
            <option value="asc">↑</option>
          </select>
        </div>
        <input type="text" name="country" defaultValue={params.country ?? ''} placeholder="Country (KE)" maxLength={2} className="rounded-lg border bg-background px-3 py-2 text-sm uppercase" />
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          Apply
        </button>
      </form>

      {/* Results */}
      <div className="table-wrapper overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">KYC</th>
              <th className="px-4 py-3 font-medium">Country</th>
              <th className="px-4 py-3 text-right font-medium">Volume USD</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-primary hover:underline">
                    {u.display_name || u.username || u.id.slice(0, 8)}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {u.username ? `@${u.username}` : ''} {u.phone_number ?? ''}
                  </div>
                </td>
                <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                <td className="px-4 py-3"><StatusBadge status={u.account_status} /></td>
                <td className="px-4 py-3"><KycBadge status={u.kyc_status} /></td>
                <td className="px-4 py-3">{u.country_code ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {(u.total_volume_usd ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No users match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {from}–{to} of {total.toLocaleString()}
        </span>
        <div className="flex gap-2">
          {params.page > 1 && (
            <Link href={`/admin/users?${qs(params, { page: params.page - 1 })}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">
              ← Prev
            </Link>
          )}
          <span className="px-2 py-1.5 text-muted-foreground">
            Page {params.page} / {totalPages}
          </span>
          {params.page < totalPages && (
            <Link href={`/admin/users?${qs(params, { page: params.page + 1 })}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
