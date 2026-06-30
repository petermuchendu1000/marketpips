// app/api/webhooks/airtel/route.ts — Airtel Money collection callback
//
// Idempotent + atomic via the shared creditDeposit()/failDeposit() helpers.
// Airtel echoes our deposit reference in transaction.id and reports
// status_code (TS=success, TF=failed). We re-query the live status to confirm
// before crediting (defence against spoofed callbacks).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseAirtelCallback, airtelTransactionStatus } from '@/lib/payments/airtel-money'
import { creditDeposit, failDeposit } from '@/lib/payments/credit'
import type { CurrencyCode } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const adminClient = await createAdminClient()
    const parsed = parseAirtelCallback(body)

    const reference = parsed.reference || new URL(req.url).searchParams.get('ref') || undefined
    if (!reference) {
      return NextResponse.json({ received: true })
    }

    const { data: deposit } = await adminClient
      .from('deposits')
      .select('id, status, amount, currency, phone_number')
      .eq('airtel_reference', reference)
      .maybeSingle()

    if (!deposit) {
      console.error('Airtel callback: deposit not found for', reference)
      return NextResponse.json({ received: true })
    }

    // Confirm with the provider rather than trusting the callback body.
    let success = parsed.success
    let failed = parsed.failed
    let airtelMoneyId = parsed.airtelMoneyId
    try {
      const live = await airtelTransactionStatus(reference)
      success = live.status === 'TS'
      failed = live.status === 'TF'
      airtelMoneyId = live.airtelMoneyId ?? airtelMoneyId
    } catch {
      // Fall back to parsed callback if the status query is unavailable.
    }

    if (success) {
      await creditDeposit(adminClient, {
        depositId: deposit.id,
        amount: Number(deposit.amount),
        currency: deposit.currency as CurrencyCode,
        providerReceipt: airtelMoneyId ?? reference,
        rawCallback: body,
        idempotencyKey: `airtel_${airtelMoneyId || reference}`,
      })
    } else if (failed) {
      await failDeposit(adminClient, deposit.id, parsed.message || 'Airtel Money payment failed', body)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Airtel webhook error:', error)
    return NextResponse.json({ received: true })
  }
}
