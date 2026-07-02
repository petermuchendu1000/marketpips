// PUT /api/admin/settings — bulk-upsert typed platform settings.
//
// Requires settings:write. Each key is validated + coerced against
// SETTINGS_SCHEMA, then persisted via the audited admin_upsert_setting RPC with
// its schema-declared is_public flag. Unknown keys are rejected.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'
import { SETTINGS_BY_KEY, coerceSettingValue } from '@/lib/admin/settings'
import type { Json } from '@/types/supabase'

const schema = z.object({
  updates: z.record(z.string(), z.unknown()),
})

export async function PUT(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const guard = await requireCapability('settings:write')
  if (!guard.ok) return guard.response
  const sb = guard.ctx.supabase

  const results: { key: string; ok: boolean; error?: string }[] = []
  for (const [key, raw] of Object.entries(parsed.data.updates)) {
    const def = SETTINGS_BY_KEY[key]
    if (!def) {
      results.push({ key, ok: false, error: 'Unknown setting' })
      continue
    }
    let value: Json
    try {
      value = coerceSettingValue(def, raw) as Json
    } catch (e) {
      results.push({ key, ok: false, error: e instanceof Error ? e.message : 'Invalid value' })
      continue
    }
    const { error } = await sb.rpc('admin_upsert_setting', {
      p_key: key,
      p_value: value,
      p_is_public: def.isPublic,
    })
    results.push({ key, ok: !error, error: error?.message })
  }

  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    return NextResponse.json({ success: false, results }, { status: 400 })
  }
  return NextResponse.json({ success: true, results })
}
