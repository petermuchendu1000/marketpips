'use client'

// components/trading/betting-panel.tsx
// ------------------------------------------------------------
// Kalshi-style order ticket for the market detail page, wired to our LMSR
// engine. The layout mirrors Kalshi's proven trade flow (BUY/SELL tabs ·
// Dollars/Contracts entry · rounded YES/NO price pills in cents · Market/Limit
// order type · Odds + Max-payout readout · a single high-contrast CTA), but the
// pricing is authoritative to OUR system: previewBet/previewOptionBet mirror the
// matching RPC (place_bet / place_bet_option) so the preview equals execution.
//
// Handles both market shapes from one component:
//   • binary          → YES / NO pills, previewBet (Market or Limit order)
//   • multiple_choice → option pills, previewOptionBet (Market only)
// Pure "Pip" design system: tokens + custom icons, no emoji, no third-party set.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useWallets } from '@/hooks/use-wallets'
import { useRates } from '@/hooks/use-rates'
import { previewBet, previewOptionBet, meetsMinBet, MIN_BET_USD } from '@/lib/trading'
import { normalizeOutcomes, isMultiOutcome, type Outcome } from '@/lib/markets/outcomes'
import { formatCurrency, usdToLocal } from '@/lib/currency'
import { CURRENCIES } from '@/types'
import type { Market, MarketOption } from '@/types'
import {
  IconWallet,
  IconInfo,
  IconArrowRight,
  IconShield,
  IconCheck,
  IconMinus,
  IconPlus,
  IconChevronDown,
  IconCalendar,
} from '@/components/ui/icons'

interface BettingPanelProps {
  market: Market
  /** market_options rows for multiple_choice markets (empty/undefined for binary). */
  options?: MarketOption[]
  /** Pre-select a side on mount (binary) — e.g. the mobile bar's Buy YES/NO. */
  initialSide?: 'yes' | 'no'
  /** Pre-select an option on mount (multiple_choice). */
  initialOptionId?: string
}

type Side = 'yes' | 'no'
type Action = 'buy' | 'sell'
type EntryMode = 'amount' | 'contracts'
type OrderType = 'market' | 'limit'

/** Per-status copy shown when the market is not open for trading. */
const CLOSED_COPY: Partial<Record<Market['status'], { label: string; body: string }>> = {
  pending: { label: 'Pending review', body: 'This market is awaiting approval and is not yet open for trading.' },
  draft: { label: 'Draft', body: 'This market is a draft and is not open for trading.' },
  closed: { label: 'Awaiting resolution', body: 'Trading has closed. This market is awaiting its outcome.' },
  resolved: { label: 'Resolved', body: 'This market has settled. No new positions can be opened.' },
  disputed: { label: 'Under dispute', body: 'The outcome is under review. Trading is paused.' },
  cancelled: { label: 'Cancelled', body: 'This market was cancelled and stakes were refunded.' },
}

// Brand-led categorical palette (shared with the header breakdown / chart).
const OUTCOME_PALETTE = [
  'var(--pip-500)', 'var(--yes)', '#7c6cf0', '#e0973b',
  '#3aa5c2', '#c2557a', '#5b8def', '#9a8c5c',
  '#4bb37b', '#d06a4a', '#8a6cf0', '#b0983a',
]

