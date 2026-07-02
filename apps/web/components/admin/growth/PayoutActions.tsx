'use client'

// Payout-run controls: create a run, drive the state machine
// (compute/approve/disburse/cancel), and clawback a paid item.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50'

export function PayoutRunCreate({ defaultStart, defaultEnd }: { defaultStart: string; defaultEnd: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [kind, setKind] = useState<'creator' | 'marketer'>('marketer')
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)

  async function submit() {
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, period_start: start, period_end: end }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Failed')
        return
      }
      setOpen(false)
      if (json.data?.id) router.push(`/admin/marketers/payouts/${json.data.id}`)
      else router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className={btn + ' bg-primary px-3 py-2 text-primary-foreground hover:opacity-90'}>+ New payout run</button>
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="text-sm font-semibold">New payout run</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs"><span className="text-muted-foreground">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as 'creator' | 'marketer')} className="rounded-lg border bg-background px-2 py-1.5 text-sm">
            <option value="marketer">Marketer (commission accrual)</option>
            <option value="creator">Creator (reward statement)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs"><span className="text-muted-foreground">Period start</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border bg-background px-2 py-1.5 text-sm" /></label>
        <label className="flex flex-col gap-1 text-xs"><span className="text-muted-foreground">Period end</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-lg border bg-background px-2 py-1.5 text-sm" /></label>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(false)} className={btn + ' border hover:bg-muted'}>Cancel</button>
        <button disabled={busy} onClick={submit} className={btn + ' bg-primary text-primary-foreground hover:opacity-90'}>Create</button>
        {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
      </div>
    </div>
  )
}

export function PayoutRunActions({
  id,
  actions,
}: {
  id: string
  actions: { canCompute: boolean; canApprove: boolean; canDisburse: boolean; canCancel: boolean }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'disburse' | 'cancel' | null>(null)

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/payouts/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Failed')
        return
      }
      setConfirm(null)
      start(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.canCompute && <button disabled={busy || pending} onClick={() => post('compute')} className={btn + ' border hover:bg-muted'}>Compute</button>}
        {actions.canApprove && <button disabled={busy || pending} onClick={() => post('approve')} className={btn + ' bg-violet-600 text-white hover:opacity-90'}>Approve</button>}
        {actions.canDisburse && <button disabled={busy || pending} onClick={() => setConfirm('disburse')} className={btn + ' bg-green-600 text-white hover:opacity-90'}>Disburse</button>}
        {actions.canCancel && <button disabled={busy || pending} onClick={() => setConfirm('cancel')} className={btn + ' border border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400'}>Cancel run</button>}
      </div>
      {confirm === 'disburse' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/5 p-2 text-xs">
          <span>Disburse this run? Marketer wallets will be credited (creator items are statements).</span>
          <button disabled={busy} onClick={() => post('disburse')} className={btn + ' bg-green-600 text-white'}>Confirm</button>
          <button onClick={() => setConfirm(null)} className={btn + ' border'}>Back</button>
        </div>
      )}
      {confirm === 'cancel' && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-2 text-xs">
          <span>Cancel this run and drop its items?</span>
          <button disabled={busy} onClick={() => post('cancel')} className={btn + ' bg-red-600 text-white'}>Confirm</button>
          <button onClick={() => setConfirm(null)} className={btn + ' border'}>Back</button>
        </div>
      )}
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}

export function ClawbackButton({ itemId }: { itemId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState(false)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/payouts/items/${itemId}/clawback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Failed')
        return
      }
      setMode(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!mode) {
    return <button onClick={() => setMode(true)} className={btn + ' border border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400'}>Clawback</button>
  }
  return (
    <div className="flex flex-col items-end gap-1.5">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="w-52 rounded-lg border bg-background px-2 py-1 text-xs" />
      <div className="flex gap-1.5">
        <button onClick={() => setMode(false)} className={btn + ' border hover:bg-muted'}>Cancel</button>
        <button disabled={busy || reason.trim().length < 3} onClick={submit} className={btn + ' bg-red-600 text-white hover:opacity-90'}>Confirm</button>
      </div>
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
