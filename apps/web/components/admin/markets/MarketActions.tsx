'use client'

// Client action panel for a single market. Renders only the actions the
// operator is allowed to perform (computed server-side and passed in), each
// posting to /api/admin/markets/[id]/action. Destructive actions require a
// reason; resolve requires an outcome + notes.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export type MarketActionKey =
  | 'approve' | 'reject' | 'close' | 'dispute' | 'resolve' | 'cancel' | 'feature'

export interface AllowedAction {
  key: MarketActionKey
  label: string
  danger?: boolean
}

export function MarketActions({
  marketId,
  actions,
  isFeatured,
  isTrending,
  featuredOrder,
}: {
  marketId: string
  actions: AllowedAction[]
  isFeatured: boolean
  isTrending: boolean
  featuredOrder: number | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [active, setActive] = useState<MarketActionKey | null>(null)
  const [reason, setReason] = useState('')
  const [outcome, setOutcome] = useState<'yes' | 'no'>('yes')
  const [notes, setNotes] = useState('')
  const [feat, setFeat] = useState(isFeatured)
  const [trend, setTrend] = useState(isTrending)
  const [order, setOrder] = useState<string>(featuredOrder != null ? String(featuredOrder) : '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function post(payload: Record<string, unknown>) {
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/markets/${marketId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Action failed')
        return
      }
      setActive(null)
      setReason('')
      setNotes('')
      start(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  const btn =
    'rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.key}
            disabled={busy || pending}
            onClick={() => {
              setErr(null)
              // Simple actions post immediately; others open an inline form.
              if (a.key === 'approve' || a.key === 'close') {
                post({ action: a.key })
              } else {
                setActive(active === a.key ? null : a.key)
              }
            }}
            className={
              btn +
              ' ' +
              (a.danger
                ? 'border border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400'
                : 'border hover:bg-muted')
            }
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Reason-required actions: reject / dispute / cancel */}
      {(active === 'reject' || active === 'dispute' || active === 'cancel') && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <label htmlFor="reason" className="text-sm font-medium capitalize">{active} reason (required)</label>
          <textarea id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="rounded-lg border bg-background px-2 py-1.5 text-sm"
            placeholder="Explain why…"
          />
          <div className="flex justify-end gap-2">
            <button className={btn + ' border hover:bg-muted'} onClick={() => setActive(null)}>Cancel</button>
            <button
              disabled={busy || reason.trim().length < 3}
              onClick={() => post({ action: active, reason })}
              className={btn + ' bg-red-600 text-white hover:opacity-90'}
            >
              Confirm {active}
            </button>
          </div>
        </div>
      )}

      {/* Resolve: outcome + notes */}
      {active === 'resolve' && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <label htmlFor="resolve-outcome" className="text-sm font-medium">Resolve outcome</label>
          <div className="flex gap-2">
            {(['yes', 'no'] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOutcome(o)}
                className={
                  btn +
                  ' ' +
                  (outcome === o ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted')
                }
              >
                {o.toUpperCase()}
              </button>
            ))}
          </div>
          <textarea id="resolve-outcome"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Resolution notes / source (min 10 chars)"
            className="rounded-lg border bg-background px-2 py-1.5 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button className={btn + ' border hover:bg-muted'} onClick={() => setActive(null)}>Cancel</button>
            <button
              disabled={busy || notes.trim().length < 10}
              onClick={() => post({ action: 'resolve', outcome, resolution_notes: notes })}
              className={btn + ' bg-green-600 text-white hover:opacity-90'}
            >
              Resolve &amp; pay out
            </button>
          </div>
        </div>
      )}

      {/* Feature / trend toggles */}
      {active === 'feature' && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={feat} onChange={(e) => setFeat(e.target.checked)} /> Featured
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={trend} onChange={(e) => setTrend(e.target.checked)} /> Trending
          </label>
          <label className="text-sm">
            Featured order
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              disabled={!feat}
              className="ml-2 w-24 rounded-lg border bg-background px-2 py-1 text-sm disabled:opacity-50"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button className={btn + ' border hover:bg-muted'} onClick={() => setActive(null)}>Cancel</button>
            <button
              disabled={busy}
              onClick={() =>
                post({
                  action: 'feature',
                  is_featured: feat,
                  is_trending: trend,
                  featured_order: feat && order !== '' ? Number(order) : null,
                })
              }
              className={btn + ' bg-primary text-primary-foreground hover:opacity-90'}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
