// app/api/webhooks/mtn-momo/route.ts - MTN MoMo callback
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const adminClient = await createAdminClient()

    const { searchParams } = new URL(req.url)
    const referenceId = searchParams.get('ref') || body.externalId

    const isSuccess = body.status === 'SUCCESSFUL'
    const isFailed = body.status === 'FAILED'

    if (!isSuccess && !isFailed) {
      // Still pending
      return NextResponse.json({ received: true })
    }

    const { data: deposit } = await adminClient
      .from('deposits')
      .select('*, wallets(available_balance)')
      .eq('mtn_reference_id', referenceId)
      .single()

    if (!deposit || deposit.status === 'completed') {
      return NextResponse.json({ received: true })
    }

    if (isFailed) {
      await adminClient.from('deposits').update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        failure_reason: body.reason || 'MTN MoMo payment failed',
        raw_callback: body,
      }).eq('id', deposit.id)
      return NextResponse.json({ received: true })
    }

    const { data: rateData } = await adminClient
      .from('exchange_rates')
      .select('rate')
      .eq('from_currency', deposit.currency)
      .eq('to_currency', 'USD')
      .single()

    const exchangeRate = rateData?.rate || 0.000267
    const amountUsd = deposit.amount * exchangeRate
    const currentBalance = deposit.wallets?.available_balance || 0

    await adminClient.from('deposits').update({
      status: 'completed',
      confirmed_at: new Date().toISOString(),
      provider_receipt: body.financialTransactionId,
      raw_callback: body,
    }).eq('id', deposit.id)

    await adminClient.from('wallets').update({
      available_balance: currentBalance + deposit.amount,
    }).eq('id', deposit.wallet_id)

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
      payment_reference: body.financialTransactionId,
      payment_provider: 'mtn_momo',
      payment_phone: deposit.phone_number,
      payment_metadata: body,
      description: 'MTN MoMo deposit',
      completed_at: new Date().toISOString(),
      initiated_at: new Date().toISOString(),
      idempotency_key: `mtn_${referenceId}`,
    })

    await adminClient.from('notifications').insert({
      user_id: deposit.user_id,
      type: 'deposit_completed',
      title: '✅ Deposit Confirmed',
      body: `${deposit.amount.toLocaleString()} ${deposit.currency} added to your account via MTN MoMo.`,
      data: { amount: deposit.amount, currency: deposit.currency },
    })

    return NextResponse.json({ received: true })

  } catch (error) {
    console.error('MTN MoMo webhook error:', error)
    return NextResponse.json({ received: true })
  }
}
