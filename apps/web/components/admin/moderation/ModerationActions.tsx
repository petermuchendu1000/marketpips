'use client'

// Inline moderation controls for a single report row:
//   • Take down / Restore the reported entity (admin_moderate_content)
//   • Resolve the report: actioned | dismissed | reviewing (admin_resolve_report)
// Posts to /api/admin/moderation/*. Requires moderation:action (enforced server
// side + RLS); the parent page only renders these when the operator holds it.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50'

function useBusy() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function post(url: string, payload: Record<string, unknown>) {
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

export function ReportActions({
  reportId,
  entityType,
  entityId,
  status,
}: {
  reportId: string
  entityType: string
  entityId: string
  status: string
}) {
  const { post, busy, err } = useBusy()
  const resolved = status === 'actioned' || status === 'dismissed'
  const canModerate = entityType === 'market' || entityType === 'comment' || entityType === 'profile'

  async function takeDown() {
    // Take the content down, then mark the report actioned/taken_down.
    const ok = await post('/api/admin/moderation/content', {
      entity_type: entityType,
      entity_id: entityId,
      action: 'take_down',
      reason: 'Report actioned',
    })
    if (ok) await post(`/api/admin/moderation/reports/${reportId}`, { status: 'actioned', resolution: 'taken_down' })
  }
  async function restore() {
    const ok = await post('/api/admin/moderation/content', {
      entity_type: entityType,
      entity_id: entityId,
      action: 'restore',
      reason: 'Content restored',
    })
    if (ok) await post(`/api/admin/moderation/reports/${reportId}`, { status: 'actioned', resolution: 'restored' })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {!resolved && (
          <button
            disabled={busy}
            onClick={() => post(`/api/admin/moderation/reports/${reportId}`, { status: 'reviewing' })}
            className={btn + ' bg-muted text-foreground hover:bg-muted/70'}
          >
            Review
          </button>
        )}
        {canModerate && (
          <button
            disabled={busy}
            onClick={takeDown}
            className={btn + ' bg-red-600 text-white hover:bg-red-700'}
          >
            Take down
          </button>
        )}
        {canModerate && (
          <button
            disabled={busy}
            onClick={restore}
            className={btn + ' bg-emerald-600 text-white hover:bg-emerald-700'}
          >
            Restore
          </button>
        )}
        {!resolved && (
          <button
            disabled={busy}
            onClick={() =>
              post(`/api/admin/moderation/reports/${reportId}`, { status: 'dismissed', resolution: 'no_action' })
            }
            className={btn + ' border bg-background hover:bg-muted'}
          >
            Dismiss
          </button>
        )}
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  )
}
