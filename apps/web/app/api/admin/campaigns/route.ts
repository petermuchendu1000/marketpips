// POST /api/admin/campaigns — create/edit a promo campaign (id null = create).
// Requires marketers:manage; audited in the RPC.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.object({
  id: z.string().uuid().nullable().optional(),
  code: z.string().min(2).max(40),
  label: z.string().min(1).max(120),
  marketer_id: z.string().uuid().nullable().optional(),
  kind: z.enum(['deposit_bonus', 'fee_discount']),
  value_pct: z.number().min(0).max(100),
  max_value_usd: z.number().min(0).nullable().optional(),
  budget_usd: z.number().min(0).nullable().optional(),
  max_redemptions: z.number().int().min(0).nullable().optional(),
  per_user_limit: z.number().int().min(0).default(1),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const b = parsed.data

  const guard = await requireCapability('marketers:manage')
  if (!guard.ok) return guard.response

  const { data, error } = await guard.ctx.supabase.rpc('admin_upsert_campaign' as never, {
    p_id: b.id ?? null,
    p_code: b.code,
    p_label: b.label,
    p_marketer_id: b.marketer_id ?? null,
    p_kind: b.kind,
    p_value_pct: b.value_pct,
    p_max_value_usd: b.max_value_usd ?? null,
    p_budget_usd: b.budget_usd ?? null,
    p_max_redemptions: b.max_redemptions ?? null,
    p_per_user_limit: b.per_user_limit,
    p_starts_at: b.starts_at ?? null,
    p_ends_at: b.ends_at ?? null,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
