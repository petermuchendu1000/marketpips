'use client'

// components/trading/betting-panel.tsx
// ------------------------------------------------------------
// Order ticket for the market detail page. The live preview is driven by
// `previewBet` (lib/trading), which mirrors the authoritative place_bet RPC —
// so the shares, average fill price, slippage, fees and payout shown here equal
// on-chain execution. Pure "Pip" design system: tokens + custom icons, no
// emoji, no third-party icon set.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useWallets } from '@/hooks/use-wallets'
import { useRates } from '@/hooks/use-rates'
import { previewBet, meetsMinBet, MIN_BET_USD } from '@/lib/trading'
import { formatCurrency, usdToLocal } from '@/lib/currency'
import { CURRENCIES } from '@/types'
import type { Market } from '@/types'
import {
  IconWallet,
  IconInfo,
  IconArrowRight,
  IconShield,
  IconCheck,
} from '@/components/ui/icons'

interface BettingPanelProps {
  market: Market
}

type Side = 'yes' | 'no'

/** Per-status copy shown when the market is not open for trading. */
const CLOSED_COPY: Partial<Record<Market['status'], { label: string; body: string }>> = {
  pending: { label: 'Pending review', body: 'This market is awaiting approval and is not yet open for trading.' },
  draft: { label: 'Draft', body: 'This market is a draft and is not open for trading.' },
  closed: { label: 'Awaiting resolution', body: 'Trading has closed. This market is awaiting its outcome.' },
  resolved: { label: 'Resolved', body: 'This market has settled. No new positions can be opened.' },
  disputed: { label: 'Under dispute', body: 'The outcome is under review. Trading is paused.' },
  cancelled: { label: 'Cancelled', body: 'This market was cancelled and stakes were refunded.' },
}

