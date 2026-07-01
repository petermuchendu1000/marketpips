// POST /api/admin/finance/deposits/[id]/action — deposit reconciliation.
//
// fail -> cancel a stuck/expired deposit (admin_fail_deposit; safe, no money
// moves). The credit path stays the atomic idempotent credit_deposit invoked by
// the provider webhooks — we do NOT expose manual credit here to avoid FX/rate
// ambiguity; a stuck-but-paid deposit is reconciled by re-driving the webhook.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.object({
  action: z.literal('fail'),
  reason: z.string().min(3).max(1000),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const guard = await requireCapability('finance:deposits')
  if (!guard.ok) return guard.response

  const { data, error } = await guard.ctx.supabase.rpc('admin_fail_deposit' as never, {
    p_deposit_id: id,
    p_reason: parsed.data.reason,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
