'use client'

// Write-only secret management for a gateway (superadmin / gateways:secrets).
// Values are POSTed straight to the rotate-secret route and never read back —
// the UI only ever knows whether a secret is set and its last-4 hint.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { maskSecret, secretFields, secretMeta, type Provider } from '@/lib/admin/gateways'

export function SecretRotation({
  gatewayId,
  provider,
  secretRef,
  canRotate,
}: {
  gatewayId: string
  provider: Provider
  secretRef: unknown
  canRotate: boolean
}) {
  const router = useRouter()
  const fields = secretFields(provider)
  const [values, setValues] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">This provider has no secret fields.</p>
  }

  async function rotate(key: string) {
    setErr(null)
    setMsg(null)
    setBusyKey(key)
    try {
      const res = await fetch(`/api/admin/gateways/${gatewayId}/rotate-secret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set', provider, key, value: values[key] }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Rotation failed')
        return
      }
      setValues((v) => ({ ...v, [key]: '' }))
      setMsg(`Updated ${key} (•••• ${json.data?.last4 ?? '????'})`)
      router.refresh()
    } finally {
      setBusyKey(null)
    }
  }

  async function clear(key: string) {
    setErr(null)
    setMsg(null)
    setBusyKey(key)
    try {
      const res = await fetch(`/api/admin/gateways/${gatewayId}/rotate-secret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', key }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Clear failed')
        return
      }
      setMsg(`Cleared ${key}`)
      router.refresh()
    } finally {
      setBusyKey(null)
    }
  }

  const input = 'w-full rounded-lg border bg-background px-3 py-2 text-sm'

  if (!canRotate) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Secret material is superadmin-only. You can see whether each secret is set, but not its value.
        </p>
        <ul className="space-y-1 text-sm">
          {fields.map((f) => {
            const m = secretMeta(secretRef, f.key)
            return (
              <li key={f.key} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span>{f.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{m.set ? maskSecret(m.last4) : 'not set'}</span>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Values are write-only and encrypted at rest. Entering a value rotates it; the previous value is replaced.
      </p>
      {fields.map((f) => {
        const m = secretMeta(secretRef, f.key)
        return (
          <div key={f.key} className="space-y-1.5 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{f.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{m.set ? maskSecret(m.last4) : 'not set'}</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                autoComplete="new-password"
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={m.set ? 'Enter new value to rotate…' : 'Enter value…'}
                className={input}
              />
              <div className="flex gap-2">
                <button
                  disabled={busyKey === f.key || !(values[f.key] ?? '').length}
                  onClick={() => rotate(f.key)}
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {m.set ? 'Rotate' : 'Set'}
                </button>
                {m.set && (
                  <button
                    disabled={busyKey === f.key}
                    onClick={() => clear(f.key)}
                    className="rounded-lg border border-red-500/50 px-3 py-2 text-sm text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
      {msg && <p className="text-sm text-green-600 dark:text-green-400">{msg}</p>}
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
