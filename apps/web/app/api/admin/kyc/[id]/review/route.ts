// POST /api/admin/kyc/[id]/review — approve/reject a KYC document.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.object({
  status: z.enum(['verified', 'rejected']),
  rejection_reason: z.string().max(1000).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: docId } = await params
  const guard = await requireCapability('kyc:review')
  if (!guard.ok) return guard.response
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  if (parsed.data.status === 'rejected' && !parsed.data.rejection_reason) {
    return NextResponse.json({ error: 'A rejection reason is required' }, { status: 400 })
  }
  const { data, error } = await guard.ctx.supabase.rpc('admin_review_kyc', {
    p_doc_id: docId,
    p_status: parsed.data.status,
    p_reviewer_id: guard.ctx.user.id,
    p_rejection_reason: parsed.data.rejection_reason ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
