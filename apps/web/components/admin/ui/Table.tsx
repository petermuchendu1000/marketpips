// components/admin/ui/Table.tsx — data-dense table primitives + definition list.
import * as React from 'react'
import Link from 'next/link'
import { IconSort } from '@/components/ui/icons'

/** Scrollable card wrapper around a table. */
export function TableCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`admin-panel overflow-hidden ${className}`}>
      <div className="table-wrapper max-h-[calc(100vh-16rem)] overflow-auto">{children}</div>
    </div>
  )
}

export function Table({ children }: { children: React.ReactNode }) {
  return <table className="admin-table">{children}</table>
}

export function Th({
  children,
  num = false,
  sortHref,
  active = false,
  className = '',
}: {
  children?: React.ReactNode
  num?: boolean
  sortHref?: string
  active?: boolean
  className?: string
}) {
  return (
    <th className={`${num ? 'num' : ''} ${className}`}>
      {sortHref ? (
        <Link href={sortHref} className="admin-th-sort" data-active={active}>
          {children}
          <IconSort size={12} className={active ? 'opacity-90' : 'opacity-40'} />
        </Link>
      ) : (
        children
      )}
    </th>
  )
}

export function Td({
  children,
  num = false,
  className = '',
  colSpan,
}: {
  children?: React.ReactNode
  num?: boolean
  className?: string
  colSpan?: number
}) {
  return <td className={`${num ? 'num' : ''} ${className}`} colSpan={colSpan}>{children}</td>
}

/** Two-column definition list for detail pages. */
export function DefinitionList({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <dl className={`admin-dl ${className}`}>{children}</dl>
}

export function Def({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
