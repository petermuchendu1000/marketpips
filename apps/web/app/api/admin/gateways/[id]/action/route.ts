// POST /api/admin/gateways/[id]/action — enable / disable / delete a gateway.
//
// enable/disable -> admin_set_gateway_enabled ; delete -> admin_delete_gateway.
// Requires gateways:write; both RPCs self-check the capability and audit.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.object({ action: z.enum(['enable', 'disable', 'delete']) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const guard = await requireCapability('gateways:write')
  if (!guard.ok) return guard.response
  const sb = guard.ctx.supabase

  if (parsed.data.action === 'delete') {
    const { data, error } = await sb.rpc('admin_delete_gateway', { p_id: id })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, data })
  }

  const { data, error } = await sb.rpc('admin_set_gateway_enabled', {
    p_id: id,
    p_enabled: parsed.data.action === 'enable',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
