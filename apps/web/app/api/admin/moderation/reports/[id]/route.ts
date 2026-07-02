// POST /api/admin/moderation/reports/[id] — resolve / triage a content report.
//
// Wraps `admin_resolve_report` (migration 014): moves a report through
// reviewing → actioned | dismissed, records handler + resolution note, and
// audits internally. Capability `moderation:action`. `id` is the report id.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.object({
  status: z.enum(['reviewing', 'actioned', 'dismissed']),
  resolution: z
    .enum(['taken_down', 'restored', 'warned', 'no_action'])
    .nullable()
    .optional(),
  note: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const guard = await requireCapability('moderation:action')
  if (!guard.ok) return guard.response

  const { data, error } = await guard.ctx.supabase.rpc('admin_resolve_report', {
    p_report_id: id,
    p_status: body.status,
    p_resolution: body.resolution ?? null,
    p_note: body.note ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
