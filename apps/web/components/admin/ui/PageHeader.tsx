// components/admin/ui/PageHeader.tsx — consistent page masthead.
import * as React from 'react'
import Link from 'next/link'
import { IconChevronRight } from '@/components/ui/icons'

export interface Crumb { label: string; href?: string }

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  meta,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  crumbs?: Crumb[]
  actions?: React.ReactNode
  meta?: React.ReactNode
}) {
  return (
    <header className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-[var(--text-muted)]">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <IconChevronRight size={12} className="opacity-50" />}
              {c.href ? (
                <Link href={c.href} className="transition-colors hover:text-[var(--text-primary)]">{c.label}</Link>
              ) : (
                <span className="text-[var(--text-secondary)]">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[1.65rem] leading-tight text-[var(--text-primary)]">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{description}</p>
          )}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
