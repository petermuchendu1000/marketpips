// app/api/markets/[id]/resolve/route.ts - Admin: resolve a market
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { requireRole, RESOLVER_ROLES } from '@/lib/auth'

// A market resolves EITHER on a binary outcome (yes/no) OR, for
// multiple_choice markets, on a winning option id. Exactly one must be set.
const resolveSchema = z
  .object({
    outcome: z.enum(['yes', 'no']).optional(),
    winning_option_id: z.string().uuid().optional(),
    resolution_notes: z.string().min(10).max(1000),
  })
  .refine(
    (v) => (v.outcome ? !v.winning_option_id : !!v.winning_option_id),
    { message: 'Provide exactly one of `outcome` (binary) or `winning_option_id` (multiple choice).' },
  )

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

    const { outcome, winning_option_id, resolution_notes } = parsed.data
    const adminClient = await createAdminClient()

    // Route to the correct settlement RPC by resolution shape. Both mirror the
    // same payout math (stake returned + shares x $1 to winners).
    const { data: result, error: resolveError } = winning_option_id
      ? await adminClient.rpc('resolve_market_options', {
          p_market_id: marketId,
          p_winning_option_id: winning_option_id,
          p_resolver_id: user.id,
          p_resolution_notes: resolution_notes,
        })
      : await adminClient.rpc('resolve_market', {
          p_market_id: marketId,
          p_outcome: outcome as 'yes' | 'no',
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
      new_data: { outcome, winning_option_id, resolution_notes },
    })

    return NextResponse.json({ success: true, data: result })

  } catch (error) {
    console.error('Resolve market error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
