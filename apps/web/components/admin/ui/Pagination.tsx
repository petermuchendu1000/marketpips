// components/admin/ui/Pagination.tsx — range summary + prev/next pager.
import * as React from 'react'
import Link from 'next/link'
import { IconChevronLeft, IconChevronRight } from '@/components/ui/icons'

export function Pagination({
  page,
  pageSize,
  total,
  hrefForPage,
}: {
  page: number
  pageSize: number
  total: number
  hrefForPage: (page: number) => string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text-secondary)] tabular-nums">{from.toLocaleString()}–{to.toLocaleString()}</span>{' '}
        of <span className="font-medium text-[var(--text-secondary)] tabular-nums">{total.toLocaleString()}</span>
      </span>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={hrefForPage(page - 1)} className="btn btn-secondary btn-sm gap-1">
            <IconChevronLeft size={14} /> Prev
          </Link>
        ) : (
          <span className="btn btn-secondary btn-sm gap-1 cursor-not-allowed opacity-40"><IconChevronLeft size={14} /> Prev</span>
        )}
        <span className="px-2 text-xs text-[var(--text-muted)]">
          Page <span className="font-medium text-[var(--text-secondary)] tabular-nums">{page}</span> / {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={hrefForPage(page + 1)} className="btn btn-secondary btn-sm gap-1">
            Next <IconChevronRight size={14} />
          </Link>
        ) : (
          <span className="btn btn-secondary btn-sm gap-1 cursor-not-allowed opacity-40">Next <IconChevronRight size={14} /></span>
        )}
      </div>
    </div>
  )
}
