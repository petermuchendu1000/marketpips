'use client'

// components/layout/locale-switcher.tsx — UI language selector (Module 17.4).
//
// A native <select> (fully keyboard-operable and screen-reader friendly out of
// the box — WCAG 2.1.1 / 4.1.2) that POSTs to /api/locale and refreshes the
// route so the server re-renders with the new catalog. Rendered in the footer.
import { useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, useTransition, useId } from 'react'
import { LOCALES, LOCALE_LABELS, isAppLocale } from '@/i18n/config'

export function LocaleSwitcher() {
  const active = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const selectId = useId()

  async function onChange(next: string) {
    if (!isAppLocale(next) || next === active) return
    setSaving(true)
    try {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      })
      // Re-render server components with the newly selected catalog.
      startTransition(() => router.refresh())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={selectId} className="sr-only">
        Choose language
      </label>
      <span aria-hidden="true" className="text-[var(--text-secondary)]">
        {/* Globe glyph; label is provided by the associated <label>. */}
        🌐
      </span>
      <select
        id={selectId}
        value={active}
        disabled={saving || pending}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-[13px] text-[var(--text-secondary)] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
      >
        {LOCALES.map((loc) => (
          <option key={loc} value={loc} className="bg-[var(--bg)] text-white">
            {LOCALE_LABELS[loc]}
          </option>
        ))}
      </select>
    </div>
  )
}
