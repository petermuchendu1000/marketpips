// POST /api/admin/payouts/items/[id]/clawback — reverse a paid payout item
// (chargeback/refund/fraud). For credited items this debits the wallet and
// writes a reversing transaction; for statements it records the correction.
// Requires payouts:run; audited in the RPC.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.object({ reason: z.string().min(3).max(1000) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const guard = await requireCapability('payouts:run')
  if (!guard.ok) return guard.response

  const { data, error } = await guard.ctx.supabase.rpc('admin_clawback_payout_item' as never, {
    p_item_id: id,
    p_reason: parsed.data.reason,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
