// POST /api/admin/announcements/preview — resolve how many users an audience hits.
//
// Wraps `announcement_audience_count` (migration 014) so the compose form can
// show a live recipient estimate before sending. Capability `announcements:send`.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'
import { normalizeAudience, describeAudience, previewAudienceCount } from '@/lib/admin/announcements'

const schema = z.object({
  audience: z
    .object({
      countries: z.array(z.string()).nullable().optional(),
      roles: z.array(z.string()).nullable().optional(),
      statuses: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const guard = await requireCapability('announcements:send')
  if (!guard.ok) return guard.response

  const audience = normalizeAudience(parsed.data.audience ?? {})
  const count = await previewAudienceCount(guard.ctx.supabase, audience)
  return NextResponse.json({ success: true, count, description: describeAudience(audience) })
}
