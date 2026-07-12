'use client'

// components/trading/pm-ticket.tsx
// ---------------------------------------------------------------------------
// The compact, high-conversion order ticket used on the market detail page when
// `flags.pm_ticket` is on (deploy ≠ release; falls back to the guided/pro panel
// when off). Layout follows the canonical prediction-market ticket:
//
//   [icon] Market title · selected outcome (tinted)
//   Buy | Sell                         Market ▾
//   ┌ Yes 62¢ ┐ ┌ No 38¢ ┐
//   Amount                       KSh 0
//   [+KSh100][+KSh500][+KSh1k][+KSh5k]
//   [           Trade           ]
//   By trading you agree to the Terms.
//
// Every number is produced by the SAME pricing functions the RPC mirrors
// (previewBet / previewOptionBet / previewOptionBinaryBet) so the preview equals
// execution, and orders post to /api/orders with orderTarget() — one source of
// truth shared with the pro panel. Original MarketPips copy + tokens throughout.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useWallets } from '@/hooks/use-wallets'
import { useRates } from '@/hooks/use-rates'
import { createClient } from '@/lib/supabase/client'
import {
  previewBet,
  previewOptionBet,
  previewOptionBinaryBet,
  orderTarget,
  clampLimitCents,
  oppositeSide,
  meetsMinBet,
  MIN_BET_USD,
} from '@/lib/trading'
import { serializePendingBet, parsePendingBet, PENDING_BET_KEY } from '@/lib/pending-bet'
import { normalizeOutcomes, isMultiOutcome, type Outcome } from '@/lib/markets/outcomes'
import { formatCurrency, usdToLocal } from '@/lib/currency'
import { CURRENCIES } from '@/types'
import type { Market, MarketOption } from '@/types'
import { EntityAvatar } from '@/components/ui/entity-avatar'
import { IconCheck, IconChevronDown, IconWallet } from '@/components/ui/icons'

type Side = 'yes' | 'no'
type Action = 'buy' | 'sell'
type OrderType = 'market' | 'limit'

interface PmTicketProps {
  market: Market
  options?: MarketOption[]
  initialSide?: Side
  initialOptionId?: string
  initialAmount?: string
  independent?: boolean
}

const CLOSED_COPY: Partial<Record<Market['status'], { label: string; body: string }>> = {
  pending: { label: 'Pending review', body: 'This market is awaiting approval and is not yet open for trading.' },
  draft: { label: 'Draft', body: 'This market is a draft and is not open for trading.' },
  closed: { label: 'Awaiting resolution', body: 'Trading has closed. This market is awaiting its outcome.' },
  resolved: { label: 'Resolved', body: 'This market has settled. No new positions can be opened.' },
  disputed: { label: 'Under dispute', body: 'The outcome is under review. Trading is paused.' },
  cancelled: { label: 'Cancelled', body: 'This market was cancelled and stakes were refunded.' },
}

