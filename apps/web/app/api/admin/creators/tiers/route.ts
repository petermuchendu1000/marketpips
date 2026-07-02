// POST /api/admin/creators/tiers — create/edit a creator tier. Requires
// creators:manage; audited in the RPC.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  reward_pct: z.number().min(0).max(1),
  max_open_markets: z.number().int().min(0).max(100000).default(5),
  auto_publish: z.boolean().default(false),
  sort_order: z.number().int().default(100),
  is_active: z.boolean().default(true),
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const b = parsed.data

  const guard = await requireCapability('creators:manage')
  if (!guard.ok) return guard.response

  const { data, error } = await guard.ctx.supabase.rpc('admin_upsert_creator_tier' as never, {
    p_key: b.key,
    p_label: b.label,
    p_reward_pct: b.reward_pct,
    p_max_open_markets: b.max_open_markets,
    p_auto_publish: b.auto_publish,
    p_sort_order: b.sort_order,
    p_is_active: b.is_active,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
