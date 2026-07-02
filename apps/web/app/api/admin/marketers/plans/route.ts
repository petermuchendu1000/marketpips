// POST /api/admin/marketers/plans — create/edit a commission plan template.
// Requires marketers:manage; audited in the RPC.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  plan: z.object({
    model: z.enum(['cpa', 'revshare', 'hybrid']),
    cpa_usd: z.number().min(0).default(0),
    revshare_pct: z.number().min(0).max(100).default(0),
    hold_days: z.number().int().min(0).max(365).default(0),
  }),
  is_active: z.boolean().default(true),
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const b = parsed.data

  const guard = await requireCapability('marketers:manage')
  if (!guard.ok) return guard.response

  const { data, error } = await guard.ctx.supabase.rpc('admin_upsert_commission_plan' as never, {
    p_key: b.key,
    p_label: b.label,
    p_plan: b.plan,
    p_is_active: b.is_active,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