export function PmTicket({
  market,
  options,
  initialSide,
  initialOptionId,
  initialAmount,
  independent = false,
}: PmTicketProps) {
  const { user } = useAuth()
  const { wallets, preferredCurrency, refreshWallets, isLoading: walletsLoading } = useWallets()
  const { rates } = useRates()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const isMulti = isMultiOutcome(market, options)
  const indepMulti = isMulti && independent
  const outcomes: Outcome[] = useMemo(() => normalizeOutcomes(market, options), [market, options])

  const [action, setAction] = useState<Action>('buy')
  const [orderType, setOrderType] = useState<OrderType>('market')
  const [typeMenu, setTypeMenu] = useState(false)
  const [side, setSide] = useState<Side>(initialSide ?? 'yes')
  const [selectedOptionId, setSelectedOptionId] = useState<string>(() =>
    isMulti ? initialOptionId ?? outcomes[0]?.id ?? '' : '',
  )
  const [amount, setAmount] = useState(initialAmount ?? '')
  const [limitCents, setLimitCents] = useState('')
  const [touched, setTouched] = useState(!!initialAmount)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{
    label: string
    tone: 'yes' | 'no' | 'brand'
    shares: number
    avgPrice: number
    payoutUsd: number
  } | null>(null)

  // Sell tab: the user's current active holding in this market (buy-only engine,
  // so closing is handed off to Positions). null = not yet loaded.
  const [sellPosition, setSellPosition] = useState<
    { shares: number; side: 'yes' | 'no' | null; currentValueUsd: number; label: string } | null | undefined
  >(undefined)

  const wallet = wallets.find((w) => w.currency === preferredCurrency)
  const balance = wallet?.available_balance ?? 0
  const currencyInfo = CURRENCIES[preferredCurrency]
  const isOpen = market.status === 'active'
  const closedCopy = CLOSED_COPY[market.status]

  const selectedOutcome = isMulti
    ? outcomes.find((o) => o.id === selectedOptionId) ?? outcomes[0]
    : outcomes.find((o) => o.id === side)
  const selYesPrice = selectedOutcome?.yesPrice ?? selectedOutcome?.price ?? 0
  const selNoPrice = selectedOutcome?.noPrice ?? (selectedOutcome ? 1 - selectedOutcome.price : 0)

  // Binary outcome labels (custom labels fall back to Yes/No), used on the
  // solid-fill outcome buttons — mirrors Polymarket's "Yes 47¢ / No 54¢".
  const yesLabel = outcomes.find((o) => o.id === 'yes')?.label ?? 'Yes'
  const noLabel = outcomes.find((o) => o.id === 'no')?.label ?? 'No'

  // Marginal price of the current selection (binary market, independent line, or
  // simplex option) — mirrors the pro panel exactly.
  const currentPrice = isMulti
    ? indepMulti
      ? side === 'yes'
        ? selYesPrice
        : selNoPrice
      : selectedOutcome?.price ?? 0
    : side === 'yes'
      ? market.yes_price
      : market.no_price

  const limitPrice = orderType === 'limit' ? (parseFloat(limitCents) || 0) / 100 : 0
  const amountNum = parseFloat(amount) || 0

  const preview = useMemo(() => {
    if (amountNum <= 0) return null
    try {
      if (isMulti) {
        if (!selectedOutcome) return null
        if (indepMulti) {
          return previewOptionBinaryBet({
            amountLocal: amountNum,
            currency: preferredCurrency,
            optionId: selectedOutcome.id,
            side,
            optionYesPrice: selYesPrice,
            optionNoPrice: selNoPrice,
            liquidityPoolUsd: market.liquidity_pool_usd,
            rates,
            platformFeeRate: market.platform_fee_rate,
            creatorRewardRate: market.creator_reward_rate,
          })
        }
        return previewOptionBet({
          amountLocal: amountNum,
          currency: preferredCurrency,
          optionId: selectedOutcome.id,
          optionPrice: selectedOutcome.price,
          rates,
          platformFeeRate: market.platform_fee_rate,
          creatorRewardRate: market.creator_reward_rate,
        })
      }
      return previewBet({
        amountLocal: amountNum,
        currency: preferredCurrency,
        side,
        yesPrice: market.yes_price,
        noPrice: market.no_price,
        liquidityPoolUsd: market.liquidity_pool_usd,
        rates,
        platformFeeRate: market.platform_fee_rate,
        creatorRewardRate: market.creator_reward_rate,
      })
    } catch {
      return null
    }
  }, [amountNum, preferredCurrency, side, isMulti, indepMulti, selectedOutcome, selYesPrice, selNoPrice, market, rates])

  const previewAvgPrice = preview && 'avgPrice' in preview ? preview.avgPrice : preview?.price ?? currentPrice
  const payoutLocal = preview ? usdToLocal(preview.potentialPayoutUsd, preferredCurrency, rates) : 0

  const belowMin = amountNum > 0 && !meetsMinBet(amountNum, preferredCurrency, rates)
  const overBalance = balance > 0 && amountNum > balance
  const limitInvalid = orderType === 'limit' && (limitPrice <= 0 || limitPrice >= 1)
  const canSubmit =
    isOpen && action === 'buy' && !!selectedOutcome && amountNum > 0 && !belowMin && !overBalance && !limitInvalid && !loading

  // Additive quick-add chips (+$1/+$5/+$20/+$100 equivalents in local currency).
  const chips = useMemo(() => {
    return [1, 5, 10, 100].map((usd) => Math.max(1, Math.round(usdToLocal(usd, preferredCurrency, rates))))
  }, [preferredCurrency, rates])

  // Seed a small default stake so the payout preview shows on first render.
  useEffect(() => {
    if (!touched && !amount && isOpen && chips.length > 0) setAmount(String(chips[0]))
  }, [touched, amount, isOpen, chips])

  // ---- Auth round-trip continuity (shared snapshot with the pro panel) -------
  const restoredRef = useRef(false)
  const [resumePay, setResumePay] = useState(false)
  useEffect(() => {
    if (restoredRef.current || typeof window === 'undefined') return
    if (initialAmount) {
      restoredRef.current = true
      setResumePay(true)
      return
    }
    const pending = parsePendingBet(window.localStorage.getItem(PENDING_BET_KEY), {
      nowMs: Date.now(),
      marketId: market.id,
    })
    if (!pending) return
    restoredRef.current = true
    setTouched(true)
    setSide(pending.side)
    if (pending.optionId && isMulti) setSelectedOptionId(pending.optionId)
    setAmount(String(pending.amount))
    setResumePay(true)
  }, [market.id, isMulti, initialAmount])

  useEffect(() => {
    if (!resumePay || !user || walletsLoading) return
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PENDING_BET_KEY)
      if (amountNum > 0 && balance < amountNum) {
        window.dispatchEvent(new CustomEvent('marketpips:open-deposit'))
      }
    }
    setResumePay(false)
  }, [resumePay, user, walletsLoading, amountNum, balance])

  // Sync selection from the CandidateList board (multi markets).
  useEffect(() => {
    if (!isMulti) return
    const onSelect = (e: Event) => {
      const detail = (e as CustomEvent).detail as { marketId?: string; optionId?: string; side?: Side }
      if (detail?.marketId !== market.id || !detail.optionId) return
      if (outcomes.some((o) => o.id === detail.optionId)) {
        setSelectedOptionId(detail.optionId)
        if (detail.side) setSide(detail.side)
        setError('')
      }
    }
    window.addEventListener('marketpips:select-option', onSelect as EventListener)
    return () => window.removeEventListener('marketpips:select-option', onSelect as EventListener)
  }, [isMulti, market.id, outcomes])

  // Load the user's active holding when they open the Sell tab (once).
  useEffect(() => {
    if (action !== 'sell' || !user || sellPosition !== undefined) return
    let cancelled = false
    supabase
      .from('positions')
      .select('shares, side, current_value_usd, market_option_id')
      .eq('market_id', market.id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('current_value_usd', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (!data || !data.shares) {
          setSellPosition(null)
          return
        }
        const opt = options?.find((o) => o.id === data.market_option_id)
        setSellPosition({
          shares: Number(data.shares),
          side: (data.side as 'yes' | 'no' | null) ?? null,
          currentValueUsd: Number(data.current_value_usd ?? 0),
          label: opt?.label ?? (data.side ? (data.side === 'yes' ? 'Yes' : 'No') : market.title),
        })
      })
    return () => {
      cancelled = true
    }
  }, [action, user, sellPosition, supabase, market.id, market.title, options])

  const cents = (p: number) => `${Math.round(p * 100)}¢`

  const goToAuth = (route: '/auth/login' | '/auth/register') => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        PENDING_BET_KEY,
        serializePendingBet(
          {
            marketId: market.id,
            slug: market.slug,
            side,
            optionId: isMulti ? selectedOutcome?.id : undefined,
            amount: amountNum,
            currency: preferredCurrency,
            independent: indepMulti,
          },
          Date.now(),
        ),
      )
    }
    router.push(`${route}?next=${encodeURIComponent(`/markets/${market.slug}`)}`)
  }

  const handleTrade = async () => {
    if (!user) return goToAuth('/auth/login')
    if (isMulti && !selectedOutcome) return setError('Choose an option to continue.')
    if (amountNum <= 0) return setError('Enter an amount to continue.')
    if (limitInvalid) return setError('Enter a limit price between 1¢ and 99¢.')
    if (belowMin) {
      const minLocal = usdToLocal(MIN_BET_USD, preferredCurrency, rates)
      return setError(`Minimum trade is ${formatCurrency(minLocal, preferredCurrency)}.`)
    }
    if (overBalance) return setError(`Insufficient balance — you have ${formatCurrency(balance, preferredCurrency)}.`)
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market_id: market.id,
          ...orderTarget({ isMulti, independent: indepMulti, optionId: selectedOutcome?.id, side }),
          amount_local: amountNum,
          currency: preferredCurrency,
          order_type: isMulti ? 'market' : orderType,
          ...(!isMulti && orderType === 'limit' ? { limit_price: limitPrice } : {}),
        }),
      })
      const data = await res.json()
      const rpc = data?.data ?? {}
      if (res.ok && (data.success || rpc.order_id)) {
        setReceipt({
          label: isMulti ? (indepMulti ? `${selectedOutcome!.label} · ${side.toUpperCase()}` : selectedOutcome!.label) : side.toUpperCase(),
          tone: isMulti ? (indepMulti ? side : 'brand') : side,
          shares: rpc.shares ?? preview?.shares ?? 0,
          avgPrice: rpc.avg_fill_price ?? rpc.new_price ?? previewAvgPrice,
          payoutUsd: rpc.potential_payout_usd ?? preview?.potentialPayoutUsd ?? 0,
        })
        window.dispatchEvent(new CustomEvent('marketpips:bet-placed', { detail: { marketId: market.id } }))
        await refreshWallets()
        router.refresh()
      } else {
        setError(data.error ?? 'Order failed. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ---- Success receipt ------------------------------------------------------
  if (receipt) {
    const payoutLocalReceipt = usdToLocal(receipt.payoutUsd, preferredCurrency, rates)
    const toneChip =
      receipt.tone === 'yes' ? 'bg-yes/10 text-yes' : receipt.tone === 'no' ? 'bg-no/10 text-no' : 'bg-pip-100 text-pip-500'
    const toneText = receipt.tone === 'yes' ? 'text-yes' : receipt.tone === 'no' ? 'text-no' : 'text-pip-500'
    return (
      <div className="card animate-scale-in p-5 text-center">
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-pill ${toneChip}`}>
          <IconCheck size={26} />
        </div>
        <h3 className="font-display text-lg text-text-primary">Order filled</h3>
        <p className="mb-4 mt-1 text-sm text-text-secondary">
          {formatCurrency(amountNum, preferredCurrency)} on <strong className={toneText}>{receipt.label}</strong>
        </p>
        <dl className="mb-5 space-y-2 rounded-md border border-hairline bg-surface-2 p-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-text-muted">Shares</dt>
            <dd className="font-semibold tabular-nums text-text-primary">{receipt.shares.toFixed(2)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-muted">Avg price</dt>
            <dd className="font-semibold tabular-nums text-text-primary">{cents(receipt.avgPrice)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-text-muted">To win</dt>
            <dd className={`font-semibold tabular-nums ${toneText}`}>{formatCurrency(payoutLocalReceipt, preferredCurrency)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => {
            setReceipt(null)
            setAmount(String(chips[0] ?? ''))
            setTouched(false)
          }}
          className="btn btn-primary w-full"
        >
          Place another trade
        </button>
      </div>
    )
  }

  // ---- Closed / not-open states --------------------------------------------
  if (!isOpen && closedCopy) {
    return (
      <div className="card p-5">
        <p className="mb-1 text-sm font-semibold text-text-primary">{closedCopy.label}</p>
        <p className="text-sm text-text-secondary">{closedCopy.body}</p>
      </div>
    )
  }

  const titleOutcome = isMulti
    ? indepMulti
      ? `${selectedOutcome?.label ?? ''} · ${side === 'yes' ? 'Yes' : 'No'}`
      : selectedOutcome?.label
    : side === 'yes'
      ? 'Yes'
      : 'No'
  const outcomeTone = isMulti && !indepMulti ? 'text-pip-500' : side === 'yes' ? 'text-yes' : 'text-no'

  // Polymarket's action button reads simply "Trade" (the To-win figure lives in
  // the preview summary just above it).
  const tradeLabel = !user ? 'Log in to trade' : 'Trade'

  return (
    <div className="card overflow-hidden">
      {/* Context header: market identity + selected outcome */}
      <div className="flex items-center gap-3 border-b border-hairline p-4">
        <EntityAvatar name={market.title} imageUrl={market.cover_image_url} size={38} shape="squircle" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{market.title}</p>
          <div className="flex items-center gap-1.5">
            <span className={`truncate text-xs font-medium ${outcomeTone}`}>{titleOutcome}</span>
            {isOpen && (!isMulti || indepMulti) && (
              <button
                type="button"
                onClick={() => {
                  setSide(oppositeSide(side))
                  setError('')
                }}
                aria-label={`Switch to ${oppositeSide(side) === 'yes' ? 'Yes' : 'No'}`}
                title={`Switch to ${oppositeSide(side) === 'yes' ? 'Yes' : 'No'}`}
                className="flex-none rounded p-0.5 text-text-muted transition-colors hover:text-text-secondary"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 4 3 8l4 4" />
                  <path d="M3 8h13" />
                  <path d="m17 20 4-4-4-4" />
                  <path d="M21 16H8" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Buy/Sell underline tabs + order-type dropdown (Polymarket header row) */}
        <div className="mb-4 flex items-center justify-between border-b border-hairline">
          <div className="flex items-center gap-5">
            {(['buy', 'sell'] as Action[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAction(a)}
                aria-pressed={action === a}
                className={`relative -mb-px border-b-2 pb-2.5 text-[15px] font-semibold capitalize transition-colors ${
                  action === a
                    ? 'border-text-primary text-text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          {!isMulti && (
            <div className="relative -mb-px pb-2.5">
              <button
                type="button"
                onClick={() => setTypeMenu((v) => !v)}
                className="flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary"
                aria-haspopup="listbox"
                aria-expanded={typeMenu}
              >
                {orderType === 'market' ? 'Market' : 'Limit'}
                <IconChevronDown size={14} className={`transition-transform ${typeMenu ? 'rotate-180' : ''}`} />
              </button>
              {typeMenu && (
                <div className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-md border border-hairline bg-surface-1 shadow-lg" role="listbox">
                  {(['market', 'limit'] as OrderType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="option"
                      aria-selected={orderType === t}
                      onClick={() => {
                        setOrderType(t)
                        setTypeMenu(false)
                      }}
                      className={`block w-full px-3 py-2 text-left text-sm capitalize transition-colors hover:bg-surface-2 ${
                        orderType === t ? 'font-semibold text-text-primary' : 'text-text-secondary'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {action === 'sell' ? (
          <div className="text-sm">
            {sellPosition === undefined ? (
              <div className="space-y-2">
                <div className="h-16 skeleton rounded-md" />
              </div>
            ) : !user ? (
              <p className="rounded-md border border-hairline bg-surface-2 p-4 text-center text-text-secondary">
                Log in to view and close your positions.
              </p>
            ) : sellPosition === null ? (
              <p className="rounded-md border border-hairline bg-surface-2 p-4 text-center text-text-secondary">
                You don’t hold a position in this market yet. Switch to{' '}
                <button type="button" onClick={() => setAction('buy')} className="font-semibold text-pip-500 hover:underline">
                  Buy
                </button>{' '}
                to open one.
              </p>
            ) : (
              <div className="rounded-md border border-hairline bg-surface-2 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-text-muted">Your position</span>
                  <span
                    className={`font-semibold ${
                      sellPosition.side === 'no' ? 'text-no' : sellPosition.side === 'yes' ? 'text-yes' : 'text-pip-500'
                    }`}
                  >
                    {sellPosition.label}
                  </span>
                </div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-text-muted">Shares</span>
                  <span className="font-semibold tabular-nums text-text-primary">{sellPosition.shares.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Current value</span>
                  <span className="font-semibold tabular-nums text-text-primary">
                    {formatCurrency(usdToLocal(sellPosition.currentValueUsd, preferredCurrency, rates), preferredCurrency)}
                  </span>
                </div>
                <a href="/portfolio" className="btn btn-primary mt-4 block w-full py-2.5 text-center">
                  Close in Positions
                </a>
                <p className="mt-2 text-center text-[11px] leading-relaxed text-text-muted">
                  Closing sells your shares back to the market maker at the live price.
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Yes/No ¢ pills (binary + independent multi). Simplex multi shows the
                selected option as a single tinted pill. */}
            {!isMulti || indepMulti ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSide('yes')}
                  aria-pressed={side === 'yes'}
                  className="flex items-center justify-center gap-1.5 rounded-lg py-3 text-[15px] font-semibold transition-colors"
                  style={
                    side === 'yes'
                      ? { background: 'var(--yes)', color: '#fff' }
                      : { background: 'var(--surface-2)', color: 'var(--text-2)' }
                  }
                >
                  <span>{yesLabel}</span>
                  <span className="tabular-nums">{cents(isMulti ? selYesPrice : market.yes_price)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSide('no')}
                  aria-pressed={side === 'no'}
                  className="flex items-center justify-center gap-1.5 rounded-lg py-3 text-[15px] font-semibold transition-colors"
                  style={
                    side === 'no'
                      ? { background: 'var(--no)', color: '#fff' }
                      : { background: 'var(--surface-2)', color: 'var(--text-2)' }
                  }
                >
                  <span>{noLabel}</span>
                  <span className="tabular-nums">{cents(isMulti ? selNoPrice : market.no_price)}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-pressed
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-3 text-[15px] font-semibold text-white transition-colors"
                style={{ background: 'var(--pip-500)' }}
              >
                <span className="truncate">{selectedOutcome?.label}</span>
                <span className="tabular-nums">{cents(currentPrice)}</span>
              </button>
            )}

            {/* Limit price row (binary limit orders only) — Polymarket − ¢ + stepper. */}
            {!isMulti && orderType === 'limit' && (
              <div className="mt-3 flex items-center justify-between rounded-md border border-hairline px-3 py-2">
                <label htmlFor="pm-limit" className="text-sm text-text-secondary">
                  Limit price
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease limit price"
                    onClick={() => setLimitCents(String(clampLimitCents((parseFloat(limitCents) || 0) - 1)))}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-hairline text-text-secondary transition-colors hover:border-pip-400 hover:text-pip-500"
                  >
                    −
                  </button>
                  <div className="flex items-center gap-0.5">
                    <input
                      id="pm-limit"
                      inputMode="numeric"
                      value={limitCents}
                      onChange={(e) => setLimitCents(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                      placeholder="50"
                      className="w-8 bg-transparent text-right text-sm font-semibold tabular-nums text-text-primary outline-none"
                    />
                    <span className="text-sm text-text-muted">¢</span>
                  </div>
                  <button
                    type="button"
                    aria-label="Increase limit price"
                    onClick={() => setLimitCents(String(clampLimitCents((parseFloat(limitCents) || 0) + 1)))}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-hairline text-text-secondary transition-colors hover:border-pip-400 hover:text-pip-500"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Amount label + big live figure (inline editable) — Polymarket's
                oversized "$0" amount display. */}
            <div className="mt-5 flex items-center justify-between">
              <span className="text-base font-medium text-text-secondary">Amount</span>
              <div
                className="flex items-baseline gap-0.5 tabular-nums"
                style={{ color: amountNum > 0 ? 'var(--text)' : 'var(--text-3)' }}
              >
                <span className="text-2xl font-bold">{currencyInfo?.symbol}</span>
                <input
                  aria-label="Trade amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setTouched(true)
                    setAmount(e.target.value.replace(/[^0-9.]/g, ''))
                    setError('')
                  }}
                  placeholder="0"
                  size={Math.max(1, amount.length || 1)}
                  className="max-w-[8rem] bg-transparent text-right text-4xl font-bold tabular-nums outline-none placeholder:text-text-muted"
                  style={{ color: 'inherit', width: `${Math.max(1, amount.length || 1)}ch` }}
                />
              </div>
            </div>

            {/* Additive quick-add chips — right-aligned pills (+1 / +5 / +10 / +100). */}
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setTouched(true)
                    setAmount(String((parseFloat(amount) || 0) + c))
                    setError('')
                  }}
                  className="rounded-pill border border-hairline px-3.5 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:border-pip-400 hover:text-pip-500"
                >
                  +{c >= 1000 ? `${(c / 1000).toFixed(c % 1000 ? 1 : 0)}k` : c}
                </button>
              ))}
            </div>

            {/* Live preview — Polymarket Total / To win summary. */}
            {preview && amountNum > 0 && (
              <div className="mt-4 space-y-1.5 rounded-md bg-surface-2 px-3 py-3 text-sm">
                <div className="flex items-center justify-between text-text-muted">
                  <span>Avg price</span>
                  <span className="tabular-nums">{cents(previewAvgPrice)} · {preview.shares.toFixed(1)} shares</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Total</span>
                  <span className="font-semibold tabular-nums text-text-primary">
                    {formatCurrency(amountNum, preferredCurrency)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-hairline pt-1.5">
                  <span className="text-text-secondary">To win</span>
                  <span className={`text-base font-bold tabular-nums ${outcomeTone}`}>
                    {formatCurrency(payoutLocal, preferredCurrency)}
                  </span>
                </div>
              </div>
            )}

            {error && <p className="mt-3 text-sm font-medium text-no">{error}</p>}

            <button
              type="button"
              onClick={handleTrade}
              disabled={!!user && !canSubmit}
              className="btn btn-primary mt-4 w-full py-3 text-base"
            >
              {loading ? 'Placing…' : tradeLabel}
            </button>

            {/* Balance / terms */}
            {user && (
              <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <IconWallet size={13} /> {formatCurrency(balance, preferredCurrency)} available
                </span>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('marketpips:open-deposit'))}
                  className="font-semibold text-pip-500 hover:underline"
                >
                  Add funds
                </button>
              </div>
            )}
            <p className="mt-3 text-center text-[12px] leading-relaxed text-text-muted">
              By trading, you agree to the{' '}
              <a href="/legal/terms" className="underline hover:text-text-secondary">
                Terms of Use
              </a>
              .
            </p>
          </>
        )}
      </div>
    </div>
  )
}
