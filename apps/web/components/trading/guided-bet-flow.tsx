'use client'

// components/trading/guided-bet-flow.tsx
// ------------------------------------------------------------
// OPTION B — "Guided 2-Step" beginner-first checkout.
//
// A conversion-optimized alternative to the pro <BettingPanel/> ticket for
// first-time users who have never touched a prediction market. One decision per
// screen keeps learning at ~zero:
//
//   pick a side  →  Step 1: how much  →  Step 2: confirm & pay  →  receipt
//
// The economics are IDENTICAL to the pro ticket — same previewBet /
// previewOptionBet / previewOptionBinaryBet from lib/trading (so the preview
// still equals on-chain execution) and the same POST /api/orders contract via
// orderTarget(). Only the *presentation* changes. All non-visual decisions are
// delegated to the pure, unit-tested helpers in lib/guided-bet.
//
// Auth is DEFERRED: a logged-out user can build the whole bet and is only sent
// to sign-in at the final confirm (with a return path), instead of hitting a
// wall on first interaction. Dark-launched behind flags.guided_bet_flow.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { useWallets } from '@/hooks/use-wallets'
import { useRates } from '@/hooks/use-rates'
import {
  previewBet,
  previewOptionBet,
  previewOptionBinaryBet,
  orderTarget,
  meetsMinBet,
  MIN_BET_USD,
} from '@/lib/trading'
import {
  guidedStakePresets,
  guidedProgress,
  guidedStakeGate,
  type GuidedStep,
} from '@/lib/guided-bet'
import { serializePendingBet, parsePendingBet, PENDING_BET_KEY } from '@/lib/pending-bet'
import { normalizeOutcomes, isMultiOutcome, type Outcome } from '@/lib/markets/outcomes'
import { formatCurrency, usdToLocal } from '@/lib/currency'
import { CURRENCIES } from '@/types'
import type { Market, MarketOption } from '@/types'
import {
  IconCheck,
  IconArrowRight,
  IconChevronLeft,
  IconShield,
  IconSpinner,
  IconPhone,
} from '@/components/ui/icons'

interface GuidedBetFlowProps {
  market: Market
  options?: MarketOption[]
  initialSide?: 'yes' | 'no'
  initialOptionId?: string
  /** Hide the inline candidate list (board drives selection on multi markets). */
  hideOptionList?: boolean
  /** Phase C: candidates trade as independent Yes/No lines. */
  independent?: boolean
}

type Side = 'yes' | 'no'

