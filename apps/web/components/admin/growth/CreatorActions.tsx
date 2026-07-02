'use client'

// Inline creator lifecycle controls: approve (from applications), suspend,
// reactivate, revoke, and edit tier / auto-publish. Posts to
// /api/admin/creators/[id]/action.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50'

function useAction(id: string) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function post(payload: Record<string, unknown>) {
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/creators/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Action failed')
        return false
      }
      start(() => router.refresh())
      return true
    } finally {
      setBusy(false)
    }
  }
  return { post, busy: busy || pending, err }
}

export function CreatorApprove({ userId, tiers }: { userId: string; tiers: string[] }) {
  const { post, busy, err } = useAction(userId)
  const [tier, setTier] = useState(tiers[0] ?? 'bronze')
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded-lg border bg-background px-2 py-1 text-xs">
          {tiers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button disabled={busy} onClick={() => post({ action: 'approve', tier })} className={btn + ' bg-primary text-primary-foreground hover:opacity-90'}>
          Approve
        </button>
      </div>
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}

export function CreatorStatusActions({ userId, status }: { userId: string; status: string }) {
  const { post, busy, err } = useAction(userId)
  const [mode, setMode] = useState<'suspend' | 'revoke' | null>(null)
  const [reason, setReason] = useState('')

  if (mode) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="w-52 rounded-lg border bg-background px-2 py-1 text-xs" />
        <div className="flex gap-1.5">
          <button onClick={() => setMode(null)} className={btn + ' border hover:bg-muted'}>Cancel</button>
          <button
            disabled={busy}
            onClick={async () => {
              const ok = await post({ action: 'set_status', status: mode === 'suspend' ? 'suspended' : 'revoked', reason: reason || undefined })
              if (ok) setMode(null)
            }}
            className={btn + ' bg-red-600 text-white hover:opacity-90'}
          >
            Confirm {mode}
          </button>
        </div>
        {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {status !== 'active' && (
          <button disabled={busy} onClick={() => post({ action: 'set_status', status: 'active' })} className={btn + ' border hover:bg-muted'}>
            Reactivate
          </button>
        )}
        {status === 'active' && (
          <button disabled={busy} onClick={() => setMode('suspend')} className={btn + ' border border-amber-500/50 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400'}>
            Suspend
          </button>
        )}
        {status !== 'revoked' && (
          <button disabled={busy} onClick={() => setMode('revoke')} className={btn + ' border border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400'}>
            Revoke
          </button>
        )}
      </div>
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}

export function CreatorEditForm({
  userId,
  tiers,
  current,
}: {
  userId: string
  tiers: string[]
  current: { tier: string; auto_publish: boolean; reward_pct: number | null; max_open_markets: number | null }
}) {
  const { post, busy, err } = useAction(userId)
  const [tier, setTier] = useState(current.tier)
  const [autoPublish, setAutoPublish] = useState(current.auto_publish)
  const [reward, setReward] = useState(current.reward_pct != null ? String(current.reward_pct) : '')
  const [maxOpen, setMaxOpen] = useState(current.max_open_markets != null ? String(current.max_open_markets) : '')

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <h3 className="text-sm font-semibold">Tier &amp; privileges</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Tier</span>
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded-lg border bg-background px-2 py-1.5 text-sm">
            {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Reward override (fraction, blank = tier default)</span>
          <input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="e.g. 0.0035" className="rounded-lg border bg-background px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Max open markets (blank = tier default)</span>
          <input value={maxOpen} onChange={(e) => setMaxOpen(e.target.value)} placeholder="e.g. 20" className="rounded-lg border bg-background px-2 py-1.5 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />
          Auto-publish markets (skip review)
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          disabled={busy}
          onClick={() =>
            post({
              action: 'update',
              tier,
              auto_publish: autoPublish,
              reward_pct: reward.trim() === '' ? null : Number(reward),
              max_open_markets: maxOpen.trim() === '' ? null : Number(maxOpen),
            })
          }
          className={btn + ' bg-primary text-primary-foreground hover:opacity-90'}
        >
          Save changes
        </button>
        {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
      </div>
    </div>
  )
}
