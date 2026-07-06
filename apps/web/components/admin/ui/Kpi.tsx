// components/admin/ui/Kpi.tsx — KPI stat cards for dashboard + section summaries.
import * as React from 'react'
import Link from 'next/link'
import { IconArrowUp, IconArrowDown } from '@/components/ui/icons'

export function KpiGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 ${className}`}>{children}</div>
  )
}

export function Kpi({
  label,
  value,
  sub,
  icon,
  tone = 'default',
  delta,
  href,
}: {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ReactNode
  tone?: 'default' | 'attention'
  delta?: { value: string; direction: 'up' | 'down' | 'flat' }
  href?: string
}) {
  const body = (
    <div className={`admin-kpi ${tone === 'attention' ? 'border-amber-500/40' : ''}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[0.7rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
        {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
      </div>
      <div className="admin-kpi-value text-[1.75rem] text-[var(--text-primary)]">{value}</div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta && (
          <span
            className={
              'inline-flex items-center gap-0.5 text-xs font-semibold ' +
              (delta.direction === 'up'
                ? 'text-emerald-600 dark:text-emerald-400'
                : delta.direction === 'down'
                ? 'text-red-600 dark:text-red-400'
                : 'text-[var(--text-muted)]')
            }
          >
            {delta.direction === 'up' && <IconArrowUp size={12} />}
            {delta.direction === 'down' && <IconArrowDown size={12} />}
            {delta.value}
          </span>
        )}
        {sub && <span className="truncate text-xs text-[var(--text-muted)]">{sub}</span>}
      </div>
    </div>
  )
  if (href) return <Link href={href} className="group block focus:outline-none">{body}</Link>
  return body
}
