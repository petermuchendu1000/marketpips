'use client'

// Create / edit a gateway's NON-SECRET configuration. Secret fields are handled
// separately by <SecretRotation/> (superadmin). Fields are driven by the
// provider schema so adding a provider field is a one-line change in gateways.ts.
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  GATEWAY_PROVIDERS,
  GATEWAY_ENVIRONMENTS,
  PROVIDER_SCHEMAS,
  nonSecretFields,
  type Provider,
  type GatewayEnv,
} from '@/lib/admin/gateways'

const CURRENCIES = ['', 'KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'ETB', 'BIF', 'USD']

export interface GatewayFormValue {
  id?: string
  provider: Provider
  country_code?: string | null
  currency?: string | null
  label: string
  environment: GatewayEnv
  priority?: number
  config?: Record<string, unknown>
  min_amount?: number | null
  max_amount?: number | null
}

export function GatewayForm({ initial }: { initial?: GatewayFormValue }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const editing = !!initial?.id
  const [provider, setProvider] = useState<Provider>(initial?.provider ?? 'mpesa')
  const [environment, setEnvironment] = useState<GatewayEnv>(initial?.environment ?? 'sandbox')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [country, setCountry] = useState(initial?.country_code ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? '')
  const [priority, setPriority] = useState(String(initial?.priority ?? 100))
  const [minAmount, setMinAmount] = useState(initial?.min_amount != null ? String(initial.min_amount) : '')
  const [maxAmount, setMaxAmount] = useState(initial?.max_amount != null ? String(initial.max_amount) : '')

  const fields = useMemo(() => nonSecretFields(provider), [provider])
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {}
    const src = (initial?.config ?? {}) as Record<string, unknown>
    for (const f of nonSecretFields(initial?.provider ?? 'mpesa')) {
      c[f.key] = typeof src[f.key] === 'string' ? (src[f.key] as string) : ''
    }
    return c
  })

  function setField(k: string, v: string) {
    setConfig((prev) => ({ ...prev, [k]: v }))
  }

  async function submit() {
    setErr(null)
    setBusy(true)
    try {
      const cleanConfig: Record<string, string> = {}
      for (const f of fields) if (config[f.key]) cleanConfig[f.key] = config[f.key]
      const res = await fetch('/api/admin/gateways', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: initial?.id ?? null,
          provider,
          country_code: country || null,
          currency: currency || null,
          label,
          environment,
          priority: Number(priority) || 100,
          config: cleanConfig,
          min_amount: minAmount === '' ? null : Number(minAmount),
          max_amount: maxAmount === '' ? null : Number(maxAmount),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(json.error || 'Save failed')
        return
      }
      const newId = json.data?.id
      start(() => router.push(newId ? `/admin/settings/gateways/${newId}` : '/admin/settings/gateways'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border bg-background px-3 py-2 text-sm'
  const lbl = 'text-xs font-medium text-muted-foreground'

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{PROVIDER_SCHEMAS[provider].note}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={lbl}>Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} disabled={editing} className={input}>
            {GATEWAY_PROVIDERS.map((p) => (
              <option key={p} value={p}>{PROVIDER_SCHEMAS[p].label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={lbl}>Environment</span>
          <select value={environment} onChange={(e) => setEnvironment(e.target.value as GatewayEnv)} className={input}>
            {GATEWAY_ENVIRONMENTS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className={lbl}>Label</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. M-Pesa Kenya (prod)" className={input} />
        </label>
        <label className="space-y-1">
          <span className={lbl}>Country code (blank = global)</span>
          <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))} placeholder="KE" className={input} />
        </label>
        <label className="space-y-1">
          <span className={lbl}>Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={input}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c === '' ? '—' : c}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className={lbl}>Failover priority (lower = first)</span>
          <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className={input} />
        </label>
        <label className="space-y-1">
          <span className={lbl}>Min amount (local)</span>
          <input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className={input} />
        </label>
        <label className="space-y-1">
          <span className={lbl}>Max amount (local)</span>
          <input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className={input} />
        </label>
      </div>

      {fields.length > 0 && (
        <div className="space-y-4 rounded-xl border p-4">
          <h3 className="text-sm font-bold">Configuration (non-secret)</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="space-y-1">
                <span className={lbl}>{f.label}</span>
                <input value={config[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} placeholder={f.placeholder} className={input} />
                {f.help && <span className="block text-[11px] text-muted-foreground">{f.help}</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

      <div className="flex gap-2">
        <button disabled={busy || pending || !label.trim()} onClick={submit} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {editing ? 'Save changes' : 'Create gateway'}
        </button>
        <button onClick={() => router.back()} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
          Cancel
        </button>
      </div>
    </div>
  )
}
