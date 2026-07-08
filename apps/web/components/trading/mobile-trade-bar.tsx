'use client'

// components/trading/mobile-trade-bar.tsx
// ------------------------------------------------------------
// Mobile-only (lg:hidden) conversion surface for the market detail page.
//
// WHY: on a phone the detail-page grid collapses to one column and the order
// ticket (in the desktop sidebar) stacks BELOW the chart, activity feed and
// comments — off-screen on load. The best trading/checkout products keep the
// primary action pinned in the thumb zone and open a focused, single-task
// bottom sheet for order entry (Kalshi/Polymarket/Robinhood + mobile checkout
// research). This component is that pattern.
//
// It hosts the SAME <BettingPanel/> inside the sheet — one source of truth, no
// duplicated trading logic. The desktop sidebar panel is unchanged.
import { useCallback, useEffect, useRef, useState } from 'react'
import { BettingPanel } from './betting-panel'
import {
  normalizeOutcomes,
  isMultiOutcome,
  favoriteOutcome,
} from '@/lib/markets/outcomes'
import type { Market, MarketOption } from '@/types'
import { IconX, IconArrowRight } from '@/components/ui/icons'

export function MobileTradeBar({
  market,
  options,
}: {
  market: Market
  options?: MarketOption[]
}) {
  const [open, setOpen] = useState(false)
  // The side/option the user tapped in the bar — pre-selected in the sheet so
  // the entry tap captures the real decision (not a hollow "Trade" gateway).
  const [pendingSide, setPendingSide] = useState<'yes' | 'no'>('yes')
  const [pendingOptionId, setPendingOptionId] = useState<string | undefined>(undefined)
  const sheetRef = useRef<HTMLDivElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  const dragStartY = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)

  const isMulti = isMultiOutcome(market, options)
  const outcomes = normalizeOutcomes(market, options)
  const leader = favoriteOutcome(outcomes)
  const cents = (p: number) => `${Math.round(p * 100)}\u00A2`

  const close = useCallback(() => {
    setOpen(false)
    setDragY(0)
  }, [])

  const openWith = (s: 'yes' | 'no') => {
    setPendingSide(s)
    setOpen(true)
  }
  const openWithOption = (id?: string) => {
    setPendingOptionId(id)
    setOpen(true)
  }

  // The candidate board (CandidateList) drives selection via a window event.
  // A tap on a row's "Yes" pill (openSheet) opens the sheet pre-selected; a
  // plain row select just updates the pending option for the next open.
  useEffect(() => {
    const onSelect = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        marketId?: string
        optionId?: string
        openSheet?: boolean
      }
      if (detail?.marketId !== market.id || !detail.optionId) return
      setPendingOptionId(detail.optionId)
      if (detail.openSheet) setOpen(true)
    }
    window.addEventListener('marketpips:select-option', onSelect as EventListener)
    return () => window.removeEventListener('marketpips:select-option', onSelect as EventListener)
  }, [market.id])

  // Open/close side effects: body-scroll lock, focus management, Esc-to-close.
  useEffect(() => {
    if (!open) return
    lastFocused.current = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheetRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      lastFocused.current?.focus?.()
    }
  }, [open, close])

  // Lightweight swipe-down-to-dismiss on the grab handle.
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null) return
    const delta = e.touches[0].clientY - dragStartY.current
    if (delta > 0) setDragY(delta)
  }
  const onTouchEnd = () => {
    if (dragY > 90) close()
    else setDragY(0)
    dragStartY.current = null
  }

  return (
    <>
      {/* Sticky thumb-zone bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-[color:var(--surface-1)]/95 px-4 pt-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {/* Direct-action buttons: the entry tap IS the decision (Buy YES/NO or
            the multiple_choice front-runner), opening the sheet pre-selected. */}
        {isMulti ? (
          <button
            type="button"
            onClick={() => openWithOption(leader?.id)}
            className="btn btn-primary btn-lg w-full"
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            {leader ? (
              <span className="flex w-full items-center justify-center gap-1.5">
                <span className="truncate">Buy {leader.label}</span>
                <span className="flex-none font-mono opacity-80">{Math.round(leader.price * 100)}%</span>
              </span>
            ) : (
              <>Trade <IconArrowRight size={15} /></>
            )}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openWith('yes')}
              className="btn-yes btn-lg"
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              <span className="font-bold">Buy YES</span>
              <span className="ml-1.5 font-mono text-xs opacity-80">{cents(market.yes_price)}</span>
            </button>
            <button
              type="button"
              onClick={() => openWith('no')}
              className="btn-no btn-lg"
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              <span className="font-bold">Buy NO</span>
              <span className="ml-1.5 font-mono text-xs opacity-80">{cents(market.no_price)}</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      {open && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-50 bg-black/50 animate-fade-in"
            onClick={close}
            aria-hidden
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Trade — ${market.title}`}
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-50 animate-slide-up outline-none"
            style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
          >
            <div
              className="mx-auto flex max-h-[88vh] flex-col overflow-hidden rounded-t-2xl border-t border-hairline bg-[color:var(--surface-1)]"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              {/* Header + grab handle (swipe or tap to dismiss) */}
              <div
                className="flex-none px-4 pb-3 pt-2.5"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="mx-auto mb-2.5 block h-1 w-10 rounded-full bg-[color:var(--hairline-strong)]"
                />
                <div className="flex items-center justify-between gap-3">
                  <h2 className="min-w-0 flex-1 truncate font-display text-sm text-text-primary">
                    {market.title}
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close order ticket"
                    className="flex-none rounded-sm p-1 text-text-muted transition-colors hover:text-text-primary"
                  >
                    <IconX size={18} />
                  </button>
                </div>
              </div>

              {/* The single source-of-truth order ticket */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <BettingPanel
                  market={market}
                  options={options}
                  initialSide={pendingSide}
                  initialOptionId={pendingOptionId}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
