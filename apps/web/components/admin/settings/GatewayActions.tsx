'use client'

// Row-level gateway operations: test connection, enable/disable, delete.
// `canWrite` gates mutating actions (gateways:write); everyone with the page
// (gateways:read) can run a connection test.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function GatewayActions({
  id,
  enabled,
  canWrite,
}: {
  id: string
  enabled: boolean
  canWrite: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-50'

  async function action(action: 'enable' | 'disable' | 'delete') {
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/gateways/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Action failed')
        return
      }
      if (action === 'delete') {
        start(() => router.push('/admin/settings/gateways'))
        return
      }
      start(() => router.refresh())
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  async function test() {
    setErr(null)
    setMsg('Testing…')
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/gateways/${id}/test`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Test failed')
        setMsg(null)
        return
      }
      setMsg(`${json.ok ? '✓ healthy' : '✗ failing'} · ${json.latencyMs}ms · ${json.detail}`)
      start(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        <button disabled={busy || pending} onClick={test} className={btn + ' border hover:bg-muted'}>
          Test
        </button>
        {canWrite && (
          <button
            disabled={busy || pending}
            onClick={() => action(enabled ? 'disable' : 'enable')}
            className={btn + (enabled ? ' border hover:bg-muted' : ' bg-green-600 text-white hover:opacity-90')}
          >
            {enabled ? 'Disable' : 'Enable'}
          </button>
        )}
        {canWrite &&
          (confirmDelete ? (
            <>
              <button disabled={busy} onClick={() => action('delete')} className={btn + ' bg-red-600 text-white hover:opacity-90'}>
                Confirm delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className={btn + ' border hover:bg-muted'}>
                Cancel
              </button>
            </>
          ) : (
            <button disabled={busy || pending} onClick={() => setConfirmDelete(true)} className={btn + ' border border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400'}>
              Delete
            </button>
          ))}
      </div>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
