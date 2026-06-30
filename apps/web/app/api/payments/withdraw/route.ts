import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { processWithdrawal } from '@/lib/payments'
import type { CurrencyCode, PaymentProvider } from '@/types'

const WithdrawSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(['KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'ETB', 'BIF', 'USD']),
  phone_number: z.string().min(10).max(20),
  provider: z.enum(['mpesa', 'mtn_momo', 'airtel_money', 'pesapal', 'bank_transfer', 'internal']),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = WithdrawSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { amount, currency, phone_number, provider } = parsed.data

  // Get profile (for KYC check)
  const { data: profile } = await supabase
    .from('profiles')
    .select('kyc_status, account_status')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 400 })
  }

  if (profile.account_status !== 'active') {
    return NextResponse.json({ error: 'Account is suspended' }, { status: 403 })
  }

  // Check KYC for larger withdrawals
  const { data: exchangeRate } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('from_currency', currency)
    .eq('to_currency', 'USD')
    .single()

  const amountUSD = amount * (exchangeRate?.rate || 0.01)
  if (amountUSD > 100 && profile.kyc_status !== 'verified') {
    return NextResponse.json({
      error: 'KYC verification required for withdrawals over $100. Please verify your identity first.',
      kyc_required: true,
    }, { status: 403 })
  }

  // Check wallet balance
  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .eq('currency', currency)
    .single()

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet not found' }, { status: 400 })
  }

  // Calculate fee (1% for mobile money, 0.5% for bank)
  const feeRate = provider === 'bank_transfer' ? 0.005 : 0.01
  const feeAmount = Math.ceil(amount * feeRate)
  const netAmount = amount - feeAmount

  const availableBalance = wallet.available_balance ?? 0
  const reservedBalance = wallet.reserved_balance ?? 0
  const totalWithdrawn = wallet.total_withdrawn ?? 0

  if (availableBalance < amount) {
    return NextResponse.json({
      error: `Insufficient balance. Available: ${availableBalance.toLocaleString()} ${currency}`,
    }, { status: 400 })
  }

  // Minimum withdrawal
  const minimums: Record<string, number> = {
    KES: 100, UGX: 5000, TZS: 2000, RWF: 500, ZMW: 10, ETB: 100, BIF: 2000, USD: 5,
  }
  if (amount < (minimums[currency] || 5)) {
    return NextResponse.json({ error: `Minimum withdrawal is ${minimums[currency]} ${currency}` }, { status: 400 })
  }

  // Deduct balance immediately (reserve)
  const { error: deductError } = await supabase
    .from('wallets')
    .update({
      available_balance: availableBalance - amount,
      reserved_balance: reservedBalance + amount,
    })
    .eq('id', wallet.id)

  if (deductError) {
    return NextResponse.json({ error: 'Failed to reserve balance' }, { status: 500 })
  }

  // Create withdrawal record
  const requiresReview = amountUSD > 500
  const { data: withdrawal, error: wErr } = await supabase
    .from('withdrawals')
    .insert({
      user_id: user.id,
      wallet_id: wallet.id,
      status: 'pending',
      provider,
      amount,
      currency,
      phone_number,
      exchange_rate_to_usd: exchangeRate?.rate || 0.01,
      fee_amount: feeAmount,
      requires_review: requiresReview,
      initiated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (wErr || !withdrawal) {
    // Rollback balance
    await supabase.from('wallets').update({
      available_balance: availableBalance,
      reserved_balance: reservedBalance,
    }).eq('id', wallet.id)
    return NextResponse.json({ error: 'Failed to create withdrawal' }, { status: 500 })
  }

  // Create transaction record
  await supabase.from('transactions').insert({
    user_id: user.id,
    wallet_id: wallet.id,
    type: 'withdrawal',
    status: 'pending',
    amount,
    currency,
    amount_usd: amountUSD,
    exchange_rate_to_usd: exchangeRate?.rate || 0.01,
    fee_amount: feeAmount,
    fee_currency: currency,
    balance_before: availableBalance,
    balance_after: availableBalance - amount,
    payment_provider: provider,
    payment_phone: phone_number,
    description: `Withdrawal via ${provider}`,
    idempotency_key: `withdraw_${withdrawal.id}`,
    initiated_at: new Date().toISOString(),
  })

  // For amounts not requiring review, process immediately
  if (!requiresReview) {
    try {
      const result = await processWithdrawal(provider as PaymentProvider, {
        amount: netAmount,
        currency: currency as CurrencyCode,
        phone: phone_number,
        reference: withdrawal.id,
      })

      if (result.success) {
        await supabase.from('withdrawals').update({
          status: 'completed',
          provider_reference: result.reference,
          provider_receipt: result.receipt,
          completed_at: new Date().toISOString(),
          raw_response: result.raw as any,
        }).eq('id', withdrawal.id)

        await supabase.from('wallets').update({
          available_balance: availableBalance - amount, // already deducted
          reserved_balance: reservedBalance,           // release reserve
          total_withdrawn: totalWithdrawn + amount,
        }).eq('id', wallet.id)

        await supabase.from('transactions').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          provider_reference: result.reference,
          payment_reference: result.receipt,
        }).eq('idempotency_key', `withdraw_${withdrawal.id}`)

        await supabase.from('notifications').insert({
          user_id: user.id,
          type: 'withdrawal_completed',
          title: '✅ Withdrawal Successful',
          body: `${netAmount.toLocaleString()} ${currency} has been sent to ${phone_number}. Receipt: ${result.receipt || withdrawal.id}`,
          data: { withdrawal_id: withdrawal.id },
        })

        return NextResponse.json({
          success: true,
          withdrawal_id: withdrawal.id,
          status: 'completed',
          message: `${netAmount.toLocaleString()} ${currency} has been sent to ${phone_number}.`,
          receipt: result.receipt,
        })
      }
    } catch (e) {
      // Provider failed — leave as pending for manual retry
      console.error('Withdrawal provider error:', e)
    }
  }

  // Notification
  await supabase.from('notifications').insert({
    user_id: user.id,
    type: 'withdrawal_completed',
    title: requiresReview ? '⏳ Withdrawal Under Review' : '💸 Withdrawal Processing',
    body: requiresReview
      ? `Your withdrawal of ${amount.toLocaleString()} ${currency} is under review. Funds will arrive within 24 hours.`
      : `Your withdrawal of ${netAmount.toLocaleString()} ${currency} is being processed.`,
    data: { withdrawal_id: withdrawal.id },
  })

  return NextResponse.json({
    success: true,
    withdrawal_id: withdrawal.id,
    status: requiresReview ? 'under_review' : 'processing',
    message: requiresReview
      ? `Withdrawal under review. Funds will arrive within 24 hours.`
      : `Processing ${netAmount.toLocaleString()} ${currency} to ${phone_number}.`,
    fee: feeAmount,
    net_amount: netAmount,
  })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ withdrawals: data || [] })
}
