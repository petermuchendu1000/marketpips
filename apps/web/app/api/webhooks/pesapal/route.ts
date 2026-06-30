// app/api/webhooks/pesapal/route.ts — PesaPal v3 IPN handler
//
// PesaPal calls this URL (GET by default) with OrderTrackingId +
// OrderMerchantReference whenever a transaction's status changes. The IPN
// payload is NOT signed and its status is NOT trusted — we ALWAYS re-query
// GetTransactionStatus server→server for the authoritative result, then credit
// atomically + idempotently via the shared helper.
//
// PesaPal expects a specific JSON acknowledgement so it stops retrying.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parsePesaPalIpn, getPesaPalStatus } from '@/lib/payments/pesapal'
import { creditDeposit, failDeposit } from '@/lib/payments/credit'
import type { CurrencyCode } from '@/types'

async function handle(
  orderTrackingId: string | undefined,
  merchantReference: string | undefined,
  notificationType: string | undefined,
) {
  const ack = {
    orderNotificationType: notificationType || 'IPNCHANGE',
    orderTrackingId: orderTrackingId || '',
    orderMerchantReference: merchantReference || '',
    status: 200,
  }

  if (!orderTrackingId) return ack

  const adminClient = await createAdminClient()

  // Locate the deposit: merchant_reference is our deposit id; fall back to the
  // stored order tracking id.
  let deposit:
    | { id: string; status: string | null; amount: number; currency: string }
    | null = null

  if (merchantReference) {
    const { data } = await adminClient
      .from('deposits')
      .select('id, status, amount, currency')
      .eq('id', merchantReference)
      .maybeSingle()
    deposit = data
  }
  if (!deposit) {
    const { data } = await adminClient
      .from('deposits')
      .select('id, status, amount, currency')
      .eq('pesapal_order_id', orderTrackingId)
      .maybeSingle()
    deposit = data
  }

  if (!deposit) {
    console.error('PesaPal IPN: deposit not found', { orderTrackingId, merchantReference })
    return ack
  }

  // Authoritative status check.
  const live = await getPesaPalStatus(orderTrackingId)

  if (live.status === 'COMPLETED') {
    await creditDeposit(adminClient, {
      depositId: deposit.id,
      amount: Number(deposit.amount),
      currency: deposit.currency as CurrencyCode,
      providerReceipt: live.confirmationCode ?? orderTrackingId,
      rawCallback: live.raw,
      idempotencyKey: `pesapal_${orderTrackingId}`,
    })
  } else if (live.status === 'FAILED' || live.status === 'INVALID' || live.status === 'REVERSED') {
    await failDeposit(adminClient, deposit.id, `PesaPal ${live.status}`, live.raw)
  }
  // PENDING → no-op.

  return ack
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const { orderTrackingId, merchantReference, notificationType } = parsePesaPalIpn({
      query: searchParams,
    })
    return NextResponse.json(await handle(orderTrackingId, merchantReference, notificationType))
  } catch (error) {
    console.error('PesaPal IPN (GET) error:', error)
    return NextResponse.json({ status: 500 }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { searchParams } = new URL(req.url)
    const { orderTrackingId, merchantReference, notificationType } = parsePesaPalIpn({
      query: searchParams,
      body,
    })
    return NextResponse.json(await handle(orderTrackingId, merchantReference, notificationType))
  } catch (error) {
    console.error('PesaPal IPN (POST) error:', error)
    return NextResponse.json({ status: 500 }, { status: 200 })
  }
}
