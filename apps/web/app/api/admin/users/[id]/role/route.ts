// POST /api/admin/users/[id]/role — change a user's role (guardrailed).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'

const schema = z.object({
  role: z.enum([
    'user', 'admin', 'moderator', 'resolver', 'creator', 'marketer', 'support', 'finance', 'superadmin',
  ]),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireCapability('users:role_grant')
  if (!guard.ok) return guard.response
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const { data, error } = await guard.ctx.supabase.rpc('admin_set_user_role', {
    p_user_id: id,
    p_new_role: parsed.data.role,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
