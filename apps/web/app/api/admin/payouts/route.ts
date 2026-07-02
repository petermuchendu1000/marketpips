// POST /api/admin/payouts — create a payout run for a period.
// Requires payouts:run; audited in the RPC.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

const schema = z.object({
  kind: z.enum(['creator', 'marketer']),
  period_start: dateStr,
  period_end: dateStr,
  notes: z.string().max(1000).optional(),
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const b = parsed.data

  const guard = await requireCapability('payouts:run')
  if (!guard.ok) return guard.response

  const { data, error } = await guard.ctx.supabase.rpc('admin_create_payout_run' as never, {
    p_kind: b.kind,
    p_period_start: b.period_start,
    p_period_end: b.period_end,
    p_notes: b.notes ?? null,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
