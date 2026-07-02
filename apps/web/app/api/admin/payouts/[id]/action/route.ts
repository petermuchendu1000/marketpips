// POST /api/admin/payouts/[id]/action — payout run state-machine actions.
//
// compute  -> (re)derive items for the period
// approve  -> lock a computed run
// disburse -> credit marketer wallets / mark creator statements paid
// cancel   -> drop items and cancel (before disbursement)
//
// All require payouts:run and are audited inside the RPC.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('compute') }),
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('disburse') }),
  z.object({ action: z.literal('cancel'), reason: z.string().max(1000).optional() }),
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const guard = await requireCapability('payouts:run')
  if (!guard.ok) return guard.response
  const sb = guard.ctx.supabase

  let rpc: string
  let args: Record<string, unknown>
  switch (body.action) {
    case 'compute':
      rpc = 'admin_compute_payout_run'
      args = { p_run_id: id }
      break
    case 'approve':
      rpc = 'admin_approve_payout_run'
      args = { p_run_id: id }
      break
    case 'disburse':
      rpc = 'admin_disburse_payout_run'
      args = { p_run_id: id }
      break
    case 'cancel':
      rpc = 'admin_cancel_payout_run'
      args = { p_run_id: id, p_reason: body.reason ?? null }
      break
  }

  const { data, error } = await sb.rpc(rpc as never, args as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
