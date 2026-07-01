// app/api/webhooks/airtel-disbursement/route.ts — Airtel Money disbursement result
//
// Airtel calls this callback with the payout outcome. We match it to the
// pending withdrawal by the transaction id we stored as provider_reference,
// re-query the authoritative status (defence against spoofed callbacks), then
// funnel through the idempotent complete/fail RPCs:
//   status_code TS → complete_withdrawal (release reserve)
//   status_code TF → fail_withdrawal     (refund the reserve)
// Unknown codes are still pending → no-op.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseAirtelCallback, airtelTransactionStatus } from '@/lib/payments/airtel-money'
import { completeWithdrawal, failWithdrawal } from '@/lib/payments/withdraw'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const admin = await createAdminClient()
    const parsed = parseAirtelCallback(body)

    const reference = parsed.reference || new URL(req.url).searchParams.get('ref') || undefined
    if (!reference) {
      console.error('Airtel disbursement result: missing reference')
      return NextResponse.json({ received: true })
    }

    const { data: withdrawal } = await admin
      .from('withdrawals')
      .select('id, status')
      .eq('provider_reference', reference)
      .maybeSingle()

    if (!withdrawal) {
      console.error('Airtel disbursement result: withdrawal not found for', reference)
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
      // Fall back to the parsed callback if the status query is unavailable.
    }

    if (success) {
      await completeWithdrawal(admin, {
        withdrawalId: withdrawal.id,
        providerReference: reference,
        providerReceipt: airtelMoneyId ?? null,
        rawResponse: body,
      })
    } else if (failed) {
      await failWithdrawal(
        admin,
        withdrawal.id,
        parsed.message || 'Airtel Money disbursement failed',
        body,
      )
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Airtel disbursement webhook error:', error)
    return NextResponse.json({ received: true })
  }
}
