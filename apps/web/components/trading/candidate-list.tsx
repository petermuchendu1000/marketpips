'use client'

// components/trading/candidate-list.tsx
// ------------------------------------------------------------
// The multiple_choice "candidate board" for the market detail page — the
// Polymarket/Kalshi layout where every option is a self-contained row:
//   avatar · name · one-line subtitle · a bold standalone probability · and a
//   green "Yes ¢" buy affordance.
//
// This is the primary selector for multi-outcome markets. Selecting a row (or
// its Yes pill) is broadcast on the `marketpips:select-option` window event,
// which the sticky order ticket (desktop) and the mobile trade sheet both
// listen for — one source of truth, no duplicated trading logic. The engine is
// unchanged (pick-one LMSR): the row price IS the option's implied probability.
// Independent per-candidate Yes/No books are the documented Phase C follow-up
// (see docs/design/POLYMARKET-KALSHI-PARITY.md).
import { useEffect, useMemo, useRef, useState } from 'react'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { normalizeOutcomes, type Outcome } from '@/lib/markets/outcomes'
import type { Market, MarketOption } from '@/types'
import {
  IconSort,
  IconSearch,
  IconCheck,
  IconTrophy,
  IconArrowRight,
} from '@/components/ui/icons'

type SortKey = 'prob' | 'volume' | 'az'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'prob', label: 'Probability' },
  { key: 'volume', label: 'Volume' },
  { key: 'az', label: 'A–Z' },
]

/** Broadcast the selected candidate so the ticket / mobile sheet can react. */
function emitSelect(marketId: string, optionId: string, openSheet: boolean) {
  window.dispatchEvent(
    new CustomEvent('marketpips:select-option', {
      detail: { marketId, optionId, openSheet },
    }),
  )
}

export function CandidateList({
  market,
  options,
}: {
  market: Market
  options?: MarketOption[]
}) {
  const outcomes = useMemo(() => normalizeOutcomes(market, options), [market, options])
  const kindById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const o of options ?? []) m.set(o.id, o.entity_kind)
    return m
  }, [options])
  const subtitleById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const o of options ?? []) m.set(o.id, o.description)
    return m
  }, [options])

  const resolved = market.status === 'resolved'
  const isOpen = market.status === 'active'

  const [sort, setSort] = useState<SortKey>('prob')
  const [sortMenu, setSortMenu] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string>('')
  const listRef = useRef<HTMLDivElement>(null)

  const showSearch = outcomes.length > 6

  const view = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? outcomes.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (subtitleById.get(o.id) ?? '').toLowerCase().includes(q),
        )
      : outcomes
    const sorted = [...filtered].sort((a, b) => {
      if (sort === 'volume') return b.volumeUsd - a.volumeUsd
      if (sort === 'az') return a.label.localeCompare(b.label)
      return b.price - a.price // prob
    })
    return sorted
  }, [outcomes, query, sort, subtitleById])

  // Default-select the front-runner on mount and align the ticket to it.
  useEffect(() => {
    if (selected || outcomes.length === 0) return
    const fav = [...outcomes].sort((a, b) => b.price - a.price)[0]
    if (fav) {
      setSelected(fav.id)
      emitSelect(market.id, fav.id, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomes])

  const choose = (o: Outcome, openSheet: boolean) => {
    setSelected(o.id)
    emitSelect(market.id, o.id, openSheet)
  }

  // Keyboard: ↑/↓ move selection within the visible order (handled per-radio
  // so the radiogroup container stays non-interactive / a11y-clean).
  const moveSelection = (dir: 1 | -1) => {
    const idx = view.findIndex((o) => o.id === selected)
    const next = dir === 1 ? Math.min(view.length - 1, idx + 1) : Math.max(0, idx - 1)
    const o = view[next]
    if (o) choose(o, false)
  }

  const cents = (p: number) => `${Math.round(p * 100)}\u00A2`

  return (
    <div className="card overflow-hidden p-0">
      {/* Header — count + sort + optional search */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <h2 className="font-display text-sm text-text-primary">
          {outcomes.length} options
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortMenu((v) => !v)}
              className="flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-2 px-2.5 py-1 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary"
              aria-haspopup="listbox"
              aria-expanded={sortMenu}
            >
              <IconSort size={13} />
              {SORTS.find((s) => s.key === sort)!.label}
            </button>
            {sortMenu && (
              <div
                role="listbox"
                className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg"
              >
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    role="option"
                    aria-selected={sort === s.key}
                    onClick={() => {
                      setSort(s.key)
                      setSortMenu(false)
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                      sort === s.key ? 'text-pip-500' : 'text-text-primary'
                    }`}
                  >
                    {s.label}
                    {sort === s.key && <IconCheck size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSearch && (
        <div className="border-b border-hairline px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-pill border border-hairline bg-surface-2 px-3">
            <IconSearch size={14} className="flex-none text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search options"
              aria-label="Search options"
              className="w-full bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
        </div>
      )}

      {/* Candidate rows */}
      <div
        ref={listRef}
        role="radiogroup"
        aria-label="Choose an option"
        className="divide-y divide-hairline"
      >
        {view.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-text-muted">
            No options match “{query}”.
          </p>
        )}
        {view.map((o) => {
          const active = o.id === selected
          const pct = Math.round(o.price * 100)
          const kind = kindById.get(o.id)
          const subtitle = subtitleById.get(o.id)
          const isWinner = o.isWinner === true
          const isLoser = resolved && o.isWinner === false
          return (
            <div
              key={o.id}
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => choose(o, false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  choose(o, false)
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  moveSelection(1)
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  moveSelection(-1)
                }
              }}
              className={`group flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors ${
                active ? 'bg-pip-100' : 'hover:bg-surface-2'
              } ${isLoser ? 'opacity-55' : ''}`}
            >
              <EntityAvatar
                name={o.label}
                imageUrl={o.imageUrl}
                size={40}
                shape={kind === 'person' ? 'circle' : 'squircle'}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold text-text-primary">
                    {o.label}
                  </span>
                  {isWinner && <IconTrophy size={14} className="flex-none text-yes" />}
                </div>
                {subtitle && (
                  <p className="truncate text-xs text-text-muted">{subtitle}</p>
                )}
              </div>

              {/* Standalone probability + Yes buy affordance */}
              <div className="flex flex-none items-center gap-3">
                <span
                  className="font-display text-xl leading-none text-text-primary"
                  aria-label={`${pct} percent`}
                >
                  {pct}%
                </span>
                {isOpen ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      choose(o, true)
                    }}
                    aria-label={`Buy Yes on ${o.label} at ${cents(o.price)}`}
                    className={`flex items-center gap-1 rounded-pill px-3 py-1.5 text-sm font-bold transition-colors ${
                      active
                        ? 'text-white'
                        : 'text-yes hover:brightness-105'
                    }`}
                    style={{
                      background: active ? 'var(--yes)' : 'var(--yes-tint)',
                    }}
                  >
                    Yes {cents(o.price)}
                  </button>
                ) : (
                  <span className="rounded-pill bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text-muted">
                    {isWinner ? 'Won' : isLoser ? 'Lost' : 'Closed'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isOpen && (
        <p className="flex items-center gap-1.5 border-t border-hairline px-4 py-2.5 text-[11px] text-text-muted">
          <IconArrowRight size={12} className="flex-none" />
          Select a candidate to load it in the order ticket. Prices are live LMSR
          probabilities.
        </p>
      )}
    </div>
  )
}
