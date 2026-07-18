'use client'

// components/trading/market-drawer.tsx
// ---------------------------------------------------------------------------
// Mobile-only Market drawer — the name-tap target on a multi-outcome board.
//
// PM parity (verified live on polymarket.com/event/world-cup-winner, iPhone 13):
// tapping a candidate's NAME/body opens a bottom drawer showing THAT option's
// market view (a Radix "vaul" drawer: rounded-t-3xl, max-h≈85dvh, a 60×5 grab
// handle, scrollable body) with a SOLID green/red "Yes 58.6¢ / No 41.5¢" bar
// pinned at the bottom. Tapping the Yes/No pills on the row (not the name) skips
// this and opens the compact Trade drawer directly.
//
// Our single-page model shares one market across candidates, so the drawer shows
// the option header (avatar · label · % chance · volume) and the market Rules;
// the price chart + order book are gated on per-option history/book data that is
// not yet plumbed to the client (tracked separately). The bottom bar hands off
// to the Trade drawer (MobileTradeBar) via marketpips:select-option so there is
// ONE trade surface / one source of truth.
import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeOutcomes } from '@/lib/markets/outcomes'
import { MarketRules } from '@/components/markets/market-rules'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { IconChevronLeft, IconCode, IconBookmark, IconLink } from '@/components/ui/icons'
import type { Market, MarketOption } from '@/types'

export function MarketDrawer({
  market,
  options,
}: {
  market: Market
  options?: MarketOption[]
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)

  const outcomes = normalizeOutcomes(market, options)
  const o = outcomes.find((x) => x.id === openId) || null

  const close = useCallback(() => {
    setOpenId(null)
    setDragY(0)
  }, [])

  // Open on an explicit name/body tap broadcast by the board row.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail || {}
      if (d.marketId && d.marketId !== market.id) return
      if (d.optionId) setOpenId(d.optionId as string)
    }
    window.addEventListener('marketpips:open-market', onOpen as EventListener)
    return () => window.removeEventListener('marketpips:open-market', onOpen as EventListener)
  }, [market.id])

  // Body-scroll lock + Esc-to-close while open.
  useEffect(() => {
    if (!openId) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheetRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [openId, close])

  if (!o) return null

  const pct = Math.round(o.price * 100)
  // PM shows a coloured change delta beside "% chance". We only render it from a
  // real value; per-option price history is plumbed in the next slice, so this
  // stays undefined for now (no fabricated movement).
  const changePct: number | undefined = undefined
  const yesCents = `${((o.yesPrice ?? o.price) * 100).toFixed(1)}\u00A2`
  const noCents = `${((o.noPrice ?? 1 - o.price) * 100).toFixed(1)}\u00A2`

  // Hand off to the Trade drawer for this option + side (single trade surface).
  const trade = (side: 'yes' | 'no') => {
    window.dispatchEvent(
      new CustomEvent('marketpips:select-option', {
        detail: { marketId: market.id, optionId: o.id, openSheet: true, side },
      }),
    )
    close()
  }

  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null) return
    const d = e.touches[0].clientY - dragStartY.current
    if (d > 0) setDragY(d)
  }
  const onTouchEnd = () => {
    if (dragY > 90) close()
    else setDragY(0)
    dragStartY.current = null
  }

  return (
    <div className="lg:hidden">
      <div className="fixed inset-0 z-50 bg-black/50 animate-fade-in" onClick={close} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${o.label} — ${market.title}`}
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-3xl border-t border-hairline bg-surface outline-none animate-slide-up"
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        {/* PM header control row: back ‹ (left) + embed/bookmark/share cluster
            (right). Doubles as the swipe-to-dismiss grab zone. PM's market view
            dismisses via the back chevron — there is no centred grab handle. */}
        <div
          className="flex-none px-4 pb-1 pt-3"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={close}
              aria-label="Back"
              className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-text-primary transition-opacity hover:opacity-80"
            >
              <IconChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Embed"
                className="grid h-9 w-9 place-items-center rounded-full text-text-primary transition-colors hover:bg-surface-2"
              >
                <IconCode size={19} />
              </button>
              <button
                type="button"
                aria-label="Bookmark"
                className="grid h-9 w-9 place-items-center rounded-full text-text-primary transition-colors hover:bg-surface-2"
              >
                <IconBookmark size={19} />
              </button>
              <button
                type="button"
                aria-label="Share"
                className="grid h-9 w-9 place-items-center rounded-full text-text-primary transition-colors hover:bg-surface-2"
              >
                <IconLink size={19} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable market view */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {/* Identity: flag/entity avatar + bold title (PM: 40px squircle, ~28px title) */}
          <div className="flex items-center gap-3 pt-1">
            <EntityAvatar name={o.label} imageUrl={o.imageUrl} size={40} shape="squircle" />
            <h2 className="min-w-0 flex-1 truncate text-[28px] font-bold leading-tight text-text-primary">
              {o.label}
            </h2>
          </div>

          {/* Blue "% chance" + green positive-delta (PM: #1452F0 chance, #42C772
              delta). The delta renders only when a real change value is present
              (per-option history is plumbed in the next slice — no fabricated %). */}
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-[30px] font-bold leading-none text-pip-500">
              {pct}% <span className="font-bold">chance</span>
            </span>
            {typeof changePct === 'number' && changePct !== 0 && (
              <span
                className={`text-base font-semibold ${changePct > 0 ? 'text-[#42C772]' : 'text-[#E23939]'}`}
              >
                {changePct > 0 ? '▲' : '▼'} {Math.abs(changePct)}%
              </span>
            )}
          </div>

          {/* Volume — PM shows this in the chart footer; kept here until the
              per-option price chart + timeframe toggles land (next slice). */}
          {o.volumeUsd > 0 && (
            <p className="mt-2 text-sm text-text-muted">
              ${Math.round(o.volumeUsd).toLocaleString('en-US')} Vol.
            </p>
          )}

          <MarketRules
            resolutionCriteria={market.resolution_criteria}
            description={market.description}
            resolutionSource={market.resolution_source}
            createdBy={market.creator?.display_name || market.creator?.username || null}
            closesAt={market.closes_at}
            resolvedAt={market.resolved_at}
            isResolved={market.status === 'resolved'}
          />
        </div>

        {/* Pinned SOLID Yes/No conversion bar (PM). */}
        <div className="border-t border-hairline bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="cta-yes" onClick={() => trade('yes')}>
              <span>Yes</span>
              <span className="font-mono">{yesCents}</span>
            </button>
            <button type="button" className="cta-no" onClick={() => trade('no')}>
              <span>No</span>
              <span className="font-mono">{noCents}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
