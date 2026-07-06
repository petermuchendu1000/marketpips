'use client'

// Notification delivery preferences — Pip system. In-app is always on; users
// opt into Email / SMS / Push. Reads and persists via
// /api/notifications/preferences with optimistic updates + revert on error.
import { useEffect, useState } from 'react'
import { IconMail, IconPhone, IconBell, IconWarning } from '@/components/ui/icons'

type Prefs = {
  email_notifications: boolean
  sms_notifications: boolean
  push_notifications: boolean
}

const ROWS: { key: keyof Prefs; label: string; hint: string; Icon: typeof IconMail; disabled?: boolean }[] = [
  { key: 'email_notifications', label: 'Email', hint: 'Deposits, withdrawals, KYC & announcements', Icon: IconMail },
  { key: 'sms_notifications', label: 'SMS', hint: 'Critical money & account alerts', Icon: IconPhone },
  { key: 'push_notifications', label: 'Push', hint: 'Browser & device push (coming soon)', Icon: IconBell, disabled: true },
]

/** Accessible Pip switch (role="switch"). */
function Switch({
  checked,
  onChange,
  disabled,
  busy,
  label,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  busy?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={onChange}
      className="relative inline-flex shrink-0 items-center rounded-pill transition-colors"
      style={{
        width: 40,
        height: 24,
        padding: 2,
        background: checked ? 'var(--pip-500)' : 'var(--hairline-strong)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span
        className="rounded-full bg-white transition-transform"
        style={{
          width: 20,
          height: 20,
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          boxShadow: 'var(--e1)',
        }}
      />
    </button>
  )
}

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
    const previous = prefs
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
        setPrefs(previous)
      } else if (j.preferences) {
        setPrefs(j.preferences)
      }
    } catch {
      setErr('Could not save')
      setPrefs(previous)
    } finally {
      setSaving(null)
    }
  }

  if (!prefs) {
    return <div className="skeleton h-40 rounded-md" />
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Delivery preferences
        </h2>
      </div>
      <p className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        In-app notifications are always on. Choose which extra channels you&apos;d like.
      </p>

      <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
        {/* Always-on in-app row */}
        <div className="flex items-center justify-between gap-3 pb-3">
          <span className="flex items-center gap-3">
            <span className="stat-chip-icon" aria-hidden="true">
              <IconBell size={16} />
            </span>
            <span>
              <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                In-app
              </span>
              <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                Everything, in your notification feed
              </span>
            </span>
          </span>
          <span className="badge badge-green">Always on</span>
        </div>

        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 py-3 last:pb-0">
            <span className="flex items-center gap-3">
              <span className="stat-chip-icon" aria-hidden="true">
                <r.Icon size={16} />
              </span>
              <span>
                <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {r.label}
                </span>
                <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                  {r.hint}
                </span>
              </span>
            </span>
            <Switch
              label={`${r.label} notifications`}
              checked={prefs[r.key]}
              disabled={r.disabled}
              busy={saving === r.key}
              onChange={() => toggle(r.key)}
            />
          </div>
        ))}
      </div>

      {err && (
        <p className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--no-700)' }} role="alert">
          <IconWarning size={13} /> {err}
        </p>
      )}
    </div>
  )
}
