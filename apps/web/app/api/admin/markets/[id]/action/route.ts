// POST /api/admin/markets/[id]/action — admin market lifecycle actions.
//
// A single capability-guarded dispatch endpoint for approve / reject / close /
// dispute / resolve / cancel / feature. Each maps to an audited, capability-
// checked SECURITY DEFINER RPC (migration 011). We call via the operator's
// session client (ctx.supabase) so auth.uid() is set and has_capability()
// evaluates against the real caller — defence in depth on top of this guard.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability, type Capability } from '@/lib/auth'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), reason: z.string().max(1000).optional() }),
  z.object({ action: z.literal('reject'), reason: z.string().min(3).max(1000) }),
  z.object({ action: z.literal('close'), reason: z.string().max(1000).optional() }),
  z.object({ action: z.literal('dispute'), reason: z.string().min(3).max(1000) }),
  z.object({ action: z.literal('resolve'), outcome: z.enum(['yes', 'no']), resolution_notes: z.string().min(10).max(1000) }),
  z.object({ action: z.literal('cancel'), reason: z.string().min(3).max(1000) }),
  z.object({
    action: z.literal('feature'),
    is_featured: z.boolean(),
    is_trending: z.boolean(),
    featured_order: z.number().int().min(0).max(9999).nullable().optional(),
  }),
])

// Which capability each action requires (mirrors migration 011 checks).
const CAP: Record<string, Capability> = {
  approve: 'markets:approve',
  reject: 'markets:approve',
  close: 'markets:approve',
  feature: 'markets:approve',
  dispute: 'markets:resolve',
  resolve: 'markets:resolve',
  cancel: 'markets:cancel',
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const guard = await requireCapability(CAP[body.action])
  if (!guard.ok) return guard.response
  const sb = guard.ctx.supabase

  let rpc: string
  let args: Record<string, unknown>
  switch (body.action) {
    case 'approve':
      rpc = 'admin_approve_market'
      args = { p_market_id: id, p_reason: body.reason ?? null }
      break
    case 'reject':
      rpc = 'admin_reject_market'
      args = { p_market_id: id, p_reason: body.reason }
      break
    case 'close':
      rpc = 'admin_close_market'
      args = { p_market_id: id, p_reason: body.reason ?? null }
      break
    case 'dispute':
      rpc = 'admin_dispute_market'
      args = { p_market_id: id, p_reason: body.reason }
      break
    case 'resolve':
      rpc = 'admin_resolve_market'
      args = { p_market_id: id, p_outcome: body.outcome, p_notes: body.resolution_notes }
      break
    case 'cancel':
      rpc = 'admin_cancel_market'
      args = { p_market_id: id, p_reason: body.reason }
      break
    case 'feature':
      rpc = 'admin_set_market_featured'
      args = {
        p_market_id: id,
        p_is_featured: body.is_featured,
        p_is_trending: body.is_trending,
        p_featured_order: body.featured_order ?? null,
      }
      break
  }

  const { data, error } = await sb.rpc(rpc as never, args as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
