// app/admin/kyc/page.tsx — KYC / compliance review queue.
import { requirePageCapability } from '@/lib/admin/page-guard'
import { KycReviewActions } from '@/components/admin/kyc/KycReviewActions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin — KYC' }

export default async function KycQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePageCapability('kyc:review')
  const sp = await searchParams
  const rawStatus = (Array.isArray(sp.status) ? sp.status[0] : sp.status) || 'pending'
  const statuses = ['pending', 'verified', 'rejected', 'unverified'] as const
  type KycStatus = (typeof statuses)[number]
  const status: KycStatus = (statuses as readonly string[]).includes(rawStatus)
    ? (rawStatus as KycStatus)
    : 'pending'

  const { data: docs } = await ctx.supabase
    .from('kyc_documents')
    .select('id, user_id, document_type, document_number, country_of_issue, status, rejection_reason, created_at')
    .eq('status', status)
    .order('created_at', { ascending: true })
    .limit(100)

  const userIds = Array.from(new Set((docs ?? []).map((d) => d.user_id)))
  const { data: profiles } = userIds.length
    ? await ctx.supabase.from('profiles').select('id, display_name, username, country_code').in('id', userIds)
    : { data: [] as { id: string; display_name: string | null; username: string | null; country_code: string | null }[] }
  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]))

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-black">KYC & Compliance</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <a
            key={s}
            href={`/admin/kyc?status=${s}`}
            className={
              'rounded-lg border px-3 py-1.5 text-sm ' +
              (s === status ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')
            }
          >
            {s}
          </a>
        ))}
      </div>

      <div className="space-y-3">
        {(docs ?? []).map((d) => {
          const p = pmap.get(d.user_id)
          return (
            <div key={d.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <a href={`/admin/users/${d.user_id}`} className="font-semibold text-primary hover:underline">
                    {p?.display_name || p?.username || d.user_id.slice(0, 8)}
                  </a>
                  <p className="text-sm text-muted-foreground">
                    {d.document_type} {d.document_number ? `· ${d.document_number}` : ''} · {d.country_of_issue || p?.country_code || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Submitted {d.created_at ? new Date(d.created_at).toLocaleString() : '—'}
                  </p>
                  {d.rejection_reason && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">Reason: {d.rejection_reason}</p>
                  )}
                </div>
                {status === 'pending' && <KycReviewActions docId={d.id} />}
              </div>
            </div>
          )
        })}
        {(docs ?? []).length === 0 && (
          <p className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">
            No {status} documents.
          </p>
        )}
      </div>
    </div>
  )
}
