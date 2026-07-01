// app/admin/markets/[id]/page.tsx — Market detail + lifecycle actions.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePageCapability } from '@/lib/admin/page-guard'
import { roleHasCapability } from '@/lib/admin/rbac'
import { availableMarketActions, type MarketStatus } from '@/lib/admin/markets'
import { MarketStatusBadge, OutcomeBadge } from '@/components/admin/markets/MarketBadges'
import { MarketActions, type AllowedAction } from '@/components/admin/markets/MarketActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Market detail' }

function money(v: number | null | undefined): string {
  return '$' + Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
}
function dt(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleString() : '—'
}

export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePageCapability(['markets:approve', 'markets:resolve', 'markets:cancel'])

  const { data: m, error } = await ctx.supabase
    .from('markets')
    .select(
      'id, slug, title, description, category, status, creator_id, creator_reward_rate, platform_fee_rate, opens_at, closes_at, resolves_at, resolved_at, resolver_id, resolution_criteria, resolution_source, resolution_notes, resolved_outcome, yes_price, no_price, liquidity_pool_usd, total_volume_usd, yes_volume_usd, no_volume_usd, total_bets, unique_bettors, is_featured, is_trending, featured_order, tags, created_at, creator:profiles!markets_creator_id_fkey(username, display_name)'
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!m) notFound()

  const status = m.status as MarketStatus
  const creator = (m as { creator?: { username: string | null; display_name: string | null } | null }).creator
  const allowed: AllowedAction[] = availableMarketActions(status)
    .filter((a) => roleHasCapability(ctx.role, a.capability))
    .map((a) => ({ key: a.key, label: a.label, danger: a.danger }))

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/markets" className="text-sm text-muted-foreground hover:underline">← Markets</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black">{m.title}</h1>
          <MarketStatusBadge status={status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          /{m.slug} · by {creator?.username ?? creator?.display_name ?? m.creator_id}
        </p>
      </div>

      {/* Actions */}
      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-bold uppercase text-muted-foreground">Actions</h2>
        {allowed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions available for a {status} market with your permissions.</p>
        ) : (
          <MarketActions
            marketId={m.id}
            actions={allowed}
            isFeatured={!!m.is_featured}
            isTrending={!!m.is_trending}
            featuredOrder={m.featured_order ?? null}
          />
        )}
      </section>

      {/* Description & criteria */}
      <section className="rounded-xl border p-4">
        <h2 className="mb-2 text-sm font-bold uppercase text-muted-foreground">Details</h2>
        <p className="whitespace-pre-wrap text-sm">{m.description}</p>
        <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
          <span className="font-semibold">Resolution criteria: </span>{m.resolution_criteria}
        </div>
        {m.resolution_notes && (
          <div className="mt-2 rounded-lg bg-muted/40 p-3 text-sm">
            <span className="font-semibold">Resolution notes: </span>{m.resolution_notes}
          </div>
        )}
      </section>

      {/* Stats grid */}
      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-bold uppercase text-muted-foreground">Market data</h2>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Category">{m.category ?? '—'}</Field>
          <Field label="YES / NO price">{Number(m.yes_price ?? 0).toFixed(3)} / {Number(m.no_price ?? 0).toFixed(3)}</Field>
          <Field label="Volume (USD)">{money(m.total_volume_usd)}</Field>
          <Field label="Liquidity (USD)">{money(m.liquidity_pool_usd)}</Field>
          <Field label="Total bets">{(m.total_bets ?? 0).toLocaleString()}</Field>
          <Field label="Unique bettors">{(m.unique_bettors ?? 0).toLocaleString()}</Field>
          <Field label="Platform fee">{((Number(m.platform_fee_rate ?? 0)) * 100).toFixed(2)}%</Field>
          <Field label="Creator reward">{((Number(m.creator_reward_rate ?? 0)) * 100).toFixed(2)}%</Field>
          <Field label="Opens">{dt(m.opens_at)}</Field>
          <Field label="Closes">{dt(m.closes_at)}</Field>
          <Field label="Resolves">{dt(m.resolves_at)}</Field>
          <Field label="Resolved">{dt(m.resolved_at)}</Field>
          <Field label="Outcome"><OutcomeBadge outcome={m.resolved_outcome} /></Field>
          <Field label="Featured">{m.is_featured ? `Yes (#${m.featured_order ?? '—'})` : 'No'}</Field>
          <Field label="Trending">{m.is_trending ? 'Yes' : 'No'}</Field>
          <Field label="Created">{dt(m.created_at)}</Field>
        </dl>
      </section>
    </div>
  )
}
