// POST /api/admin/marketers/[id]/action — marketer lifecycle operations.
//
// approve      -> promote user->marketer, allocate tracking code, snapshot plan
// update_plan  -> change commission plan / hold days
// set_status   -> active | suspended | revoked (revoke demotes to user)
// regen_code   -> reissue tracking code
//
// All require marketers:manage and are audited inside the RPC. `id` = user id.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const planShape = z
  .object({
    model: z.enum(['cpa', 'revshare', 'hybrid']),
    cpa_usd: z.number().min(0).default(0),
    revshare_pct: z.number().min(0).max(100).default(0),
    hold_days: z.number().int().min(0).max(365).optional(),
  })
  .optional()

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    plan_key: z.string().min(1).max(40).nullable().optional(),
    plan: planShape,
    hold_days: z.number().int().min(0).max(365).optional(),
    notes: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('update_plan'),
    plan_key: z.string().min(1).max(40).nullable().optional(),
    plan: planShape,
    hold_days: z.number().int().min(0).max(365).nullable().optional(),
  }),
  z.object({
    action: z.literal('set_status'),
    status: z.enum(['active', 'suspended', 'revoked']),
    reason: z.string().max(1000).optional(),
  }),
  z.object({ action: z.literal('regen_code') }),
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const guard = await requireCapability('marketers:manage')
  if (!guard.ok) return guard.response
  const sb = guard.ctx.supabase

  let rpc: string
  let args: Record<string, unknown>
  switch (body.action) {
    case 'approve':
      rpc = 'admin_approve_marketer'
      args = {
        p_user_id: id,
        p_plan_key: body.plan_key ?? null,
        p_plan: body.plan ?? null,
        p_hold_days: body.hold_days ?? 0,
        p_notes: body.notes ?? null,
      }
      break
    case 'update_plan':
      rpc = 'admin_update_marketer_plan'
      args = {
        p_user_id: id,
        p_plan_key: body.plan_key ?? null,
        p_plan: body.plan ?? null,
        p_hold_days: body.hold_days ?? null,
      }
      break
    case 'set_status':
      rpc = 'admin_set_marketer_status'
      args = { p_user_id: id, p_status: body.status, p_reason: body.reason ?? null }
      break
    case 'regen_code':
      rpc = 'admin_regenerate_tracking_code'
      args = { p_user_id: id }
      break
  }

  const { data, error } = await sb.rpc(rpc as never, args as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
