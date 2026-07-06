'use client'

// components/auth/password-input.tsx
// Accessible password field with a Show/Hide toggle. A plain text toggle (not a
// mystery icon) is clearer and more trustworthy than an eye glyph — Stripe-style.
import { useId, useState } from 'react'

interface PasswordInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: 'current-password' | 'new-password'
  placeholder?: string
  required?: boolean
  /** aria-describedby target (e.g. a strength meter or hint). */
  describedBy?: string
}

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = 'current-password',
  placeholder = '••••••••',
  required,
  describedBy,
}: PasswordInputProps) {
  const reactId = useId()
  const inputId = id ?? reactId
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={inputId}
        className="input w-full pr-14"
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        aria-describedby={describedBy}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm px-2 py-1 text-xs font-semibold text-text-muted transition-colors hover:text-pip-500"
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
