'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWallets } from '@/hooks/use-wallets'
import { useAuth } from '@/hooks/use-auth'
import { CURRENCIES } from '@/types'
import type { CurrencyCode, PaymentProvider } from '@/types'

const PROVIDER_FEES: Record<PaymentProvider, number> = {
  mpesa: 0.01,
  mtn_momo: 0.01,
  airtel_money: 0.01,
  pesapal: 0.015,
  bank_transfer: 0.005,
  internal: 0,
}

export default function WithdrawModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { wallets, refresh } = useWallets()
  const router = useRouter()

  const [currency, setCurrency] = useState<CurrencyCode>('KES')
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string; fee?: number; net?: number } | null>(null)

  const wallet = wallets.find((w) => w.currency === currency)
  const currencyInfo = CURRENCIES[currency]
  const provider: PaymentProvider = currencyInfo?.providers[0] || 'mpesa'
  const feeRate = PROVIDER_FEES[provider] || 0.01
  const amountNum = parseFloat(amount) || 0
  const fee = Math.ceil(amountNum * feeRate)
  const net = amountNum - fee

  const handleSubmit = async () => {
    if (!user) return router.push('/auth/login')
    if (!amount || !phone) return

    setLoading(true)
    try {
      const res = await fetch('/api/payments/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountNum,
          currency,
          phone_number: phone,
          provider,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setResult({ success: true, message: data.message, fee: data.fee, net: data.net_amount })
        await refresh()
      } else {
        setResult({ success: false, message: data.error || 'Withdrawal failed' })
      }
    } finally {
      setLoading(false)
    }
  }

  if (result?.success) return (
    <div className="text-center py-4">
      <div className="text-5xl mb-3">✅</div>
      <h3 className="text-lg font-bold mb-1">Withdrawal Submitted</h3>
      <p className="text-sm text-base-content/70 mb-4">{result.message}</p>
      {result.fee !== undefined && (
        <div className="bg-base-200 rounded-lg p-3 text-sm mb-4">
          <div className="flex justify-between"><span>Fee</span><span>{result.fee.toLocaleString()} {currency}</span></div>
          <div className="flex justify-between font-bold"><span>You receive</span><span>{result.net?.toLocaleString()} {currency}</span></div>
        </div>
      )}
      <button className="btn btn-primary w-full" onClick={onClose}>Done</button>
    </div>
  )

  return (
    <div>
      <h3 className="text-lg font-bold mb-4">💸 Withdraw Funds</h3>

      <div className="space-y-4">
        <div className="form-control">
          <label className="label"><span className="label-text">Currency</span></label>
          <select
            className="select select-bordered"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          >
            {wallets.map((w) => {
              const info = CURRENCIES[w.currency]
              return (
                <option key={w.currency} value={w.currency}>
                  {info?.flag} {w.currency} — Balance: {info?.symbol}{w.available_balance.toLocaleString()}
                </option>
              )
            })}
          </select>
        </div>

        {wallet && (
          <div className="bg-base-200 rounded-lg p-3 text-sm">
            Available: <span className="font-bold">{currencyInfo?.symbol}{wallet.available_balance.toLocaleString()}</span>
          </div>
        )}

        <div className="form-control">
          <label className="label">
            <span className="label-text">Amount ({currency})</span>
            {wallet && (
              <button
                className="label-text-alt btn btn-ghost btn-xs"
                onClick={() => setAmount(wallet.available_balance.toString())}
              >
                Max
              </button>
            )}
          </label>
          <input
            type="number"
            className="input input-bordered"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="form-control">
          <label className="label">
            <span className="label-text">Phone Number</span>
            <span className="label-text-alt text-base-content/50">{currencyInfo?.providers[0]?.toUpperCase()}</span>
          </label>
          <input
            type="tel"
            className="input input-bordered"
            placeholder={currency === 'KES' ? '+254700000000' : currency === 'UGX' ? '+256700000000' : '+255700000000'}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {amountNum > 0 && (
          <div className="bg-base-200 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between text-base-content/60">
              <span>Platform fee ({Math.round(feeRate * 100)}%)</span>
              <span>- {fee.toLocaleString()} {currency}</span>
            </div>
            <div className="flex justify-between font-bold border-t border-base-300 pt-1">
              <span>You receive</span>
              <span className="text-success">{net.toLocaleString()} {currency}</span>
            </div>
          </div>
        )}

        {result?.success === false && (
          <div className="alert alert-error text-sm py-2">{result.message}</div>
        )}

        <button
          className={`btn btn-primary w-full ${loading ? 'loading' : ''}`}
          disabled={loading || !amount || !phone || amountNum <= 0}
          onClick={handleSubmit}
        >
          Withdraw {amountNum > 0 ? `${amountNum.toLocaleString()} ${currency}` : ''}
        </button>

        <p className="text-xs text-base-content/40 text-center">
          Withdrawals are processed within 5 minutes during business hours.
        </p>
      </div>
    </div>
  )
}
