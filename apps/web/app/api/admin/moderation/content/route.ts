// POST /api/admin/moderation/content — take down / restore reported content.
//
// Wraps the `admin_moderate_content` RPC (migration 014), which enforces
// `moderation:action`, flips markets.is_hidden / comments.is_hidden /
// profiles.account_status, and writes an audit_log row internally. This route
// is a thin, validated, capability-gated wrapper (mirrors the Phase E routes).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'
import { REPORT_ENTITY_TYPES, MODERATION_ACTIONS } from '@/lib/admin/moderation'

const schema = z.object({
  entity_type: z.enum(REPORT_ENTITY_TYPES),
  entity_id: z.string().uuid(),
  action: z.enum(MODERATION_ACTIONS),
  reason: z.string().max(1000).optional(),
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const guard = await requireCapability('moderation:action')
  if (!guard.ok) return guard.response

  const { data, error } = await guard.ctx.supabase.rpc('admin_moderate_content', {
    p_entity_type: body.entity_type,
    p_entity_id: body.entity_id,
    p_action: body.action,
    p_reason: body.reason ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
