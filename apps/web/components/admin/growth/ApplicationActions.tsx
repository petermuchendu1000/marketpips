'use client'

// Approve/reject a creator|marketer application row. Approve routes to the
// creator/marketer action endpoint; reject routes to the application endpoint.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50'

export function ApplicationActions({
  applicationId,
  userId,
  kind,
  tiers,
}: {
  applicationId: string
  userId: string
  kind: 'creator' | 'marketer'
  tiers: string[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState<'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [tier, setTier] = useState(tiers[0] ?? 'bronze')

  async function call(url: string, payload: Record<string, unknown>) {
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Action failed')
        return
      }
      setMode(null)
      start(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'reject') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="w-52 rounded-lg border bg-background px-2 py-1 text-xs" />
        <div className="flex gap-1.5">
          <button onClick={() => setMode(null)} className={btn + ' border hover:bg-muted'}>Cancel</button>
          <button disabled={busy} onClick={() => call(`/api/admin/applications/${applicationId}/reject`, { reason: reason || undefined })} className={btn + ' bg-red-600 text-white hover:opacity-90'}>
            Confirm reject
          </button>
        </div>
        {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {kind === 'creator' && (
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded-lg border bg-background px-2 py-1 text-xs">
            {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <button
          disabled={busy || pending}
          onClick={() =>
            call(
              `/api/admin/${kind === 'creator' ? 'creators' : 'marketers'}/${userId}/action`,
              kind === 'creator' ? { action: 'approve', tier } : { action: 'approve' }
            )
          }
          className={btn + ' bg-primary text-primary-foreground hover:opacity-90'}
        >
          Approve
        </button>
        <button disabled={busy || pending} onClick={() => setMode('reject')} className={btn + ' border border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400'}>
          Reject
        </button>
      </div>
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