export function BettingPanel({ market, options, initialSide, initialOptionId }: BettingPanelProps) {
  const { user } = useAuth()
  const { wallets, preferredCurrency, refreshWallets } = useWallets()
  const { rates } = useRates()
  const router = useRouter()

  // Canonical outcome set: [Yes,No] for binary, ranked options for multi.
  const isMulti = isMultiOutcome(market, options)
  const outcomes: Outcome[] = useMemo(
    () => normalizeOutcomes(market, options),
    [market, options],
  )

  const [action, setAction] = useState<Action>('buy')
  const [entryMode, setEntryMode] = useState<EntryMode>('amount')
  const [orderType, setOrderType] = useState<OrderType>('market')
  const [modeMenu, setModeMenu] = useState(false)
  const [side, setSide] = useState<Side>(initialSide ?? 'yes')
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    () => (isMulti ? initialOptionId ?? outcomes[0]?.id ?? '' : ''),
  )
  const [amount, setAmount] = useState('')
  const [contracts, setContracts] = useState('')
  const [limitCents, setLimitCents] = useState('')
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{
    label: string
    tone: 'yes' | 'no' | 'brand'
    shares: number
    avgPrice: number
    payoutUsd: number
  } | null>(null)

  const wallet = wallets.find((w) => w.currency === preferredCurrency)
  const balance = wallet?.available_balance ?? 0
  const currencyInfo = CURRENCIES[preferredCurrency]

  const isOpen = market.status === 'active'
  const closedCopy = CLOSED_COPY[market.status]

  const selectedOutcome = isMulti
    ? outcomes.find((o) => o.id === selectedOptionId) ?? outcomes[0]
    : outcomes.find((o) => o.id === side)
  // Marginal price of the current selection (option price, or yes/no price).
  const currentPrice = isMulti
    ? selectedOutcome?.price ?? 0
    : side === 'yes'
      ? market.yes_price
      : market.no_price

  // Limit price (0–1) used for sizing when an active binary limit order is set.
  const limitPrice = orderType === 'limit' ? (parseFloat(limitCents) || 0) / 100 : 0
  const sizingPrice = orderType === 'limit' && limitPrice > 0 ? limitPrice : currentPrice

  // Resolve the stake (local currency) from whichever entry mode is active.
  // Contracts mode: stake ≈ contracts × price (per-share cost), a faithful
  // Kalshi analogue; the preview then recomputes the true slippage-aware fill.
  const contractsNum = parseFloat(contracts) || 0
  const amountFromContracts = contractsNum > 0 && sizingPrice > 0
    ? usdToLocal(contractsNum * sizingPrice, preferredCurrency, rates)
    : 0
  const amountNum = entryMode === 'contracts' ? amountFromContracts : (parseFloat(amount) || 0)

  // Authoritative, slippage-aware preview (mirrors the matching RPC).
  const preview = useMemo(() => {
    if (amountNum <= 0) return null
    try {
      if (isMulti) {
        if (!selectedOutcome) return null
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
  }, [amountNum, preferredCurrency, side, isMulti, selectedOutcome, market, rates])

  const previewAvgPrice =
    preview && 'avgPrice' in preview ? preview.avgPrice : preview?.price ?? currentPrice
  const payoutLocal = preview ? usdToLocal(preview.potentialPayoutUsd, preferredCurrency, rates) : 0
  const profitLocal = payoutLocal - amountNum
  const profitPct = amountNum > 0 ? (profitLocal / amountNum) * 100 : 0
  const slippagePts = preview ? (previewAvgPrice - currentPrice) * 100 : 0
  const feeLocal = preview ? usdToLocal(preview.feeUsd, preferredCurrency, rates) : 0
  // Implied chance of the selection (limit orders price at the resting limit).
  const impliedChance = Math.round((orderType === 'limit' && limitPrice > 0 ? limitPrice : currentPrice) * 100)

  const belowMin = amountNum > 0 && !meetsMinBet(amountNum, preferredCurrency, rates)
  const overBalance = balance > 0 && amountNum > balance
  const hasSelection = isMulti ? !!selectedOutcome : true
  const limitInvalid = orderType === 'limit' && (limitPrice <= 0 || limitPrice >= 1)
  const canSubmit =
    isOpen && action === 'buy' && hasSelection && amountNum > 0 && !belowMin && !overBalance && !limitInvalid && !loading

  const presets = useMemo(() => {
    if (balance > 0) {
      return [0.1, 0.25, 0.5, 1].map((f) => Math.max(1, Math.floor(balance * f)))
    }
    return [currencyInfo?.minBet ?? 100, 500, 1000, 2000]
  }, [balance, currencyInfo])

  // Seed the smallest preset so the payout preview shows on first render.
  useEffect(() => {
    if (!touched && !amount && entryMode === 'amount' && isOpen && presets.length > 0) {
      setAmount(String(presets[0]))
    }
  }, [touched, amount, entryMode, isOpen, presets])

  const cents = (p: number) => `${Math.round(p * 100)}\u00A2`

  // Human resolution date for the "Max payout" line.
  const resolveDate = useMemo(() => {
    const iso = market.resolves_at ?? market.closes_at
    if (!iso) return null
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }, [market.resolves_at, market.closes_at])

  const handleBet = async () => {
    if (!user) return router.push('/auth/login')
    if (isMulti && !selectedOutcome) return setError('Choose an option to continue.')
    if (amountNum <= 0) return setError('Enter an amount to continue.')
    if (limitInvalid) return setError('Enter a limit price between 1¢ and 99¢.')
    if (belowMin) {
      const minLocal = usdToLocal(MIN_BET_USD, preferredCurrency, rates)
      return setError(`Minimum bet is ${formatCurrency(minLocal, preferredCurrency)}.`)
    }
    if (overBalance) {
      return setError(`Insufficient balance — you have ${formatCurrency(balance, preferredCurrency)}.`)
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market_id: market.id,
          ...(isMulti ? { market_option_id: selectedOutcome!.id } : { side }),
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
          label: isMulti ? selectedOutcome!.label : side.toUpperCase(),
          tone: isMulti ? 'brand' : side,
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
      <div className="card p-5 text-center animate-scale-in">
        <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-pill ${toneChip}`}>
          <IconCheck size={26} />
        </div>
        <h3 className="font-display text-lg text-text-primary">Order filled</h3>
        <p className="mb-4 mt-1 text-sm text-text-secondary">
          {formatCurrency(amountNum, preferredCurrency)} on <strong className={toneText}>{receipt.label}</strong>
        </p>
        <dl className="mb-5 space-y-2 rounded-md border border-hairline bg-surface-2 p-4">
          <div className="flex justify-between text-sm">
            <dt className="text-text-muted">Contracts</dt>
            <dd className="font-mono font-semibold text-text-primary">{receipt.shares.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-text-muted">Avg. fill</dt>
            <dd className="font-mono font-semibold text-text-primary">{cents(receipt.avgPrice)}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-text-muted">Max payout</dt>
            <dd className="font-mono font-bold text-yes">{formatCurrency(payoutLocalReceipt, preferredCurrency)}</dd>
          </div>
        </dl>
        <button onClick={() => { setReceipt(null); setAmount(''); setContracts('') }} className="btn btn-secondary mb-2 w-full">
          Place another order
        </button>
        <button onClick={() => router.push('/portfolio')} className="btn btn-ghost w-full text-sm">
          View portfolio <IconArrowRight size={13} />
        </button>
      </div>
    )
  }

  const sideTone = side === 'yes' ? 'var(--yes)' : 'var(--no)'

  // ---- Order ticket ---------------------------------------------------------
  return (
    <div className="card animate-fade-in overflow-hidden p-0">
      {/* Header: BUY / SELL tabs + Dollars/Contracts mode */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-4" role="tablist" aria-label="Order action">
          {(['buy', 'sell'] as const).map((a) => {
            const active = action === a
            const disabled = a === 'sell' // no sell endpoint yet — honest gate
            return (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => !disabled && setAction(a)}
                title={disabled ? 'Selling positions is coming soon' : undefined}
                className={`relative text-[13px] font-bold uppercase tracking-[0.08em] transition-colors ${
                  active ? 'text-text-primary' : 'text-text-muted'
                } ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:text-text-primary'}`}
              >
                {a}
                {active && (
                  <span className="absolute -bottom-[13px] left-0 h-[2px] w-full rounded-full" style={{ background: 'var(--pip-500)' }} />
                )}
              </button>
            )
          })}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setModeMenu((v) => !v)}
            className="flex items-center gap-1 text-[13px] font-bold uppercase tracking-[0.08em] text-text-secondary hover:text-text-primary"
            aria-haspopup="listbox"
            aria-expanded={modeMenu}
          >
            {entryMode === 'amount' ? preferredCurrency : 'Contracts'}
            <IconChevronDown size={13} />
          </button>
          {modeMenu && (
            <div
              role="listbox"
              className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg"
            >
              {(['amount', 'contracts'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={entryMode === m}
                  onClick={() => { setEntryMode(m); setModeMenu(false); setTouched(true); setError('') }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                    entryMode === m ? 'text-pip-500' : 'text-text-primary'
                  }`}
                >
                  {m === 'amount' ? `${preferredCurrency} amount` : 'Contracts'}
                  {entryMode === m && <IconCheck size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Market question + selected outcome */}
        <p className="text-sm leading-snug text-text-secondary line-clamp-2">{market.title}</p>
        <div className="mb-3 mt-3 flex items-center gap-3">
          {market.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={market.cover_image_url} alt="" className="h-11 w-11 flex-none rounded-lg object-cover" />
          )}
          <span className="truncate font-display text-xl text-text-primary" title={selectedOutcome?.label}>
            {isMulti ? selectedOutcome?.label ?? 'Choose an option' : market.title.length > 40 ? 'Outcome' : market.title}
          </span>
        </div>

        {/* Side / option selector — rounded price pills (Kalshi) */}
        {isMulti ? (
          <fieldset disabled={!isOpen} className="space-y-2">
            <legend className="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-muted">Choose an option</legend>
            {outcomes.map((o, i) => {
              const active = o.id === selectedOptionId
              const pct = Math.round(o.price * 100)
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { setSelectedOptionId(o.id); setError('') }}
                  aria-pressed={active}
                  disabled={!isOpen}
                  className={`flex w-full items-center justify-between gap-3 rounded-pill border px-4 py-2.5 text-left transition-colors ${
                    active ? 'border-pip-400 bg-pip-100' : 'border-hairline bg-surface-2 hover:border-pip-300'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 flex-none rounded-[2px]" style={{ background: OUTCOME_PALETTE[i % OUTCOME_PALETTE.length] }} aria-hidden />
                    <span className={`truncate text-sm font-semibold ${active ? 'text-pip-500' : 'text-text-primary'}`}>{o.label}</span>
                  </span>
                  <span className="flex flex-none items-center gap-2">
                    <span className={`font-mono text-sm font-bold ${active ? 'text-pip-500' : 'text-text-secondary'}`}>{pct}¢</span>
                    {active && <IconCheck size={14} className="text-pip-500" />}
                  </span>
                </button>
              )
            })}
          </fieldset>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSide('yes')}
              aria-pressed={side === 'yes'}
              disabled={!isOpen}
              className="flex h-12 items-center justify-center gap-2 rounded-pill border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: side === 'yes' ? 'var(--yes)' : 'var(--surface-2)',
                color: side === 'yes' ? '#fff' : 'var(--text-primary)',
                borderColor: side === 'yes' ? 'var(--yes)' : 'var(--hairline)',
              }}
            >
              <span className="text-sm font-bold uppercase tracking-wide">Yes</span>
              <span className="font-mono text-sm font-semibold">{cents(market.yes_price)}</span>
            </button>
            <button
              type="button"
              onClick={() => setSide('no')}
              aria-pressed={side === 'no'}
              disabled={!isOpen}
              className="flex h-12 items-center justify-center gap-2 rounded-pill border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: side === 'no' ? 'var(--no)' : 'var(--surface-2)',
                color: side === 'no' ? '#fff' : 'var(--text-primary)',
                borderColor: side === 'no' ? 'var(--no)' : 'var(--hairline)',
              }}
            >
              <span className="text-sm font-bold uppercase tracking-wide">No</span>
              <span className="font-mono text-sm font-semibold">{cents(market.no_price)}</span>
            </button>
          </div>
        )}

        {!isOpen ? (
          <div className="mt-4 rounded-md border border-hairline bg-surface-2 p-4 text-center">
            <p className="text-sm font-semibold text-text-primary">{closedCopy?.label ?? 'Closed'}</p>
            <p className="mt-1 text-xs text-text-muted">{closedCopy?.body ?? 'This market is not open for trading.'}</p>
          </div>
        ) : (
          <>
            {/* Order type: Market / Limit (binary only) */}
            {!isMulti && (
              <div className="mt-4 inline-flex rounded-pill border border-hairline bg-surface-2 p-0.5 text-xs font-semibold">
                {(['market', 'limit'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setOrderType(t); setError('') }}
                    aria-pressed={orderType === t}
                    className={`rounded-pill px-3 py-1 capitalize transition-colors ${
                      orderType === t ? 'bg-surface text-text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* Limit price (binary + limit) */}
            {!isMulti && orderType === 'limit' && (
              <div className="mt-3">
                <label htmlFor="limit-price" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Limit price (¢)
                </label>
                <input
                  id="limit-price"
                  className="input w-full text-right font-mono"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  placeholder={String(Math.round(currentPrice * 100))}
                  value={limitCents}
                  onChange={(e) => { setLimitCents(e.target.value); setError('') }}
                />
              </div>
            )}

            {/* Amount / Contracts entry */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="bet-amount" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {entryMode === 'amount' ? `Amount (${preferredCurrency})` : 'Contracts'}
                </label>
                {entryMode === 'amount' && user && wallet && (
                  <span className="flex items-center gap-1.5 text-xs text-text-muted">
                    <IconWallet size={12} />
                    <span className="font-mono">{formatCurrency(balance, preferredCurrency)}</span>
                  </span>
                )}
              </div>

              {entryMode === 'amount' ? (
                <>
                  <div className="mb-2 grid grid-cols-4 gap-1.5">
                    {presets.map((v) => {
                      const active = amountNum === v
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => { setTouched(true); setAmount(String(v)); setError('') }}
                          className={`rounded-pill border py-1.5 text-xs font-semibold transition-colors ${
                            active ? 'border-pip-400 bg-pip-100 text-pip-500' : 'border-hairline bg-surface-2 text-text-secondary hover:border-pip-300'
                          }`}
                        >
                          {formatCurrency(v, preferredCurrency, { compact: true })}
                        </button>
                      )
                    })}
                  </div>
                  <input
                    id="bet-amount"
                    className="input input-lg w-full text-right"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="0"
                    value={amount}
                    onChange={(e) => { setTouched(true); setAmount(e.target.value); setError('') }}
                  />
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setTouched(true); setContracts(String(Math.max(0, Math.floor(contractsNum - 1)))); setError('') }}
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-pill border border-hairline bg-surface-2 text-text-primary hover:border-pip-300"
                    aria-label="Decrease contracts"
                  >
                    <IconMinus size={16} />
                  </button>
                  <input
                    id="bet-amount"
                    className="input input-lg w-full text-center"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={contracts}
                    onChange={(e) => { setTouched(true); setContracts(e.target.value); setError('') }}
                  />
                  <button
                    type="button"
                    onClick={() => { setTouched(true); setContracts(String(Math.floor(contractsNum + 1))); setError('') }}
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-pill border border-hairline bg-surface-2 text-text-primary hover:border-pip-300"
                    aria-label="Increase contracts"
                  >
                    <IconPlus size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Odds + Max payout readout (Kalshi) */}
            <dl className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-1.5 text-sm text-text-muted">
                  Odds
                  <span title="Implied probability from the current price" className="text-text-muted"><IconInfo size={13} /></span>
                </dt>
                <dd className="text-sm font-semibold text-text-primary">{impliedChance}% chance</dd>
              </div>

              {preview && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <dt className="text-text-muted">{isMulti ? 'Fill price' : orderType === 'limit' ? 'Limit price' : 'Avg. fill'}</dt>
                    <dd className="font-mono text-text-secondary">{cents(orderType === 'limit' && limitPrice > 0 ? limitPrice : previewAvgPrice)}</dd>
                  </div>
                  {!isMulti && orderType === 'market' && (
                    <div className="flex items-center justify-between text-xs">
                      <dt className="text-text-muted">Price impact</dt>
                      <dd className="font-mono text-text-secondary">{slippagePts >= 0 ? '+' : ''}{slippagePts.toFixed(2)} pts</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <dt className="text-text-muted">Est. contracts</dt>
                    <dd className="font-mono text-text-secondary">{preview.shares.toFixed(2)}</dd>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <dt className="text-text-muted">Fee ({(market.platform_fee_rate * 100).toFixed(1)}%)</dt>
                    <dd className="font-mono text-text-secondary">{formatCurrency(feeLocal, preferredCurrency)}</dd>
                  </div>
                </>
              )}

              <div className="border-t border-hairline pt-2.5">
                <div className="flex items-start justify-between">
                  <dt className="text-sm text-text-muted">
                    Max payout
                    {resolveDate && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-text-muted">
                        <IconCalendar size={11} /> {resolveDate}
                      </span>
                    )}
                  </dt>
                  <dd className="text-right">
                    <span className="font-display text-2xl text-yes">{formatCurrency(payoutLocal, preferredCurrency)}</span>
                    {profitPct > 0 && <span className="ml-1 align-top text-xs font-semibold text-yes">+{profitPct.toFixed(0)}%</span>}
                  </dd>
                </div>
              </div>
            </dl>

            {(error || belowMin) && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-no/30 bg-no/10 p-3 text-xs text-no animate-fade-in">
                <IconInfo size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  {error || `Minimum bet is ${formatCurrency(usdToLocal(MIN_BET_USD, preferredCurrency, rates), preferredCurrency)}.`}
                </span>
              </div>
            )}

            {/* CTA */}
            {!user ? (
              <button type="button" className="mt-4 w-full rounded-pill px-4 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90" style={{ background: 'var(--pip-500)' }} onClick={() => router.push('/auth/login')}>
                Sign up to trade
              </button>
            ) : overBalance ? (
              <button type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-pill px-4 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90" style={{ background: 'var(--pip-500)' }} onClick={() => window.dispatchEvent(new CustomEvent('marketpips:open-deposit'))}>
                <IconWallet size={16} /> Add funds to trade
              </button>
            ) : (
              <button
                type="button"
                onClick={handleBet}
                disabled={!canSubmit}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-pill px-4 py-3.5 text-base font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: isMulti ? 'var(--pip-500)' : sideTone }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Placing order
                  </span>
                ) : (
                  <>
                    {isMulti ? (selectedOutcome ? `Buy ${selectedOutcome.label}` : 'Choose an option') : `Buy ${side.toUpperCase()}`}
                    {preview && payoutLocal > 0 && ` · to win ${formatCurrency(payoutLocal, preferredCurrency)}`}
                  </>
                )}
              </button>
            )}

            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-text-muted">
              <IconShield size={12} className="mt-0.5 flex-shrink-0" />
              <span>
                Prices follow LMSR and update live. Your preview equals execution — a {(market.platform_fee_rate * 100).toFixed(1)}% fee applies.
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
