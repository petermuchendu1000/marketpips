// POST /api/admin/announcements/[id] — send now, or cancel an announcement.
//
// send   -> admin_send_announcement (materialises recipients, dispatches, audits)
// cancel -> admin_set_announcement_status(id,'cancelled')
// Capability `announcements:send`. `id` is the announcement id.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({ action: z.literal('cancel') }),
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const guard = await requireCapability('announcements:send')
  if (!guard.ok) return guard.response
  const sb = guard.ctx.supabase

  const { data, error } =
    body.action === 'send'
      ? await sb.rpc('admin_send_announcement', { p_id: id })
      : await sb.rpc('admin_set_announcement_status', { p_id: id, p_status: 'cancelled' })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
