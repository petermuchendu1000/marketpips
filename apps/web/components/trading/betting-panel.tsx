'use client'

// components/trading/betting-panel.tsx
import { useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Loader2, TrendingUp, TrendingDown, Info } from 'lucide-react'
import type { Market, CurrencyCode } from '@/types'
import { CURRENCIES } from '@/types'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { useWallets } from '@/hooks/use-wallets'

interface BettingPanelProps {
  market: Market
}

export function BettingPanel({ market }: BettingPanelProps) {
  const router = useRouter()
  const { user } = useAuth()
  const { wallets, preferredCurrency } = useWallets()

  const [side, setSide] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>(preferredCurrency || 'KES')
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isClosed = market.status !== 'active' || new Date(market.closes_at) < new Date()
  const isResolved = market.status === 'resolved'

  const currentWallet = wallets?.find((w) => w.currency === currency)
  const balance = currentWallet?.available_balance || 0
  const currencyInfo = CURRENCIES[currency]

  const numericAmount = parseFloat(amount) || 0
  const rateInfo = currencyInfo

  // Estimated shares
  const currentPrice = side === 'yes' ? market.yes_price : market.no_price
  const feeRate = market.platform_fee_rate
  const netAmount = numericAmount * (1 - feeRate)
  const estimatedShares = currentPrice > 0 ? netAmount / currentPrice : 0
  const potentialPayout = estimatedShares // * $1 if wins
  const feeAmount = numericAmount * feeRate

  const quickAmounts = currencyInfo
    ? [currencyInfo.minBet * 2, currencyInfo.minBet * 10, currencyInfo.minBet * 50, currencyInfo.minBet * 100]
    : [100, 500, 1000, 5000]

  const handlePlaceBet = useCallback(async () => {
    if (!user) {
      toast.error('Please sign in to bet')
      router.push('/auth/login')
      return
    }

    if (!amount || numericAmount <= 0) {
      toast.error('Enter a valid amount')
      return
    }

    if (numericAmount < (currencyInfo?.minBet || 1)) {
      toast.error(`Minimum bet is ${currencyInfo?.minBet} ${currency}`)
      return
    }

    if (numericAmount > balance) {
      toast.error(`Insufficient balance. Available: ${balance.toLocaleString()} ${currency}`)
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market_id: market.id,
          side,
          amount_local: numericAmount,
          currency,
          order_type: 'market',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to place bet')
        return
      }

      toast.success(
        `✅ Bet placed! ${estimatedShares.toFixed(2)} shares at ${(currentPrice * 100).toFixed(0)}%`
      )
      setAmount('')
      router.refresh()

    } catch (error) {
      toast.error('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [user, amount, numericAmount, currency, side, market.id, balance, estimatedShares, currentPrice, router, currencyInfo])

  if (isResolved) {
    return (
      <div className="rounded-2xl border bg-card p-5">
        <div className="text-center py-4">
          <div className="text-4xl mb-2">
            {market.resolved_outcome === 'yes' ? '✅' : '❌'}
          </div>
          <h3 className="font-semibold text-lg">Market Resolved</h3>
          <p className="text-muted-foreground mt-1">
            Outcome: <span className={cn('font-bold', market.resolved_outcome === 'yes' ? 'text-yes' : 'text-no')}>
              {market.resolved_outcome?.toUpperCase()}
            </span>
          </p>
          {market.resolution_notes && (
            <p className="text-sm text-muted-foreground mt-2">{market.resolution_notes}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Place a Bet</h3>
        {isClosed && (
          <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">
            Closed
          </span>
        )}
      </div>

      {/* YES / NO toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide('yes')}
          disabled={isClosed}
          className={cn(
            'flex flex-col items-center py-3 px-4 rounded-xl border-2 transition-all',
            side === 'yes'
              ? 'border-yes bg-yes/10 dark:bg-yes/20'
              : 'border-border hover:border-yes/50'
          )}
        >
          <span className="text-lg font-bold text-yes">YES</span>
          <span className="text-xs text-muted-foreground mt-0.5">
            {(market.yes_price * 100).toFixed(0)}¢
          </span>
        </button>
        <button
          onClick={() => setSide('no')}
          disabled={isClosed}
          className={cn(
            'flex flex-col items-center py-3 px-4 rounded-xl border-2 transition-all',
            side === 'no'
              ? 'border-no bg-no/10 dark:bg-no/20'
              : 'border-border hover:border-no/50'
          )}
        >
          <span className="text-lg font-bold text-no">NO</span>
          <span className="text-xs text-muted-foreground mt-0.5">
            {(market.no_price * 100).toFixed(0)}¢
          </span>
        </button>
      </div>

      {/* Probability bar */}
      <div className="price-bar">
        <div
          className="price-bar-yes"
          style={{ width: `${market.yes_price * 100}%` }}
        />
      </div>

      {/* Currency selector */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Currency</label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isClosed}
        >
          {Object.values(CURRENCIES)
            .filter((c) => c.code !== 'USD')
            .map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.code} — {c.name}
              </option>
            ))}
        </select>
        {user && (
          <p className="text-xs text-muted-foreground mt-1">
            Balance: {balance.toLocaleString('en-US', { maximumFractionDigits: 0 })} {currency}
          </p>
        )}
      </div>

      {/* Amount input */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Amount ({currency})</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
            {currencyInfo?.symbol}
          </span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min={currencyInfo?.minBet || 1}
            step={1}
            disabled={isClosed}
            className="w-full rounded-xl border bg-background pl-10 pr-4 py-3 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Quick amounts */}
        <div className="flex gap-2 mt-2 flex-wrap">
          {quickAmounts.map((qa) => (
            <button
              key={qa}
              onClick={() => setAmount(String(qa))}
              disabled={isClosed}
              className="text-xs px-2.5 py-1 rounded-lg border hover:bg-muted transition-colors"
            >
              {qa >= 1000 ? `${(qa/1000).toFixed(0)}K` : qa}
            </button>
          ))}
          <button
            onClick={() => setAmount(String(Math.floor(balance)))}
            disabled={isClosed || balance <= 0}
            className="text-xs px-2.5 py-1 rounded-lg border hover:bg-muted transition-colors"
          >
            Max
          </button>
        </div>
      </div>

      {/* Summary */}
      {numericAmount > 0 && (
        <div className="rounded-xl bg-muted/50 p-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Est. shares</span>
            <span className="font-medium">{estimatedShares.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform fee ({(feeRate * 100).toFixed(0)}%)</span>
            <span className="text-muted-foreground">-{feeAmount.toFixed(0)} {currency}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 mt-1.5">
            <span className="font-medium">Potential payout</span>
            <span className={cn('font-bold', side === 'yes' ? 'text-yes' : 'text-no')}>
              ${(potentialPayout).toFixed(2)} USD
            </span>
          </div>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handlePlaceBet}
        disabled={isClosed || isSubmitting || !amount || numericAmount <= 0}
        className={cn(
          'w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-95',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          side === 'yes'
            ? 'bg-yes hover:bg-yes-dark text-white'
            : 'bg-no hover:bg-no-dark text-white'
        )}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Placing bet...
          </span>
        ) : isClosed ? (
          'Market Closed'
        ) : (
          <span className="flex items-center justify-center gap-2">
            {side === 'yes' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            Bet {side.toUpperCase()} {numericAmount > 0 ? `· ${amount} ${currency}` : ''}
          </span>
        )}
      </button>

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground text-center flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        Prediction markets involve risk. Only bet what you can afford to lose.
      </p>
    </div>
  )
}
