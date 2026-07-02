// POST /api/admin/settings/currencies — manage currencies & FX.
//
// action 'upsert_rate' -> admin_upsert_exchange_rate (settings:write, audited)
// action 'set_enabled' -> toggle a currency in the platform_settings
//                          'currencies.enabled' list (settings:write, audited)
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'
import type { Json } from '@/types/supabase'

const CURRENCIES = ['KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'ETB', 'BIF', 'USD'] as const

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upsert_rate'),
    from: z.enum(CURRENCIES),
    to: z.enum(CURRENCIES).default('USD'),
    rate: z.coerce.number().positive(),
    source: z.string().max(60).optional(),
  }),
  z.object({
    action: z.literal('set_enabled'),
    currency: z.enum(CURRENCIES),
    enabled: z.boolean(),
  }),
])

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const guard = await requireCapability('settings:write')
  if (!guard.ok) return guard.response
  const sb = guard.ctx.supabase

  if (body.action === 'upsert_rate') {
    const { data, error } = await sb.rpc('admin_upsert_exchange_rate', {
      p_from: body.from,
      p_to: body.to,
      p_rate: body.rate,
      p_source: body.source ?? 'manual',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, data })
  }

  // set_enabled: read current list, mutate, persist.
  const { data: row } = await sb
    .from('platform_settings')
    .select('value')
    .eq('key', 'currencies.enabled')
    .maybeSingle()
  const current = Array.isArray(row?.value) ? (row?.value as string[]) : [...CURRENCIES]
  const set = new Set(current)
  if (body.enabled) set.add(body.currency)
  else set.delete(body.currency)
  const next = CURRENCIES.filter((c) => set.has(c))

  const { error } = await sb.rpc('admin_upsert_setting', {
    p_key: 'currencies.enabled',
    p_value: next as unknown as Json,
    p_is_public: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, enabled: next })
}
