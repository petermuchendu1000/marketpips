// POST /api/admin/applications/[id]/reject — reject a creator|marketer
// application. The RPC self-checks the right capability based on the
// application kind and audits the action.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'

const schema = z.object({ reason: z.string().max(1000).optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  // Any staff session may attempt; the RPC enforces creators:manage OR
  // marketers:manage depending on the application kind.
  const guard = await requireUser()
  if (!guard.ok) return guard.response

  const { data, error } = await guard.ctx.supabase.rpc('admin_reject_application' as never, {
    p_application_id: id,
    p_reason: parsed.data.reason ?? null,
  } as never)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
