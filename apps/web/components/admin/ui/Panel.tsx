// components/admin/ui/Panel.tsx — bordered surface with optional header.
import * as React from 'react'

export function Panel({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: React.ReactNode
  className?: string
  as?: 'section' | 'div' | 'article'
}) {
  return <Tag className={`admin-panel ${className}`}>{children}</Tag>
}

export function PanelHead({
  title,
  description,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="admin-panel-head">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function PanelBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-5 ${className}`}>{children}</div>
}
