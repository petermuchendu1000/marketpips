'use client'

// Send-now / Cancel controls for a single announcement row. Posts to
// /api/admin/announcements/[id]. Requires announcements:send. "Send" asks for
// confirmation because it dispatches to real users across channels.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50'

export function AnnouncementActions({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const editable = status === 'draft' || status === 'scheduled'

  async function act(action: 'send' | 'cancel') {
    if (action === 'send' && !confirm('Send this announcement now to all matching recipients?')) return
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Action failed')
        return
      }
      start(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  if (!editable) return <span className="text-muted-foreground">—</span>

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <button disabled={busy} onClick={() => act('send')} className={btn + ' bg-primary text-primary-foreground hover:opacity-90'}>
          Send now
        </button>
        <button disabled={busy} onClick={() => act('cancel')} className={btn + ' border bg-background hover:bg-muted'}>
          Cancel
        </button>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}
