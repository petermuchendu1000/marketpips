'use client'

// Enable/disable supported currencies and edit exchange rates (→ USD).
// Posts to /api/admin/settings/currencies.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CURRENCIES = ['KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'ETB', 'BIF', 'USD'] as const
type Cur = (typeof CURRENCIES)[number]

export interface RateRow {
  from_currency: Cur
  to_currency: Cur
  rate: number
  source: string | null
  fetched_at: string | null
}

export function CurrencyManager({
  enabled,
  rates,
}: {
  enabled: string[]
  rates: RateRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const rateMap = new Map(rates.map((r) => [r.from_currency, r]))
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {}
    for (const c of CURRENCIES) if (c !== 'USD') d[c] = rateMap.get(c)?.rate != null ? String(rateMap.get(c)!.rate) : ''
    return d
  })
  const enabledSet = new Set(enabled)

  async function post(payload: Record<string, unknown>, tag: string) {
    setErr(null)
    setMsg(null)
    setBusy(tag)
    try {
      const res = await fetch('/api/admin/settings/currencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Update failed')
        return false
      }
      router.refresh()
      return true
    } finally {
      setBusy(null)
    }
  }

  const input = 'w-32 rounded-lg border bg-background px-2 py-1 text-sm'

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-bold">Enabled currencies</h2>
        <div className="flex flex-wrap gap-2">
          {CURRENCIES.map((c) => {
            const on = enabledSet.has(c)
            return (
              <button
                key={c}
                disabled={busy === `en-${c}` || c === 'USD'}
                onClick={() => post({ action: 'set_enabled', currency: c, enabled: !on }, `en-${c}`)}
                className={
                  'rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-60 ' +
                  (on ? 'bg-green-600 text-white' : 'border text-muted-foreground hover:bg-muted')
                }
              >
                {c}{c === 'USD' ? ' (base)' : ''}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold">Exchange rates (→ USD)</h2>
        <div className="table-wrapper overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2">Rate (1 unit = USD)</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {CURRENCIES.filter((c) => c !== 'USD').map((c) => {
                const r = rateMap.get(c)
                return (
                  <tr key={c} className="border-t">
                    <td className="px-3 py-2 font-medium">{c}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="any"
                        value={draft[c] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))}
                        className={input}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r?.source ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r?.fetched_at ? new Date(r.fetched_at).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        disabled={busy === `rate-${c}` || !draft[c] || Number(draft[c]) <= 0}
                        onClick={async () => {
                          const ok = await post({ action: 'upsert_rate', from: c, to: 'USD', rate: Number(draft[c]), source: 'manual' }, `rate-${c}`)
                          if (ok) setMsg(`Saved ${c} → USD`)
                        }}
                        className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {msg && <p className="text-sm text-green-600 dark:text-green-400">{msg}</p>}
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
