// app/api/webhooks/mtn-disbursement/route.ts — MTN MoMo disbursement result
//
// MTN calls this callback with the transfer outcome after a disbursement.
// We match it to the pending withdrawal by the X-Reference-Id we stored as
// provider_reference, then funnel through the idempotent complete/fail RPCs:
//   status SUCCESSFUL → complete_withdrawal (release reserve)
//   status FAILED     → fail_withdrawal     (refund the reserve)
// Anything else is still pending → no-op (MTN will call again).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { completeWithdrawal, failWithdrawal } from '@/lib/payments/withdraw'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const admin = await createAdminClient()

    const { searchParams } = new URL(req.url)
    const reference =
      searchParams.get('ref') ||
      (body.referenceId as string | undefined) ||
      (body.externalId as string | undefined)

    if (!reference) {
      console.error('MTN disbursement result: missing reference')
      return NextResponse.json({ received: true })
    }

    const { data: withdrawal } = await admin
      .from('withdrawals')
      .select('id, status')
      .eq('provider_reference', reference)
      .maybeSingle()

    if (!withdrawal) {
      console.error('MTN disbursement result: withdrawal not found for', reference)
      return NextResponse.json({ received: true })
    }

    const status = body.status as string | undefined
    const financialTransactionId = body.financialTransactionId as string | undefined
    const reason = body.reason as string | undefined

    if (status === 'SUCCESSFUL') {
      await completeWithdrawal(admin, {
        withdrawalId: withdrawal.id,
        providerReference: reference,
        providerReceipt: financialTransactionId ?? null,
        rawResponse: body,
      })
    } else if (status === 'FAILED') {
      await failWithdrawal(
        admin,
        withdrawal.id,
        reason || 'MTN MoMo disbursement failed',
        body,
      )
    }
    // else still pending → no-op.

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('MTN disbursement webhook error:', error)
    return NextResponse.json({ received: true })
  }
}
