'use client'

// Notification delivery preferences: toggle in-app-only vs. also email / SMS.
// Reads and persists via /api/notifications/preferences. In-app is always on.
import { useEffect, useState } from 'react'

type Prefs = {
  email_notifications: boolean
  sms_notifications: boolean
  push_notifications: boolean
}

const ROWS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: 'email_notifications', label: 'Email', hint: 'Deposits, withdrawals, KYC & announcements' },
  { key: 'sms_notifications', label: 'SMS', hint: 'Critical money & account alerts' },
  { key: 'push_notifications', label: 'Push', hint: 'Browser/device push (coming soon)' },
]

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/notifications/preferences')
      .then((r) => r.json())
      .then((j) => j.preferences && setPrefs(j.preferences))
      .catch(() => {})
  }, [])

  async function toggle(key: keyof Prefs) {
    if (!prefs) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setSaving(key)
    setErr(null)
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next[key] }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(j.error || 'Could not save')
        setPrefs(prefs) // revert
      } else if (j.preferences) {
        setPrefs(j.preferences)
      }
    } finally {
      setSaving(null)
    }
  }

  if (!prefs) return null

  return (
    <div className="card bg-base-200 mb-6">
      <div className="card-body py-4 px-4">
        <h2 className="text-sm font-semibold mb-1">Delivery preferences</h2>
        <p className="text-xs text-base-content/60 mb-3">In-app notifications are always on. Choose extra channels:</p>
        <div className="space-y-2">
          {ROWS.map((r) => (
            <label key={r.key} className="flex items-center justify-between gap-3 cursor-pointer">
              <span>
                <span className="text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-base-content/50">{r.hint}</span>
              </span>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={prefs[r.key]}
                disabled={saving === r.key}
                onChange={() => toggle(r.key)}
              />
            </label>
          ))}
        </div>
        {err && <p className="text-xs text-error mt-2">{err}</p>}
      </div>
    </div>
  )
}
