// components/admin/ui/Toolbar.tsx — server-rendered filter bar + form controls.
import * as React from 'react'
import Link from 'next/link'
import { IconSearch } from '@/components/ui/icons'

/** GET form filter bar. Children are Field / Select / SearchField controls. */
export function FilterBar({
  children,
  action,
  className = '',
}: {
  children: React.ReactNode
  action?: string
  className?: string
}) {
  return (
    <form method="get" action={action} className={`mb-4 flex flex-wrap items-end gap-2.5 ${className}`}>
      {children}
    </form>
  )
}

export function Field({
  label,
  htmlFor,
  children,
  className = '',
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-[0.7rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </label>
      {children}
    </div>
  )
}

export function SearchField({
  name,
  defaultValue,
  placeholder = 'Search…',
  id,
  label = 'Search',
  className = 'w-full sm:w-72',
}: {
  name: string
  defaultValue?: string
  placeholder?: string
  id: string
  label?: string
  className?: string
}) {
  return (
    <Field label={label} htmlFor={id} className={className}>
      <div className="relative">
        <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          id={id}
          type="search"
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="admin-field pl-9"
        />
      </div>
    </Field>
  )
}

export interface Opt { value: string; label: string }

export function SelectField({
  name,
  id,
  label,
  options,
  defaultValue,
  className = 'w-40',
}: {
  name: string
  id: string
  label: string
  options: Opt[]
  defaultValue?: string
  className?: string
}) {
  return (
    <Field label={label} htmlFor={id} className={className}>
      <select id={id} name={name} defaultValue={defaultValue} className="admin-field">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  )
}

export function ApplyButton({ children = 'Apply' }: { children?: React.ReactNode }) {
  return (
    <button type="submit" className="btn btn-primary btn-sm h-[2.375rem] shrink-0">
      {children}
    </button>
  )
}

/** Link-based segmented control (server-safe tabs/filters). */
export function Segmented({
  options,
  active,
}: {
  options: { label: React.ReactNode; href: string; value: string }[]
  active: string
}) {
  return (
    <div className="admin-seg">
      {options.map((o) => (
        <Link key={o.value} href={o.href} data-active={o.value === active}>
          {o.label}
        </Link>
      ))}
    </div>
  )
}