export function GuidedBetFlow({
  market,
  options,
  initialSide,
  initialOptionId,
  hideOptionList,
  independent = false,
}: GuidedBetFlowProps) {
  const { user } = useAuth()
  const { wallets, preferredCurrency, refreshWallets } = useWallets()
  const { rates } = useRates()
  const router = useRouter()

  const isMulti = isMultiOutcome(market, options)
  const indepMulti = isMulti && independent
  const outcomes: Outcome[] = useMemo(() => normalizeOutcomes(market, options), [market, options])

  const [step, setStep] = useState<GuidedStep>('stake')
  const [side, setSide] = useState<Side>(initialSide ?? 'yes')
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    () => (isMulti ? initialOptionId ?? outcomes[0]?.id ?? '' : ''),
  )
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<{ label: string; tone: Side | 'brand'; payoutLocal: number } | null>(null)

  const wallet = wallets.find((w) => w.currency === preferredCurrency)
  const balance = wallet?.available_balance ?? 0
  const currencyInfo = CURRENCIES[preferredCurrency]

  const isOpen = market.status === 'active'

  const selectedOutcome = isMulti
    ? outcomes.find((o) => o.id === selectedOptionId) ?? outcomes[0]
    : outcomes.find((o) => o.id === side)
  const selYesPrice = selectedOutcome?.yesPrice ?? selectedOutcome?.price ?? 0
  const selNoPrice = selectedOutcome?.noPrice ?? (selectedOutcome ? 1 - selectedOutcome.price : 0)

  const currentPrice = isMulti
    ? indepMulti
      ? side === 'yes'
        ? selYesPrice
        : selNoPrice
      : selectedOutcome?.price ?? 0
    : side === 'yes'
      ? market.yes_price
      : market.no_price

  const amountNum = parseFloat(amount) || 0

  // Authoritative, slippage-aware preview — the SAME calls the pro ticket makes.
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

  const payoutLocal = preview ? usdToLocal(preview.potentialPayoutUsd, preferredCurrency, rates) : 0
  const profitLocal = payoutLocal - amountNum
  const impliedChance = Math.round(currentPrice * 100)

  const belowMin = amountNum > 0 && !meetsMinBet(amountNum, preferredCurrency, rates)
  const overBalance = balance > 0 && amountNum > balance
  const hasSelection = isMulti ? !!selectedOutcome : true

  const presets = useMemo(() => {
    const minLocal = balance > 0 ? MIN_BET_USD : currencyInfo?.minBet ?? 100
    return guidedStakePresets(balance, minLocal)
  }, [balance, currencyInfo])

  // Slider bounds for the stake control (min = market minimum, max = generous
  // headroom above the largest chip / balance).
  const sliderMin = Math.max(1, Math.round(usdToLocal(MIN_BET_USD, preferredCurrency, rates)))
  const sliderMax = Math.max((presets[presets.length - 1] ?? 2000) * 2, balance > 0 ? Math.ceil(balance) : 2000)

  // Rehydrate a bet that survived the sign-in / sign-up round-trip. A logged-out
  // user builds the whole bet, taps Place bet, we stash it (see placeBet) and
  // send them to auth; on return to this market we restore side/option/stake and
  // drop them straight on Confirm — no lost work, no re-deciding. Runs once,
  // client-only, scoped to THIS market, and clears the stash so it's single-use.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current || typeof window === 'undefined') return
    const raw = window.localStorage.getItem(PENDING_BET_KEY)
    const pending = parsePendingBet(raw, { nowMs: Date.now(), marketId: market.id })
    if (!pending) return
    restoredRef.current = true
    window.localStorage.removeItem(PENDING_BET_KEY)
    setTouched(true) // keep the seeding effect from overwriting the restored stake
    setSide(pending.side)
    if (pending.optionId && isMulti) setSelectedOptionId(pending.optionId)
    setAmount(String(pending.amount))
    setStep('confirm')
  }, [market.id, isMulti])

  // Seed the smallest preset so the payout preview shows immediately (endowed value).
  useEffect(() => {
    if (!touched && !amount && isOpen && presets.length > 0) setAmount(String(presets[0]))
  }, [touched, amount, isOpen, presets])

  // Keep selection in sync with the candidate board (multi markets).
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

  const minLabel = formatCurrency(usdToLocal(MIN_BET_USD, preferredCurrency, rates), preferredCurrency)
  const balanceLabel = formatCurrency(balance, preferredCurrency)
  const stakeGate = guidedStakeGate({
    isOpen,
    hasSelection,
    amount: amountNum,
    belowMin,
    overBalance,
    minLabel,
    balanceLabel,
  })
  const progress = guidedProgress(step, hasSelection)

  const sideLabel = isMulti
    ? indepMulti
      ? `${selectedOutcome?.label ?? ''} · ${side === 'yes' ? 'Yes' : 'No'}`
      : selectedOutcome?.label ?? ''
    : side === 'yes'
      ? 'Yes'
      : 'No'
  const tone: Side | 'brand' = isMulti ? (indepMulti ? side : 'brand') : side

  // ---- Actions ----------------------------------------------
  const goConfirm = () => {
    if (!stakeGate.ok) return setError(stakeGate.reason)
    setError('')
    setStep('confirm')
  }

  const placeBet = async () => {
    if (!user) {
      // Deferred auth: the bet is fully built. Stash it so sign-in / sign-up can
      // rehydrate it on return (see the restore effect above), then send the
      // user to auth with a path back to this exact market.
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
      const next = encodeURIComponent(`/markets/${market.slug}`)
      return router.push(`/auth/login?next=${next}`)
    }
    if (!stakeGate.ok) return setError(stakeGate.reason)
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
          order_type: 'market',
        }),
      })
      const data = await res.json()
      const rpc = data?.data ?? {}
      if (res.ok && (data.success || rpc.order_id)) {
        setReceipt({
          label: sideLabel,
          tone,
          payoutLocal: rpc.potential_payout_usd
            ? usdToLocal(rpc.potential_payout_usd, preferredCurrency, rates)
            : payoutLocal,
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

  // ---- Closed state -----------------------------------------
  if (!isOpen && !receipt) {
    return (
      <div className="card p-4">
        <p className="font-display text-sm text-text-primary">Trading closed</p>
        <p className="mt-1 text-sm text-text-secondary">
          This market isn’t open for new bets right now. Check back once it’s active.
        </p>
      </div>
    )
  }

  // ---- Success receipt --------------------------------------
  if (receipt) {
    return (
      <div className="card p-5 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-yes/10 text-yes">
          <IconCheck size={28} />
        </span>
        <p className="font-display text-lg text-text-primary">You’re in</p>
        <p className="mt-1 text-sm text-text-secondary">
          <span className={receipt.tone === 'no' ? 'text-no' : 'text-yes'}>{receipt.label}</span> · {market.title}
        </p>
        <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-pill border border-yes/30 bg-yes/10 px-4 py-2 text-sm font-semibold text-yes">
          If you’re right, you win {formatCurrency(receipt.payoutLocal, preferredCurrency)}
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" className="btn btn-primary btn-lg w-full" onClick={() => router.push('/markets')}>
            Find your next market <IconArrowRight size={15} />
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => router.push('/portfolio')}>
            View my bets
          </button>
        </div>
      </div>
    )
  }

  // ---- Shared: progress + selection header ------------------
  const ProgressBar = (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">
          {step === 'stake' ? 'Step 1 of 2 · How much?' : 'Step 2 of 2 · Confirm'}
        </span>
        <span className="text-xs font-medium text-yes">
          {step === 'stake' ? 'Almost there' : 'One tap left'}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-yes transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )

  const payoutBlock = preview && (
    <div
      className={`mt-4 flex items-center justify-between rounded-lg border p-3 ${
        tone === 'no' ? 'border-no/30 bg-no/10' : 'border-yes/30 bg-yes/10'
      }`}
    >
      <div>
        <p className="text-[13px] font-medium text-text-primary">If you’re right, you win</p>
        <p className="text-[11px] text-text-muted">
          Stake {formatCurrency(amountNum, preferredCurrency)} · profit {formatCurrency(profitLocal, preferredCurrency)}
        </p>
      </div>
      <span className={`font-display text-xl ${tone === 'no' ? 'text-no' : 'text-yes'}`}>
        {formatCurrency(payoutLocal, preferredCurrency)}
      </span>
    </div>
  )

  // ---- STEP 1 — stake ---------------------------------------
  if (step === 'stake') {
    return (
      <div className="card p-4">
        {ProgressBar}

        {/* Side / candidate selection */}
        {!isMulti ? (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Choose an outcome">
            {(['yes', 'no'] as Side[]).map((s) => {
              const price = s === 'yes' ? market.yes_price : market.no_price
              const sel = side === s
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => { setSide(s); setError('') }}
                  className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                    sel
                      ? s === 'yes'
                        ? 'border-yes bg-yes/10'
                        : 'border-no bg-no/10'
                      : 'border-hairline hover:border-pip-300'
                  }`}
                >
                  <span className={`text-sm font-semibold ${s === 'yes' ? 'text-yes' : 'text-no'}`}>
                    {s === 'yes' ? 'Yes' : 'No'}
                  </span>
                  <span className={`font-display text-xl ${s === 'yes' ? 'text-yes' : 'text-no'}`}>
                    {Math.round(price * 100)}%
                  </span>
                  <span className="text-[11px] text-text-muted">chance</span>
                </button>
              )
            })}
          </div>
        ) : (
          <div>
            {!hideOptionList && (
              <div className="flex flex-col gap-2" role="group" aria-label="Choose an outcome">
                {outcomes.map((o) => {
                  const sel = selectedOutcome?.id === o.id
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={sel}
                      onClick={() => { setSelectedOptionId(o.id); setError('') }}
                      className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                        sel ? 'border-pip-300 bg-surface-2' : 'border-hairline hover:border-pip-300'
                      }`}
                    >
                      <span className="truncate text-sm font-medium text-text-primary">{o.label}</span>
                      <span className="font-mono text-sm text-text-secondary">{Math.round(o.price * 100)}%</span>
                    </button>
                  )
                })}
              </div>
            )}
            {indepMulti && (
              <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Yes or No">
                {(['yes', 'no'] as Side[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={side === s}
                    onClick={() => { setSide(s); setError('') }}
                    className={`rounded-lg border p-2.5 text-sm font-semibold transition-colors ${
                      side === s
                        ? s === 'yes' ? 'border-yes bg-yes/10 text-yes' : 'border-no bg-no/10 text-no'
                        : 'border-hairline text-text-secondary hover:border-pip-300'
                    }`}
                  >
                    {s === 'yes' ? 'Yes' : 'No'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stake amount — big central figure + one-tap chips + fine slider */}
        <div className="mt-5">
          <label htmlFor="guided-stake" className="block text-center text-xs font-medium text-text-secondary">
            Your stake
          </label>
          <div className="mt-1 flex items-baseline justify-center gap-1.5">
            <span className="font-display text-base text-text-muted">{preferredCurrency}</span>
            <input
              id="guided-stake"
              inputMode="decimal"
              aria-label="Stake amount"
              value={amount}
              onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '')); setTouched(true); setError('') }}
              placeholder={String(presets[0] ?? 100)}
              size={Math.max(3, amount.length || 3)}
              className="w-auto max-w-[9ch] border-0 bg-transparent p-0 text-center font-display text-4xl tracking-tight text-text-primary outline-none tabular-nums"
            />
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setAmount(String(p)); setTouched(true); setError('') }}
                className={`rounded-md border py-2 text-[13px] font-semibold transition-colors ${
                  amountNum === p ? 'border-pip-500 bg-surface-2 text-text-primary' : 'border-hairline text-text-secondary hover:border-pip-300'
                }`}
              >
                {p.toLocaleString()}
              </button>
            ))}
          </div>

          <input
            type="range"
            aria-label="Adjust stake"
            min={sliderMin}
            max={sliderMax}
            step={sliderMin}
            value={Math.min(Math.max(amountNum || sliderMin, sliderMin), sliderMax)}
            onChange={(e) => { setAmount(e.target.value); setTouched(true); setError('') }}
            className="mt-4 w-full accent-yes"
          />
        </div>

        {payoutBlock}

        {error && <p role="alert" className="mt-3 text-[13px] text-no">{error}</p>}

        <button type="button" className="btn btn-primary btn-lg mt-4 w-full" onClick={goConfirm} disabled={!isOpen}>
          Continue{preview ? ` · win ${formatCurrency(payoutLocal, preferredCurrency)}` : ''}
          <IconArrowRight size={15} />
        </button>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-text-muted">
          <IconShield size={12} className="mt-0.5 flex-none" />
          <span>The {impliedChance}% is the current crowd estimate. Prices follow LMSR and update live; a small fee applies.</span>
        </p>
      </div>
    )
  }

  // ---- STEP 2 — confirm & pay -------------------------------
  return (
    <div className="card p-4">
      {ProgressBar}

      <div className="rounded-lg border border-hairline">
        <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5 text-[13px]">
          <span className="text-text-muted">Prediction</span>
          <span className={`font-semibold ${tone === 'no' ? 'text-no' : tone === 'yes' ? 'text-yes' : 'text-text-primary'}`}>
            {sideLabel} · {impliedChance}%
          </span>
        </div>
        <div className="flex items-center justify-between border-b border-hairline px-3 py-2.5 text-[13px]">
          <span className="text-text-muted">Stake</span>
          <span className="font-mono font-semibold text-text-primary">{formatCurrency(amountNum, preferredCurrency)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5 text-sm">
          <span className="text-text-muted">You win if right</span>
          <span className="font-display text-yes">{formatCurrency(payoutLocal, preferredCurrency)}</span>
        </div>
      </div>

      {!user && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-hairline bg-surface-2 px-3 py-2.5 text-[12px] text-text-secondary">
          <IconPhone size={16} className="mt-0.5 flex-none text-text-primary" />
          <span>You’ll sign in with your phone to finish — it’s your login and M-Pesa number in one. We bring you right back here.</span>
        </p>
      )}

      {error && <p role="alert" className="mt-3 text-[13px] text-no">{error}</p>}

      <button
        type="button"
        className="btn btn-primary btn-lg mt-4 w-full disabled:cursor-not-allowed"
        onClick={placeBet}
        disabled={loading}
      >
        {loading ? (
          <><IconSpinner size={16} /> Placing…</>
        ) : !user ? (
          <>Sign in &amp; place bet <IconArrowRight size={15} /></>
        ) : (
          <>Confirm &amp; pay {formatCurrency(amountNum, preferredCurrency)} <IconArrowRight size={15} /></>
        )}
      </button>
      <button type="button" className="btn btn-ghost mt-2 w-full" onClick={() => setStep('stake')}>
        <IconChevronLeft size={15} /> Back
      </button>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-text-muted">
        <IconShield size={12} className="mt-0.5 flex-none" />
        <span>Secured · your preview equals execution — a {(market.platform_fee_rate * 100).toFixed(1)}% fee applies · 18+ only.</span>
      </p>
    </div>
  )
}