export function BettingPanel({ market }: BettingPanelProps) {
  const { user } = useAuth()
  const { wallets, preferredCurrency, refreshWallets } = useWallets()
  const { rates } = useRates()
  const router = useRouter()

  const [side, setSide] = useState<Side>('yes')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{
    shares: number
    avgPrice: number
    payoutUsd: number
  } | null>(null)

  const wallet = wallets.find((w) => w.currency === preferredCurrency)
  const balance = wallet?.available_balance ?? 0
  const currencyInfo = CURRENCIES[preferredCurrency]
  const amountNum = parseFloat(amount) || 0

  const isOpen = market.status === 'active'
  const closedCopy = CLOSED_COPY[market.status]

  // Authoritative, slippage-aware preview (mirrors place_bet).
  const preview = useMemo(() => {
    if (amountNum <= 0) return null
    try {
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
  }, [amountNum, preferredCurrency, side, market, rates])

  const currentPrice = side === 'yes' ? market.yes_price : market.no_price
  // Payout / profit in the user's local currency.
  const payoutLocal = preview ? usdToLocal(preview.potentialPayoutUsd, preferredCurrency, rates) : 0
  const profitLocal = payoutLocal - amountNum
  const profitPct = amountNum > 0 ? (profitLocal / amountNum) * 100 : 0
  // Price impact = average fill vs current marginal price (percentage points).
  const slippagePts = preview ? (preview.avgPrice - currentPrice) * 100 : 0
  const feeLocal = preview ? usdToLocal(preview.feeUsd, preferredCurrency, rates) : 0

  const belowMin = amountNum > 0 && !meetsMinBet(amountNum, preferredCurrency, rates)
  const overBalance = balance > 0 && amountNum > balance
  const canSubmit = isOpen && amountNum > 0 && !belowMin && !overBalance && !loading

  const presets = useMemo(() => {
    if (balance > 0) {
      return [0.1, 0.25, 0.5, 1].map((f) => Math.max(1, Math.floor(balance * f)))
    }
    return [currencyInfo?.minBet ?? 100, 500, 1000, 2000]
  }, [balance, currencyInfo])

  const cents = (p: number) => `${Math.round(p * 100)}\u00A2`

  const handleBet = async () => {
    if (!user) return router.push('/auth/login')
    if (amountNum <= 0) return setError('Enter an amount to continue.')
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
          side,
          amount_local: amountNum,
          currency: preferredCurrency,
          order_type: 'market',
        }),
      })
      const data = await res.json()
      // place_bet RPC result is nested under `data.data`.
      const rpc = data?.data ?? {}
      if (res.ok && (data.success || rpc.order_id)) {
        setReceipt({
          shares: rpc.shares ?? preview?.shares ?? 0,
          avgPrice: rpc.avg_fill_price ?? preview?.avgPrice ?? currentPrice,
          payoutUsd: rpc.potential_payout_usd ?? preview?.potentialPayoutUsd ?? 0,
        })
        // Let dependent panels (e.g. live position P&L) refresh.
        window.dispatchEvent(new CustomEvent('marketpips:bet-placed', { detail: { marketId: market.id } }))
        await refreshWallets()
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
    return (
      <div className="card p-5 text-center animate-scale-in">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-pill ${
            side === 'yes' ? 'bg-yes/10 text-yes' : 'bg-no/10 text-no'
          }`}
        >
          <IconCheck size={26} />
        </div>
        <h3 className="font-display text-lg text-text-primary">Bet placed</h3>
        <p className="mb-4 mt-1 text-sm text-text-secondary">
          {formatCurrency(amountNum, preferredCurrency)} on{' '}
          <strong className={side === 'yes' ? 'text-yes' : 'text-no'}>{side.toUpperCase()}</strong>
        </p>

        <dl className="mb-5 space-y-2 rounded-md border border-hairline bg-surface-2 p-4">
          <div className="flex justify-between text-sm">
            <dt className="text-text-muted">Shares</dt>
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

        <button
          onClick={() => {
            setReceipt(null)
            setAmount('')
          }}
          className="btn btn-secondary mb-2 w-full"
        >
          Place another bet
        </button>
        <button onClick={() => router.push('/portfolio')} className="btn btn-ghost w-full text-sm">
          View portfolio <IconArrowRight size={13} />
        </button>
      </div>
    )
  }

  // ---- Order ticket ---------------------------------------------------------
  return (
    <div className="card animate-fade-in p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-sm text-text-primary">Order ticket</h3>
        {user && wallet && (
          <span className="flex items-center gap-1.5 text-xs text-text-muted">
            <IconWallet size={13} />
            <span className="font-mono">{formatCurrency(balance, preferredCurrency)}</span>
          </span>
        )}
      </div>

      {/* YES / NO selector */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSide('yes')}
          className={`btn-yes ${side === 'yes' ? 'active' : ''}`}
          aria-pressed={side === 'yes'}
          disabled={!isOpen}
        >
          <span className="flex flex-col leading-tight">
            <span className="text-base font-bold">YES</span>
            <span className="font-mono text-xs opacity-80">{cents(market.yes_price)}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setSide('no')}
          className={`btn-no ${side === 'no' ? 'active' : ''}`}
          aria-pressed={side === 'no'}
          disabled={!isOpen}
        >
          <span className="flex flex-col leading-tight">
            <span className="text-base font-bold">NO</span>
            <span className="font-mono text-xs opacity-80">{cents(market.no_price)}</span>
          </span>
        </button>
      </div>

      {!isOpen ? (
        <div className="mt-4 rounded-md border border-hairline bg-surface-2 p-4 text-center">
          <p className="text-sm font-semibold text-text-primary">{closedCopy?.label ?? 'Closed'}</p>
          <p className="mt-1 text-xs text-text-muted">
            {closedCopy?.body ?? 'This market is not open for trading.'}
          </p>
        </div>
      ) : (
        <>
          {/* Amount */}
          <div className="mt-4">
            <label
              htmlFor="bet-amount"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              Amount ({preferredCurrency})
            </label>

            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {presets.map((v) => {
                const active = amountNum === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setAmount(String(v))
                      setError('')
                    }}
                    className={`rounded-sm border py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-pip-400 bg-pip-100 text-pip-500'
                        : 'border-hairline bg-surface-2 text-text-secondary hover:border-pip-300'
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
              onChange={(e) => {
                setAmount(e.target.value)
                setError('')
              }}
            />
          </div>

          {/* Live preview — mirrors place_bet */}
          {preview && (
            <dl className="mt-4 space-y-2 rounded-md border border-hairline bg-surface-2 p-3 animate-fade-in">
              <div className="flex justify-between text-xs">
                <dt className="text-text-muted">Est. shares</dt>
                <dd className="font-mono text-text-primary">{preview.shares.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-text-muted">Avg. fill price</dt>
                <dd className="font-mono text-text-primary">{cents(preview.avgPrice)}</dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-text-muted">Price impact</dt>
                <dd className="font-mono text-text-secondary">
                  {slippagePts >= 0 ? '+' : ''}
                  {slippagePts.toFixed(2)} pts
                </dd>
              </div>
              <div className="flex justify-between text-xs">
                <dt className="text-text-muted">Fee ({(market.platform_fee_rate * 100).toFixed(1)}%)</dt>
                <dd className="font-mono text-text-secondary">{formatCurrency(feeLocal, preferredCurrency)}</dd>
              </div>
              <div className="divider" />
              <div className="flex items-baseline justify-between text-sm">
                <dt className="font-semibold text-text-primary">Max payout</dt>
                <dd className={`font-mono font-bold ${side === 'yes' ? 'text-yes' : 'text-no'}`}>
                  {formatCurrency(payoutLocal, preferredCurrency)}
                  {profitPct > 0 && <span className="ml-1 text-xs opacity-70">(+{profitPct.toFixed(0)}%)</span>}
                </dd>
              </div>
            </dl>
          )}

          {(error || belowMin) && (
            <div className="mt-3 flex items-start gap-2 rounded-sm border border-no/30 bg-no/10 p-3 text-xs text-no animate-fade-in">
              <IconInfo size={13} className="mt-0.5 flex-shrink-0" />
              <span>
                {error ||
                  `Minimum bet is ${formatCurrency(usdToLocal(MIN_BET_USD, preferredCurrency, rates), preferredCurrency)}.`}
              </span>
            </div>
          )}

          {user ? (
            <button
              type="button"
              className={`btn btn-lg mt-4 w-full ${side === 'yes' ? 'btn-yes active' : 'btn-no active'}`}
              onClick={handleBet}
              disabled={!canSubmit}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  Placing bet
                </span>
              ) : (
                <>
                  Bet {side.toUpperCase()}
                  {amountNum > 0 && ` \u00B7 ${formatCurrency(amountNum, preferredCurrency)}`}
                </>
              )}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-lg mt-4 w-full" onClick={() => router.push('/auth/login')}>
              Sign in to trade <IconArrowRight size={15} />
            </button>
          )}

          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-text-muted">
            <IconShield size={12} className="mt-0.5 flex-shrink-0" />
            <span>
              Prices follow LMSR and update live. Your preview equals on-chain execution — a{' '}
              {(market.platform_fee_rate * 100).toFixed(1)}% fee applies.
            </span>
          </p>
        </>
      )}
    </div>
  )
}
