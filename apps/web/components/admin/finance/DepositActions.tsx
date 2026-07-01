'use client'

// Inline deposit reconciliation: fail/cancel a stuck deposit (safe, no money
// moves). Only shown for non-terminal deposits.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function DepositActions({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'completed' || status === 'failed' || status === 'refunded') {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  async function fail() {
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/finance/deposits/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fail', reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Action failed')
        return
      }
      setOpen(false)
      setReason('')
      start(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50'
  return (
    <div className="flex flex-col items-end gap-1.5">
      {!open ? (
        <button disabled={busy || pending} onClick={() => setOpen(true)} className={btn + ' border border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400'}>
          Cancel deposit
        </button>
      ) : (
        <div className="flex flex-col items-end gap-1.5">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="w-56 rounded-lg border bg-background px-2 py-1 text-xs" />
          <div className="flex gap-1.5">
            <button onClick={() => setOpen(false)} className={btn + ' border hover:bg-muted'}>Cancel</button>
            <button disabled={busy || reason.trim().length < 3} onClick={fail} className={btn + ' bg-red-600 text-white hover:opacity-90'}>
              Confirm
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
