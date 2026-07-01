'use client'

// Inline withdrawal operations for a row: approve / reject / complete / retry.
// Available actions depend on the withdrawal status (passed in). All post to
// /api/admin/finance/withdrawals/[id]/action.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function WithdrawalActions({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mode, setMode] = useState<'reject' | 'complete' | null>(null)
  const [reason, setReason] = useState('')
  const [ref, setRef] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function post(payload: Record<string, unknown>) {
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/finance/withdrawals/${id}/action`, {
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
      setReason('')
      setRef('')
      start(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50'
  const isTerminal = status === 'completed' || status === 'refunded'
  const canRetry = status === 'failed'

  if (isTerminal) return <span className="text-xs text-muted-foreground">—</span>

  return (
    <div className="flex flex-col items-end gap-1.5">
      {mode === null ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {!canRetry && (
            <button disabled={busy || pending} onClick={() => post({ action: 'approve' })} className={btn + ' border hover:bg-muted'}>
              Approve
            </button>
          )}
          {!canRetry && (
            <button disabled={busy || pending} onClick={() => setMode('complete')} className={btn + ' bg-green-600 text-white hover:opacity-90'}>
              Complete
            </button>
          )}
          {!canRetry && (
            <button disabled={busy || pending} onClick={() => setMode('reject')} className={btn + ' border border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400'}>
              Reject
            </button>
          )}
          {canRetry && (
            <button disabled={busy || pending} onClick={() => post({ action: 'retry' })} className={btn + ' bg-primary text-primary-foreground hover:opacity-90'}>
              Retry
            </button>
          )}
        </div>
      ) : mode === 'reject' ? (
        <div className="flex flex-col items-end gap-1.5">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="w-56 rounded-lg border bg-background px-2 py-1 text-xs" />
          <div className="flex gap-1.5">
            <button onClick={() => setMode(null)} className={btn + ' border hover:bg-muted'}>Cancel</button>
            <button disabled={busy || reason.trim().length < 3} onClick={() => post({ action: 'reject', reason })} className={btn + ' bg-red-600 text-white hover:opacity-90'}>
              Confirm reject &amp; refund
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-1.5">
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Provider reference (optional)" className="w-56 rounded-lg border bg-background px-2 py-1 text-xs" />
          <div className="flex gap-1.5">
            <button onClick={() => setMode(null)} className={btn + ' border hover:bg-muted'}>Cancel</button>
            <button disabled={busy} onClick={() => post({ action: 'complete', provider_reference: ref || undefined })} className={btn + ' bg-green-600 text-white hover:opacity-90'}>
              Mark completed
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
