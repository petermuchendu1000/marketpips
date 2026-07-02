// POST /api/admin/creators/[id]/action — creator lifecycle operations.
//
// approve     -> promote user->creator + create/reactivate profile
// update      -> tier / reward override / auto_publish / max_open_markets
// set_status  -> active | suspended | revoked (revoke demotes to user)
//
// All require creators:manage and are audited inside the RPC. `id` is the
// target user's profile id.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    tier: z.string().min(1).max(40).default('bronze'),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('update'),
    tier: z.string().min(1).max(40).nullable().optional(),
    reward_pct: z.number().min(0).max(1).nullable().optional(),
    auto_publish: z.boolean().nullable().optional(),
    max_open_markets: z.number().int().min(0).max(100000).nullable().optional(),
  }),
  z.object({
    action: z.literal('set_status'),
    status: z.enum(['active', 'suspended', 'revoked']),
    reason: z.string().max(1000).optional(),
  }),
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const guard = await requireCapability('creators:manage')
  if (!guard.ok) return guard.response
  const sb = guard.ctx.supabase

  let rpc: string
  let args: Record<string, unknown>
  switch (body.action) {
    case 'approve':
      rpc = 'admin_approve_creator'
      args = { p_user_id: id, p_tier: body.tier, p_notes: body.notes ?? null }
      break
    case 'update':
      rpc = 'admin_update_creator'
      args = {
        p_user_id: id,
        p_tier: body.tier ?? null,
        p_reward_pct: body.reward_pct ?? null,
        p_auto_publish: body.auto_publish ?? null,
        p_max_open_markets: body.max_open_markets ?? null,
      }
      break
    case 'set_status':
      rpc = 'admin_set_creator_status'
      args = { p_user_id: id, p_status: body.status, p_reason: body.reason ?? null }
      break
  }

  const { data, error } = await sb.rpc(rpc as never, args as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
