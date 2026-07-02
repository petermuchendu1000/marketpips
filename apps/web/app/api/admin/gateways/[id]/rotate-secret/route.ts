// POST /api/admin/gateways/[id]/rotate-secret — set / rotate / clear a secret.
//
// Superadmin-only (gateways:secrets). The value is write-only: it is passed
// straight into the encrypting RPC and NEVER stored in plaintext, logged, or
// returned. The RPC audits the rotation event (key + last4 only).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'
import { secretFields } from '@/lib/admin/gateways'
import type { Provider } from '@/lib/admin/gateways'

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set'),
    provider: z.string(),
    key: z.string().min(1).max(64),
    value: z.string().min(1).max(4096),
  }),
  z.object({
    action: z.literal('clear'),
    key: z.string().min(1).max(64),
  }),
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const guard = await requireCapability('gateways:secrets')
  if (!guard.ok) return guard.response
  const sb = guard.ctx.supabase

  if (body.action === 'clear') {
    const { data, error } = await sb.rpc('admin_clear_gateway_secret', {
      p_gateway_id: id,
      p_key: body.key,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, data })
  }

  // Validate the key is a declared secret field for this provider.
  const validKeys = new Set(secretFields(body.provider as Provider).map((f) => f.key))
  if (!validKeys.has(body.key)) {
    return NextResponse.json({ error: `Unknown secret field '${body.key}' for ${body.provider}` }, { status: 400 })
  }

  const { data, error } = await sb.rpc('admin_rotate_gateway_secret', {
    p_gateway_id: id,
    p_key: body.key,
    p_value: body.value,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
