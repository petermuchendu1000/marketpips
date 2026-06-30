// app/api/webhooks/mpesa/route.ts - M-Pesa STK callback
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseMpesaCallback } from '@/lib/payments/mpesa'
import { getUsdRate, localToUsd } from '@/lib/currency'
import type { CurrencyCode } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const adminClient = await createAdminClient()

    // Get deposit_id from query params (we pass it in callback URL)
    const { searchParams } = new URL(req.url)
    const depositId = searchParams.get('deposit_id')

    // Parse callback
    const result = parseMpesaCallback(body)

    if (!result.success) {
      // Payment failed or cancelled
      await adminClient
        .from('deposits')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          failure_reason: result.resultDesc,
          raw_callback: body,
        })
        .eq('checkout_request_id', result.checkoutRequestId)

      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    // Payment successful - find deposit
    const { data: deposit } = await adminClient
      .from('deposits')
      .select('*, wallets(user_id, currency, available_balance)')
      .eq('checkout_request_id', result.checkoutRequestId)
      .single()

    if (!deposit) {
      console.error('M-Pesa callback: deposit not found for', result.checkoutRequestId)
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    if (deposit.status === 'completed') {
      // Already processed (idempotency)
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    }

    const { data: rateData } = await adminClient
      .from('exchange_rates')
      .select('rate')
      .eq('from_currency', deposit.currency)
      .eq('to_currency', 'USD')
      .single()

    // Canonical FX — live rate wins, else currency-correct last-known-good.
    // (Was `|| 0.00775`, which silently priced every non-KES deposit as KES.)
    const _liveRate = rateData?.rate != null ? Number(rateData.rate) : undefined
    const _rateMap = _liveRate ? { [deposit.currency as CurrencyCode]: _liveRate } : undefined
    const exchangeRate = getUsdRate(deposit.currency as CurrencyCode, _rateMap)
    const amountUsd = localToUsd(deposit.amount, deposit.currency as CurrencyCode, _rateMap)

    // Use a DB transaction-like approach: update deposit + wallet + create transaction
    // Mark deposit as complete
    await adminClient
      .from('deposits')
      .update({
        status: 'completed',
        confirmed_at: new Date().toISOString(),
        provider_receipt: result.mpesaReceiptNumber,
        exchange_rate_to_usd: exchangeRate,
        raw_callback: body,
      })
      .eq('id', deposit.id)

    // Credit wallet
    const currentBalance = deposit.wallets?.available_balance || 0
    await adminClient
      .from('wallets')
      .update({
        available_balance: currentBalance + deposit.amount,
        total_deposited: currentBalance + deposit.amount, // simplified
      })
      .eq('id', deposit.wallet_id)

    // Create transaction record
    await adminClient.from('transactions').insert({
      user_id: deposit.user_id,
      wallet_id: deposit.wallet_id,
      type: 'deposit',
      status: 'completed',
      amount: deposit.amount,
      currency: deposit.currency,
      amount_usd: amountUsd,
      exchange_rate_to_usd: exchangeRate,
      balance_before: currentBalance,
      balance_after: currentBalance + deposit.amount,
      payment_reference: result.mpesaReceiptNumber,
      payment_provider: 'mpesa',
      payment_phone: deposit.phone_number,
      payment_metadata: body,
      description: 'M-Pesa deposit',
      completed_at: new Date().toISOString(),
      initiated_at: new Date().toISOString(),
      idempotency_key: `mpesa_${result.mpesaReceiptNumber}`,
    })

    // Create notification
    await adminClient.from('notifications').insert({
      user_id: deposit.user_id,
      type: 'deposit_completed',
      title: '✅ Deposit Confirmed',
      body: `${deposit.amount.toLocaleString()} ${deposit.currency} has been added to your account. Receipt: ${result.mpesaReceiptNumber}`,
      data: {
        amount: deposit.amount,
        currency: deposit.currency,
        receipt: result.mpesaReceiptNumber,
      },
    })

    console.log(`✅ M-Pesa deposit confirmed: ${deposit.amount} ${deposit.currency} for user ${deposit.user_id}`)

    // M-Pesa requires this exact response
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })

  } catch (error) {
    console.error('M-Pesa webhook error:', error)
    // Always return success to M-Pesa to prevent retries
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }
}
