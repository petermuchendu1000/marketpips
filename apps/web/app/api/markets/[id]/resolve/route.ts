// app/api/markets/[id]/resolve/route.ts - Admin: resolve a market
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { requireRole, RESOLVER_ROLES } from '@/lib/auth'

const resolveSchema = z.object({
  outcome: z.enum(['yes', 'no']),
  resolution_notes: z.string().min(10).max(1000),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: marketId } = await params
    const guard = await requireRole(RESOLVER_ROLES)
    if (!guard.ok) return guard.response
    const { user } = guard.ctx

    const body = await req.json()
    const parsed = resolveSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { outcome, resolution_notes } = parsed.data
    const adminClient = await createAdminClient()

    const { data: result, error: resolveError } = await adminClient.rpc('resolve_market', {
      p_market_id: marketId,
      p_outcome: outcome,
      p_resolver_id: user.id,
      p_resolution_notes: resolution_notes,
    })

    if (resolveError) {
      console.error('Market resolution error:', resolveError)
      return NextResponse.json({ error: 'Failed to resolve market', details: resolveError.message }, { status: 500 })
    }

    // Audit log
    await adminClient.from('audit_log').insert({
      actor_id: user.id,
      action: 'market_resolved',
      entity_type: 'market',
      entity_id: marketId,
      new_data: { outcome, resolution_notes },
    })

    return NextResponse.json({ success: true, data: result })

  } catch (error) {
    console.error('Resolve market error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
