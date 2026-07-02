'use client'

// Grouped platform-settings editor. Renders typed inputs from the schema and
// bulk-saves changed keys to PUT /api/admin/settings.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ResolvedSetting } from '@/lib/admin/settings'

export function SettingsForm({ groups }: { groups: Record<string, ResolvedSetting[]> }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const initial: Record<string, string | boolean> = {}
  for (const list of Object.values(groups)) {
    for (const s of list) initial[s.key] = s.type === 'boolean' ? Boolean(s.value) : String(s.value)
  }
  const [vals, setVals] = useState<Record<string, string | boolean>>(initial)

  function set(key: string, v: string | boolean) {
    setVals((prev) => ({ ...prev, [key]: v }))
  }

  async function save() {
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      const updates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(vals)) if (v !== initial[k]) updates[k] = v
      if (Object.keys(updates).length === 0) {
        setMsg('No changes to save.')
        return
      }
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const failed = (json.results ?? []).filter((r: { ok: boolean }) => !r.ok)
        setErr(failed.length ? failed.map((f: { key: string; error: string }) => `${f.key}: ${f.error}`).join('; ') : json.error || 'Save failed')
        return
      }
      setMsg(`Saved ${Object.keys(updates).length} setting(s).`)
      start(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border bg-background px-3 py-2 text-sm'

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([group, list]) => (
        <section key={group} className="rounded-xl border p-4">
          <h2 className="mb-4 text-sm font-bold">{group}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {list.map((s) => (
              <div key={s.key} className="space-y-1">
                <label className="flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
                  <span>{s.label}</span>
                  {s.isPublic && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">public</span>}
                </label>
                {s.type === 'boolean' ? (
                  <button
                    type="button"
                    onClick={() => set(s.key, !vals[s.key])}
                    className={
                      'inline-flex h-6 w-11 items-center rounded-full transition ' +
                      (vals[s.key] ? 'bg-primary' : 'bg-muted')
                    }
                    aria-pressed={Boolean(vals[s.key])}
                  >
                    <span className={'ml-0.5 h-5 w-5 rounded-full bg-white transition ' + (vals[s.key] ? 'translate-x-5' : '')} />
                  </button>
                ) : s.type === 'number' || s.type === 'percent' ? (
                  <input
                    type="number"
                    step="any"
                    value={String(vals[s.key] ?? '')}
                    onChange={(e) => set(s.key, e.target.value)}
                    className={input}
                  />
                ) : s.type === 'text' ? (
                  <textarea value={String(vals[s.key] ?? '')} onChange={(e) => set(s.key, e.target.value)} rows={2} className={input} />
                ) : (
                  <input value={String(vals[s.key] ?? '')} onChange={(e) => set(s.key, e.target.value)} className={input} />
                )}
                {s.help && <p className="text-[11px] text-muted-foreground">{s.help}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {msg && <p className="text-sm text-green-600 dark:text-green-400">{msg}</p>}
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

      <div className="sticky bottom-0 flex gap-2 border-t bg-background/80 py-3 backdrop-blur">
        <button disabled={busy || pending} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          Save settings
        </button>
      </div>
    </div>
  )
}
