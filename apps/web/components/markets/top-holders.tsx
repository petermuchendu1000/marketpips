'use client'

// components/markets/top-holders.tsx
// ------------------------------------------------------------
// Polymarket-parity "Top Holders" board (see docs/design/TOP-HOLDERS-DOSSIER.md).
// Board -> Peek -> Profile:
//   - Two mirrored columns (Yes holders | No holders), ranked by shares desc.
//   - Multi-outcome markets get an outcome selector that scopes the whole board
//     to one option's Yes/No book (binary markets skip it).
//   - Each row is a keyboard-focusable link to the trader profile and the
//     trigger for an accessible hover/focus "peek" card (positions/P&L/volume).
//   - A subtle share-of-book bar shows concentration (who dominates the side).
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatVolume, formatUSD } from '@/lib/utils'
import { traderName, joinedMonthYear } from '@/lib/trader'
import { TraderAvatar } from '@/components/ui/trader-avatar'
import type { MarketOption } from '@/types'

interface HolderRow {
  user_id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  joined_at: string | null
  side: 'yes' | 'no'
  shares: number
  current_value_usd: number | null
  share_of_book: number | null
  side_rank: number
}

interface CardStats {
  display_name: string | null
  username: string | null
  avatar_url: string | null
  joined_at: string | null
  positions_value: number
  profit_loss_usd: number
  volume_usd: number
}

// ---- Peek (hover/focus card) ---------------------------------------------
const statsCache = new Map<string, CardStats | null>()

