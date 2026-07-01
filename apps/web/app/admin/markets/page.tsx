// app/admin/markets/page.tsx — Market review queue: filter / sort / paginate.
import Link from 'next/link'
import { requirePageCapability } from '@/lib/admin/page-guard'
import {
  parseMarketListParams,
  fetchMarkets,
  MARKET_SORTS,
  type MarketListParams,
} from '@/lib/admin/markets'
import { MarketStatusBadge, OutcomeBadge } from '@/components/admin/markets/MarketBadges'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Markets' }

const STATUS_OPTIONS = ['', 'draft', 'pending', 'active', 'closed', 'resolved', 'disputed', 'cancelled']
const CATEGORY_OPTIONS = ['', 'politics', 'sports', 'crypto', 'economics', 'entertainment', 'technology', 'weather', 'other']

function qs(params: MarketListParams, overrides: Partial<MarketListParams>): string {
  const merged = { ...params, ...overrides }
  const sp = new URLSearchParams()
  if (merged.q) sp.set('q', merged.q)
  if (merged.status) sp.set('status', merged.status)
  if (merged.category) sp.set('category', merged.category)
  if (merged.featured !== null) sp.set('featured', String(merged.featured))
  sp.set('sort', merged.sort)
  sp.set('dir', merged.dir)
  sp.set('page', String(merged.page))
  sp.set('pageSize', String(merged.pageSize))
  return sp.toString()
}

function money(v: number | null): string {
  return '$' + (Number(v ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePageCapability(['markets:approve', 'markets:resolve', 'markets:cancel'])
  const params = parseMarketListParams(await searchParams)
  const { rows, total } = await fetchMarkets(ctx.supabase, params)

  const totalPages = Math.max(1, Math.ceil(total / params.pageSize))
  const from = total === 0 ? 0 : (params.page - 1) * params.pageSize + 1
  const to = Math.min(total, params.page * params.pageSize)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black">Markets</h1>
        <Link href="/admin/markets/disputes" className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">
          Dispute queue →
        </Link>
      </div>

      <form method="get" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Search title / slug…"
          className="rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-2"
        />
        <select name="status" defaultValue={params.status ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === '' ? 'Any status' : s}</option>
          ))}
        </select>
        <select name="category" defaultValue={params.category ?? ''} className="rounded-lg border bg-background px-3 py-2 text-sm">
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c === '' ? 'Any category' : c}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <select name="sort" defaultValue={params.sort} className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-2 text-sm">
            {MARKET_SORTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select name="dir" defaultValue={params.dir} className="rounded-lg border bg-background px-2 py-2 text-sm">
            <option value="desc">↓</option>
            <option value="asc">↑</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          Filter
        </button>
      </form>

      <div className="table-wrapper overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Market</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">Volume</th>
              <th className="px-3 py-2 text-right">Bets</th>
              <th className="px-3 py-2">Closes</th>
              <th className="px-3 py-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No markets match.</td></tr>
            )}
            {rows.map((m) => (
              <tr key={m.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link href={`/admin/markets/${m.id}`} className="font-medium text-primary hover:underline">
                    {m.title ?? m.slug ?? m.id}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    by {m.creator?.username ?? m.creator?.display_name ?? '—'}
                    {m.is_featured ? ' · ★ featured' : ''}{m.is_trending ? ' · 🔥 trending' : ''}
                  </div>
                </td>
                <td className="px-3 py-2"><MarketStatusBadge status={m.status} /></td>
                <td className="px-3 py-2 text-muted-foreground">{m.category ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(m.total_volume_usd)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{(m.total_bets ?? 0).toLocaleString()}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {m.closes_at ? new Date(m.closes_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-3 py-2"><OutcomeBadge outcome={m.resolved_outcome} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{from}–{to} of {total.toLocaleString()}</span>
        <div className="flex gap-2">
          {params.page > 1 && (
            <Link href={`/admin/markets?${qs(params, { page: params.page - 1 })}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">← Prev</Link>
          )}
          <span className="px-2 py-1.5 text-muted-foreground">Page {params.page} / {totalPages}</span>
          {params.page < totalPages && (
            <Link href={`/admin/markets?${qs(params, { page: params.page + 1 })}`} className="rounded-lg border px-3 py-1.5 hover:bg-muted">Next →</Link>
          )}
        </div>
      </div>
    </div>
  )
}
