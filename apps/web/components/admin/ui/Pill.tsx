// components/admin/ui/Pill.tsx — status pill with a controlled tone system.
// One primitive powers every status/role/kyc/severity badge in the console so
// colour semantics stay consistent across all 28 pages.
import * as React from 'react'

export type PillTone =
  | 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'slate' | 'neutral'

const TONE: Record<PillTone, string> = {
  green:   'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  red:     'text-red-700 dark:text-red-400 bg-red-500/10 border-red-500/20',
  amber:   'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  blue:    'text-blue-700 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
  violet:  'text-violet-700 dark:text-violet-400 bg-violet-500/10 border-violet-500/20',
  slate:   'text-slate-600 dark:text-slate-300 bg-slate-500/10 border-slate-500/20',
  neutral: 'text-[var(--text-secondary)] bg-[var(--bg-tertiary)] border-transparent',
}

export function Pill({
  tone = 'neutral',
  dot = false,
  children,
  className = '',
}: {
  tone?: PillTone
  dot?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={`admin-pill ${TONE[tone]} ${className}`}>
      {dot && <span className="dot" aria-hidden />}
      {children}
    </span>
  )
}

/** Map an arbitrary status string to a tone using a lookup, with a default. */
export function toneFor(
  value: string | null | undefined,
  map: Record<string, PillTone>,
  fallback: PillTone = 'neutral',
): PillTone {
  if (!value) return fallback
  return map[value] ?? fallback
}