function HolderPeek({ userId, fallbackName }: { userId: string; fallbackName: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [stats, setStats] = useState<CardStats | null | undefined>(statsCache.get(userId))

  useEffect(() => {
    if (stats !== undefined) return
    let alive = true
    supabase
      .rpc('trader_card_stats' as never, { p_user_id: userId } as never)
      .then(({ data }) => {
        const row = (data as CardStats[] | null)?.[0] ?? null
        statsCache.set(userId, row)
        if (alive) setStats(row)
      })
    return () => {
      alive = false
    }
  }, [userId, stats, supabase])

  const name = stats?.display_name || (stats?.username ? `@${stats.username}` : fallbackName)

  return (
    <div
      role="dialog"
      aria-label={`${name} summary`}
      className="animate-fade-in absolute left-0 top-full z-30 mt-2 w-64 rounded-md border border-hairline bg-surface p-3 shadow-e3"
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        <TraderAvatar id={userId} name={name} imageUrl={stats?.avatar_url} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
          <p className="text-xs text-text-muted">
            {stats ? (joinedMonthYear(stats.joined_at) ? `Joined ${joinedMonthYear(stats.joined_at)}` : '') : 'Loading…'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-hairline pt-2.5 text-center">
        <div>
          <p className="tabular-nums text-sm font-bold text-text-primary">
            {stats ? formatVolume(stats.positions_value) : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">Positions</p>
        </div>
        <div>
          <p
            className={`tabular-nums text-sm font-bold ${
              stats && stats.profit_loss_usd < 0 ? 'text-no' : 'text-yes'
            }`}
          >
            {stats
              ? `${stats.profit_loss_usd < 0 ? '−' : ''}${formatVolume(Math.abs(stats.profit_loss_usd))}`
              : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">Profit/Loss</p>
        </div>
        <div>
          <p className="tabular-nums text-sm font-bold text-text-primary">
            {stats ? formatVolume(stats.volume_usd) : '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">Volume</p>
        </div>
      </div>
    </div>
  )
}

// ---- Row ------------------------------------------------------------------
// Polymarket parity: [rank badge over avatar] name / "N shares" (side-tinted).
// The shares value sits UNDER the name (not right-aligned) so the row survives
// the narrow half-width columns on a phone without truncating the count.
function HolderRow({ row, isSelf, rank }: { row: HolderRow; isSelf: boolean; rank: number }) {
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const name = traderName(row, row.user_id)

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), 90)
  }, [])
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(false), 60)
  }, [])

  return (
    <li className="relative">
      {/* Handlers live on this <div> so hover/focus reveal the peek. The real
          interactive element is the profile <a> inside (keyboard + focus), so
          the wrapper's mouse/focus handlers are a progressive enhancement. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className="group flex items-center gap-2.5 rounded-md py-1.5 transition-colors hover:bg-surface-2"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
      >
        {/* Avatar + numbered rank badge (Polymarket's ranked holder list). */}
        <div className="relative flex-none">
          <TraderAvatar id={row.user_id} name={name} imageUrl={row.avatar_url} size={30} />
          <span
            className={`absolute -bottom-1 -right-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white ring-2 ring-surface ${
              row.side === 'no' ? 'bg-no' : 'bg-yes'
            }`}
            aria-hidden
          >
            {rank}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/traders/${row.user_id}`}
              className="truncate text-sm font-medium text-text-primary underline-offset-2 hover:text-pip-text hover:underline focus:outline-none focus-visible:text-pip-text focus-visible:underline"
              aria-describedby={open ? `peek-${row.user_id}` : undefined}
            >
              {name}
            </Link>
            {isSelf && (
              <span className="flex-none rounded-pill bg-pip-100 px-1.5 py-px text-[10px] font-semibold text-pip-text">
                You
              </span>
            )}
          </div>
          <p
            className={`truncate text-xs font-medium tabular-nums ${
              row.side === 'no' ? 'text-no' : 'text-yes'
            }`}
          >
            {Math.round(row.shares).toLocaleString()} shares
          </p>
        </div>
      </div>
      {open && (
        <div id={`peek-${row.user_id}`}>
          <HolderPeek userId={row.user_id} fallbackName={name} />
        </div>
      )}
    </li>
  )
}

// ---- Column ---------------------------------------------------------------
function HolderColumn({
  title,
  rows,
  selfId,
}: {
  title: string
  rows: HolderRow[]
  selfId?: string
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 border-b border-hairline pb-1.5">
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-muted">No holders on this side yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((r, i) => (
            <HolderRow key={r.user_id} row={r} isSelf={r.user_id === selfId} rank={r.side_rank || i + 1} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ---- Board ----------------------------------------------------------------
interface TopHoldersProps {
  marketId: string
  options?: MarketOption[] | null
  resolutionType?: string | null
}

export function TopHolders({ marketId, options, resolutionType }: TopHoldersProps) {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const isMulti = resolutionType === 'multiple_choice' && !!options && options.length > 0
  const sortedOptions = useMemo(
    () => (options ? [...options].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)) : []),
    [options],
  )
  const [optionId, setOptionId] = useState<string | null>(isMulti ? sortedOptions[0]?.id ?? null : null)
  const [rows, setRows] = useState<HolderRow[] | null>(null)

  useEffect(() => {
    let alive = true
    setRows(null)
    supabase
      .rpc('market_top_holders' as never, {
        p_market_id: marketId,
        p_option_id: isMulti ? optionId : null,
        p_limit: 10,
      } as never)
      .then(({ data }) => {
        if (alive) setRows(((data as unknown) as HolderRow[]) || [])
      })
    return () => {
      alive = false
    }
  }, [marketId, optionId, isMulti, supabase])

  const yes = rows?.filter((r) => r.side === 'yes') ?? []
  const no = rows?.filter((r) => r.side === 'no') ?? []
  const empty = rows !== null && yes.length === 0 && no.length === 0

  return (
    <div>
      {isMulti && (
        <div className="mb-4">
          <label htmlFor="holders-outcome" className="sr-only">
            Choose outcome
          </label>
          <div className="relative inline-block">
            <select
              id="holders-outcome"
              value={optionId ?? ''}
              onChange={(e) => setOptionId(e.target.value)}
              className="input appearance-none pr-9 text-sm font-medium"
            >
              {sortedOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      )}

      {rows === null ? (
        <HoldersLoading />
      ) : empty ? (
        <div className="py-8 text-center">
          <p className="text-sm text-text-muted">Be the first to take a side.</p>
          <p className="mt-1 text-xs text-text-muted">
            Holders rank here by shares as soon as traders open positions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-8">
          <HolderColumn title="Yes holders" rows={yes} selfId={user?.id} />
          <HolderColumn title="No holders" rows={no} selfId={user?.id} />
        </div>
      )}

      {!empty && rows !== null && (
        <p className="mt-4 border-t border-hairline pt-3 text-center text-xs text-text-muted">
          Showing top holders by shares · hover a name for a quick summary,{' '}
          <span className="text-text-secondary">click to view their profile</span>.
        </p>
      )}
    </div>
  )
}

function HoldersLoading() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:gap-x-8">
      {[0, 1].map((c) => (
        <div key={c} className="space-y-2">
          <div className="skeleton mb-3 h-4 w-24 rounded" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2.5 py-1.5">
              <div className="skeleton h-[30px] w-[30px] flex-none rounded-full" />
              <div className="skeleton h-3 flex-1 rounded" />
              <div className="skeleton h-3 w-12 rounded" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// Re-export for callers that only need the value formatter type parity.
export { formatUSD }
