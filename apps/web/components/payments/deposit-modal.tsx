'use client'

// components/payments/deposit-modal.tsx
import { useState, useEffect, useMemo } from 'react'
import { Loader2, CheckCircle2, XCircle, Smartphone, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import type { CurrencyCode, PaymentProvider } from '@/types'
import { CURRENCIES, PAYMENT_PROVIDER_LABELS } from '@/types'
import { cn } from '@/lib/utils'
import { useWallets } from '@/hooks/use-wallets'

interface DepositModalProps {
  isOpen: boolean
  onClose: () => void
  defaultCurrency?: CurrencyCode
}

type Step = 'form' | 'processing' | 'success' | 'failed'

export function DepositModal({ isOpen, onClose, defaultCurrency = 'KES' }: DepositModalProps) {
  const { refreshWallets } = useWallets()

  const [step, setStep] = useState<Step>('form')
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency)
  const [provider, setProvider] = useState<PaymentProvider>('mpesa')
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [depositId, setDepositId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pollCount, setPollCount] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')

  const currencyInfo = CURRENCIES[currency]
  const availableProviders = useMemo<PaymentProvider[]>(
    () => currencyInfo?.providers || ['pesapal'],
    [currencyInfo]
  )

  // Auto-select first provider when currency changes
  useEffect(() => {
    if (!availableProviders.includes(provider)) {
      setProvider(availableProviders[0])
    }
  }, [availableProviders, provider])

  // Poll for payment status
  useEffect(() => {
    if (step !== 'processing' || !depositId) return

    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/deposit?id=${depositId}`)
        const data = await res.json()

        if (data.data?.status === 'completed') {
          setStep('success')
          await refreshWallets()
          return
        }

        if (data.data?.status === 'failed') {
          setStep('failed')
          setStatusMessage(data.data.failure_reason || 'Payment failed')
          return
        }

        setPollCount((c) => c + 1)
      } catch (e) {
        // continue polling
      }
    }

    const interval = setInterval(poll, 3000)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      if (step === 'processing') {
        setStep('failed')
        setStatusMessage('Payment timed out. If your money was deducted, it will be credited within 10 minutes.')
      }
    }, 5 * 60 * 1000) // 5 min timeout

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [step, depositId, refreshWallets])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount < (currencyInfo?.minBet || 1)) {
      toast.error(`Minimum deposit: ${currencyInfo?.minBet} ${currency}`)
      return
    }

    if (!phone || phone.length < 9) {
      toast.error('Enter a valid phone number')
      return
    }

    setIsSubmitting(true)
    setStep('processing')
    setStatusMessage('Sending payment request...')

    try {
      const res = await fetch('/api/payments/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numAmount,
          currency,
          phone,
          provider,
          country: Object.entries(CURRENCIES).find(([, v]) => v.code === currency)?.[0] || 'KE',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setStep('failed')
        setStatusMessage(data.error || 'Failed to initiate payment')
        return
      }

      setDepositId(data.deposit_id)
      setStatusMessage(data.message || 'Waiting for payment confirmation...')

    } catch (error) {
      setStep('failed')
      setStatusMessage('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setStep('form')
    setAmount('')
    setPhone('')
    setDepositId('')
    setStatusMessage('')
    setPollCount(0)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-lg">Add Funds</h2>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Success state */}
        {step === 'success' && (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-14 h-14 text-yes mx-auto" />
            <h3 className="text-xl font-bold">Payment Successful!</h3>
            <p className="text-muted-foreground">
              {amount} {currency} has been added to your account.
            </p>
            <button onClick={handleClose} className="w-full mt-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold">
              Done
            </button>
          </div>
        )}

        {/* Failed state */}
        {step === 'failed' && (
          <div className="p-8 text-center space-y-3">
            <XCircle className="w-14 h-14 text-destructive mx-auto" />
            <h3 className="text-xl font-bold">Payment Failed</h3>
            <p className="text-muted-foreground text-sm">{statusMessage}</p>
            <button
              onClick={() => setStep('form')}
              className="w-full mt-2 py-3 rounded-xl border font-semibold hover:bg-muted"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Processing state */}
        {step === 'processing' && (
          <div className="p-8 text-center space-y-4">
            <div className="relative">
              <Smartphone className="w-14 h-14 text-primary mx-auto" />
              <Loader2 className="w-6 h-6 animate-spin text-primary absolute -bottom-1 -right-1 left-1/2 ml-4" />
            </div>
            <h3 className="text-xl font-bold">Waiting for Payment</h3>
            <p className="text-muted-foreground text-sm">{statusMessage}</p>
            <div className="text-xs text-muted-foreground bg-muted rounded-xl p-3">
              Check your phone for a payment prompt. Enter your PIN to confirm.
            </div>
            <div className="text-xs text-muted-foreground">
              Checking... ({pollCount} checks)
            </div>
          </div>
        )}

        {/* Form state */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Currency */}
            <div>
              <span className="text-sm font-medium mb-1.5 block">Currency</span>
              <div className="grid grid-cols-2 gap-2">
                {(['KES', 'UGX', 'TZS', 'RWF', 'ZMW'] as CurrencyCode[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all',
                      currency === c ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                    )}
                  >
                    <span>{CURRENCIES[c].flag}</span>
                    <span className="font-medium">{c}</span>
                    <span className="text-muted-foreground text-xs">{CURRENCIES[c].country}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Provider */}
            <div>
              <span className="text-sm font-medium mb-1.5 block">Payment Method</span>
              <div className="space-y-2">
                {availableProviders.map((p) => {
                  const info = PAYMENT_PROVIDER_LABELS[p]
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProvider(p)}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
                        provider === p ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                      )}
                    >
                      <span className="font-medium text-sm">{info.label}</span>
                      {provider === p && <ChevronRight className="w-4 h-4 text-primary" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label htmlFor="amount" className="text-sm font-medium mb-1.5 block">
                Amount ({currency})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                  {CURRENCIES[currency]?.symbol}
                </span>
                <input id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={String(currencyInfo?.minBet || 100)}
                  min={currencyInfo?.minBet || 1}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border bg-background text-lg font-medium focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Minimum: {currencyInfo?.minBet?.toLocaleString()} {currency}
              </p>
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone-number" className="text-sm font-medium mb-1.5 block">
                Phone Number
              </label>
              <input id="phone-number"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={currency === 'KES' ? '0712345678' : currency === 'UGX' ? '0771234567' : '0712345678'}
                className="w-full px-4 py-3 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                The number registered with {PAYMENT_PROVIDER_LABELS[provider]?.label}
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold transition-all active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                `Deposit ${amount ? `${parseFloat(amount).toLocaleString()} ` : ''}${currency}`
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
