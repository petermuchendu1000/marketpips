// app/api/webhooks/mpesa/route.ts — M-Pesa STK (Lipa na M-Pesa) callback
//
// Idempotent + atomic: parses the STK callback, then funnels success through
// the shared creditDeposit() helper (credit_deposit RPC) and failures through
// failDeposit(). Retried callbacks are no-ops. We always answer M-Pesa with
// {ResultCode:0} so Safaricom stops retrying.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseMpesaCallback } from '@/lib/payments/mpesa'
import { creditDeposit, failDeposit } from '@/lib/payments/credit'
import type { CurrencyCode } from '@/types'

const ACCEPTED = { ResultCode: 0, ResultDesc: 'Accepted' }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const adminClient = await createAdminClient()
    const result = parseMpesaCallback(body)

    // Locate the deposit by the checkout request id M-Pesa echoes back.
    const { data: deposit } = await adminClient
      .from('deposits')
      .select('id, status, amount, currency')
      .eq('checkout_request_id', result.checkoutRequestId)
      .maybeSingle()

    if (!deposit) {
      console.error('M-Pesa callback: deposit not found for', result.checkoutRequestId)
      return NextResponse.json(ACCEPTED)
    }

    if (!result.success) {
      // Payment failed / cancelled by user.
      await failDeposit(adminClient, deposit.id, result.resultDesc || 'M-Pesa payment failed', body)
      return NextResponse.json(ACCEPTED)
    }

    // Success → atomic, idempotent credit. Idempotency key is the unique
    // M-Pesa receipt so duplicate callbacks collide and are rejected.
    await creditDeposit(adminClient, {
      depositId: deposit.id,
      amount: Number(deposit.amount),
      currency: deposit.currency as CurrencyCode,
      providerReceipt: result.mpesaReceiptNumber ?? null,
      rawCallback: body,
      idempotencyKey: `mpesa_${result.mpesaReceiptNumber || result.checkoutRequestId}`,
    })

    return NextResponse.json(ACCEPTED)
  } catch (error) {
    console.error('M-Pesa webhook error:', error)
    // Always 200 to M-Pesa to prevent infinite retries; we log for ops.
    return NextResponse.json(ACCEPTED)
  }
}
