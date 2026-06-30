'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useWallets } from '@/hooks/use-wallets'
import { CURRENCIES } from '@/types'
import type { Market } from '@/types'
import { IconWallet, IconInfo, IconArrowRight, IconShield } from '@/components/ui/icons'

interface BettingPanelProps {
  market: Market
}

export function BettingPanel({ market }: BettingPanelProps) {
  const { user } = useAuth()
  const { wallets, preferredCurrency, refreshWallets } = useWallets()
  const router = useRouter()

  const [side, setSide] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [receipt, setReceipt] = useState<{ shares: number; avgPrice: number; payout: number } | null>(null)

  const wallet = wallets.find(w => w.currency === preferredCurrency)
  const balance = wallet?.available_balance ?? 0
  const currencyInfo = CURRENCIES[preferredCurrency]
  const amountNum = parseFloat(amount) || 0

  // Price
  const price = side === 'yes' ? market.yes_price : market.no_price
  const oppPrice = side === 'yes' ? market.no_price : market.yes_price

  // Payout estimate: amount / price = shares, shares * $1 = max payout in USD
  // shares ≈ stake / price (each share pays out 1 unit if correct)
  const shares = amountNum > 0 && price > 0 ? amountNum / price : 0
  const estimatedPayout = amountNum > 0 ? (amountNum / price) * (1 - 0.02) : 0
  const potentialProfit = estimatedPayout - amountNum
  const profitPct = amountNum > 0 ? ((potentialProfit / amountNum) * 100) : 0

  const isClosed = market.status !== 'active'

  const presets = balance > 0
    ? [
        Math.floor(balance * 0.1),
        Math.floor(balance * 0.25),
        Math.floor(balance * 0.5),
        Math.floor(balance),
      ].map(v => v.toString())
    : ['100', '500', '1000', '2000']

  const handleBet = async () => {
    if (!user) return router.push('/auth/login')
    if (amountNum <= 0) return setError('Enter an amount')
    if (balance > 0 && amountNum > balance) return setError(`Insufficient balance. You have ${currencyInfo?.symbol}${balance.toLocaleString()}`)
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market_id: market.id,
          side,
          amount: amountNum,
          currency: preferredCurrency,
        }),
      })
      const data = await res.json()
      if (data.success || data.order_id) {
        setSuccess(true)
        setReceipt({
          shares: data.shares_bought ?? estimatedPayout,
          avgPrice: data.average_price ?? price,
          payout: data.max_payout ?? estimatedPayout,
        })
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

  if (success && receipt) {
    return (
      <div className="card p-5 text-center animate-scale-in">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: side === 'yes' ? 'var(--green-dim)' : 'var(--red-dim)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke={side === 'yes' ? 'var(--green)' : 'var(--red)'}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 className="font-display text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Bet Placed!
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          You bet {currencyInfo?.symbol}{amountNum.toLocaleString()} on{' '}
          <strong style={{ color: side === 'yes' ? 'var(--green)' : 'var(--red)' }}>
            {side.toUpperCase()}
          </strong>
        </p>

        <div className="rounded-xl p-4 mb-5 space-y-2"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Avg. price</span>
            <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {Math.round(receipt.avgPrice * 100)}¢
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-muted)' }}>Max payout</span>
            <span className="font-mono font-bold" style={{ color: 'var(--green)' }}>
              {currencyInfo?.symbol}{receipt.payout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <button
          onClick={() => { setSuccess(false); setAmount(''); setReceipt(null) }}
          className="btn btn-secondary w-full mb-2"
        >
          Place another bet
        </button>
        <button
          onClick={() => router.push('/portfolio')}
          className="btn btn-ghost w-full text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          View portfolio <IconArrowRight size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="card p-5 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          Place Bet
        </h3>
        {user && wallet && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <IconWallet size={12} />
            <span className="font-mono">
              {currencyInfo?.symbol}{balance.toLocaleString()} {preferredCurrency}
            </span>
          </div>
        )}
      </div>

      {/* YES / NO toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide('yes')}
          className={`btn-yes transition-all ${side === 'yes' ? 'active' : ''}`}
          disabled={isClosed}
        >
          <div className="text-lg font-black">YES</div>
          <div className="text-sm opacity-80">{Math.round(market.yes_price * 100)}¢</div>
        </button>
        <button
          onClick={() => setSide('no')}
          className={`btn-no transition-all ${side === 'no' ? 'active' : ''}`}
          disabled={isClosed}
        >
          <div className="text-lg font-black">NO</div>
          <div className="text-sm opacity-80">{Math.round(market.no_price * 100)}¢</div>
        </button>
      </div>

      {isClosed ? (
        <div className="rounded-xl p-4 text-center text-sm"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
          This market is {market.status}. No new bets accepted.
        </div>
      ) : (
        <>
          {/* Amount input */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-2"
              style={{ color: 'var(--text-muted)' }}>
              Amount ({preferredCurrency})
            </label>

            {/* Quick presets */}
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {presets.map(v => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  className="py-1.5 text-xs font-semibold rounded-lg border transition-all"
                  style={{
                    background: amount === v ? 'var(--green)' : 'var(--bg-tertiary)',
                    color: amount === v ? '#fff' : 'var(--text-secondary)',
                    borderColor: amount === v ? 'var(--green)' : 'var(--border)',
                  }}
                >
                  {currencyInfo?.symbol}{parseInt(v).toLocaleString()}
                </button>
              ))}
            </div>

            <input
              className="input input-lg text-right"
              type="number"
              placeholder="0"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError('') }}
              style={{
                color: side === 'yes' ? 'var(--green)' : 'var(--red)',
                borderColor: amount ? (side === 'yes' ? 'var(--green)' : 'var(--red)') : undefined,
              }}
            />
          </div>

          {/* Payout estimate */}
          {amountNum > 0 && (
            <div className="rounded-xl p-3 space-y-2 animate-fade-in"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Avg. price</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {Math.round(price * 100)}¢
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Platform fee</span>
                <span className="font-mono" style={{ color: 'var(--text-muted)' }}>2%</span>
              </div>
              <div className="divider" />
              <div className="flex justify-between text-sm">
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Max payout</span>
                <span
                  className="font-mono font-bold"
                  style={{ color: side === 'yes' ? 'var(--green)' : 'var(--red)' }}
                >
                  {currencyInfo?.symbol}{estimatedPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  <span className="text-xs ml-1 opacity-70">
                    (+{profitPct.toFixed(0)}%)
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-xs p-3 rounded-lg animate-fade-in"
              style={{ background: 'var(--red-faint)', color: 'var(--red)', border: '1px solid var(--red-dim)' }}>
              <IconInfo size={13} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          {user ? (
            <button
              className="btn btn-lg w-full transition-all"
              onClick={handleBet}
              disabled={loading || amountNum <= 0}
              style={{
                background: side === 'yes' ? 'var(--green)' : 'var(--red)',
                color: '#fff',
                borderColor: 'transparent',
                opacity: (loading || amountNum <= 0) ? 0.5 : 1,
              }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"/>
                  </svg>
                  Placing bet…
                </span>
              ) : (
                <>
                  Bet {side.toUpperCase()}
                  {amountNum > 0 && ` · ${currencyInfo?.symbol}${amountNum.toLocaleString()}`}
                </>
              )}
            </button>
          ) : (
            <button
              className="btn btn-primary btn-lg w-full"
              onClick={() => router.push('/auth/login')}
            >
              Sign in to bet <IconArrowRight size={15} />
            </button>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <IconShield size={11} className="mt-0.5 flex-shrink-0" />
            <span>Prices update in real-time. Payouts subject to LMSR pricing. 2% platform fee applies.</span>
          </div>
        </>
      )}
    </div>
  )
}
