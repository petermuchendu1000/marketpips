// app/admin/markets/disputes/page.tsx — Disputed market queue.
import Link from 'next/link'
import { requirePageCapability } from '@/lib/admin/page-guard'
import { MarketStatusBadge } from '@/components/admin/markets/MarketBadges'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — Market disputes' }

export default async function DisputesPage() {
  const ctx = await requirePageCapability(['markets:resolve', 'markets:cancel'])

  const { data, error } = await ctx.supabase
    .from('markets')
    .select('id, title, slug, status, closes_at, resolves_at, total_volume_usd, resolution_notes, updated_at, creator:profiles!markets_creator_id_fkey(username)')
    .eq('status', 'disputed')
    .order('updated_at', { ascending: true })
    .limit(200)

  if (error) throw new Error(error.message)
  const rows = data ?? []

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/markets" className="text-sm text-muted-foreground hover:underline">← Markets</Link>
        <h1 className="text-2xl font-black">Dispute queue</h1>
        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
          {rows.length} open
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-muted-foreground">No disputed markets. 🎉</div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((m) => {
            const creator = (m as { creator?: { username: string | null } | null }).creator
            const ageHrs = m.updated_at ? Math.round((Date.now() - new Date(m.updated_at).getTime()) / 3_600_000) : null
            return (
              <div key={m.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/admin/markets/${m.id}`} className="font-semibold text-primary hover:underline">{m.title}</Link>
                    <p className="text-xs text-muted-foreground">by {creator?.username ?? '—'} · SLA age: {ageHrs != null ? `${ageHrs}h` : '—'}</p>
                  </div>
                  <MarketStatusBadge status={m.status} />
                </div>
                {m.resolution_notes && (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">{m.resolution_notes}</p>
                )}
                <div className="mt-3">
                  <Link href={`/admin/markets/${m.id}`} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Review & resolve →</Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
