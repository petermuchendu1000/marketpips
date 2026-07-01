// app/api/webhooks/mpesa-b2c/route.ts — M-Pesa B2C disbursement result
//
// Safaricom POSTs the payout outcome to the ResultURL after a B2C request.
// We match it to the pending withdrawal by the ConversationID we stored as
// provider_reference, then funnel through the idempotent complete/fail RPCs:
//   ResultCode 0  → complete_withdrawal (release reserve, tally withdrawn)
//   ResultCode !0 → fail_withdrawal     (refund the reserve)
// Duplicate results are no-ops. We always answer {ResultCode:0} so Safaricom
// stops retrying.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseMpesaB2CResult } from '@/lib/payments/mpesa'
import { completeWithdrawal, failWithdrawal } from '@/lib/payments/withdraw'

const ACCEPTED = { ResultCode: 0, ResultDesc: 'Accepted' }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const admin = await createAdminClient()
    const result = parseMpesaB2CResult(body)

    const reference = result.conversationId
    if (!reference) {
      console.error('M-Pesa B2C result: missing ConversationID')
      return NextResponse.json(ACCEPTED)
    }

    const { data: withdrawal } = await admin
      .from('withdrawals')
      .select('id, status')
      .eq('provider_reference', reference)
      .maybeSingle()

    if (!withdrawal) {
      console.error('M-Pesa B2C result: withdrawal not found for', reference)
      return NextResponse.json(ACCEPTED)
    }

    if (result.success) {
      await completeWithdrawal(admin, {
        withdrawalId: withdrawal.id,
        providerReference: result.transactionId ?? reference,
        providerReceipt: result.transactionReceipt ?? null,
        rawResponse: body,
      })
    } else {
      await failWithdrawal(
        admin,
        withdrawal.id,
        result.resultDesc || 'M-Pesa B2C disbursement failed',
        body,
      )
    }

    return NextResponse.json(ACCEPTED)
  } catch (error) {
    console.error('M-Pesa B2C webhook error:', error)
    return NextResponse.json(ACCEPTED)
  }
}
