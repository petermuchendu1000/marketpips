// POST /api/admin/announcements — create or update an announcement (draft/scheduled).
//
// Wraps `admin_upsert_announcement` (migration 014): sanitises channels,
// normalises audience, derives draft|scheduled status, audits internally.
// Capability `announcements:send`. Sending is a separate explicit action.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'
import {
  CHANNELS,
  sanitizeChannels,
  normalizeAudience,
  audienceToJson,
} from '@/lib/admin/announcements'

const audienceSchema = z
  .object({
    countries: z.array(z.string()).nullable().optional(),
    roles: z.array(z.string()).nullable().optional(),
    statuses: z.array(z.string()).optional(),
  })
  .passthrough()

const schema = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  channels: z.array(z.enum(CHANNELS)).optional(),
  audience: audienceSchema.optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const guard = await requireCapability('announcements:send')
  if (!guard.ok) return guard.response

  const { data, error } = await guard.ctx.supabase.rpc('admin_upsert_announcement', {
    p_id: body.id ?? null,
    p_title: body.title,
    p_body: body.body,
    p_channels: sanitizeChannels(body.channels),
    p_audience: audienceToJson(normalizeAudience(body.audience ?? {})) as never,
    p_scheduled_at: body.scheduled_at ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
