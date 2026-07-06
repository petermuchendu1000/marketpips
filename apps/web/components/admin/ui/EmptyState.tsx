// components/admin/ui/EmptyState.tsx — empty / zero-result state.
import * as React from 'react'

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  compact?: boolean
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-10' : 'py-16'}`}>
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Empty row spanning a table. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-[var(--text-muted)]">
        {children}
      </td>
    </tr>
  )
}
