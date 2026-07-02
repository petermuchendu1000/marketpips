// POST /api/admin/gateways — create or update a gateway's NON-SECRET config.
//
// Requires gateways:write and is audited inside admin_upsert_gateway. Secret
// material is NEVER accepted here — it is set via /rotate-secret (superadmin).
// Called via the operator session so has_capability() sees the real caller.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCapability } from '@/lib/auth'
import { GATEWAY_PROVIDERS, GATEWAY_ENVIRONMENTS, nonSecretFields } from '@/lib/admin/gateways'
import type { Provider } from '@/lib/admin/gateways'

const CURRENCIES = ['KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'ETB', 'BIF', 'USD'] as const

const schema = z.object({
  id: z.string().uuid().nullable().optional(),
  provider: z.enum(GATEWAY_PROVIDERS as [Provider, ...Provider[]]),
  country_code: z.string().trim().max(2).nullable().optional(),
  currency: z.enum(CURRENCIES).nullable().optional(),
  label: z.string().trim().min(1).max(120),
  environment: z.enum(GATEWAY_ENVIRONMENTS as ['sandbox', 'production']),
  priority: z.coerce.number().int().min(0).max(10000).optional(),
  config: z.record(z.string(), z.string()).optional(),
  min_amount: z.coerce.number().min(0).nullable().optional(),
  max_amount: z.coerce.number().min(0).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }
  const b = parsed.data

  const guard = await requireCapability('gateways:write')
  if (!guard.ok) return guard.response
  const sb = guard.ctx.supabase

  // Whitelist config keys to the provider's declared NON-SECRET fields.
  const allowed = new Set(nonSecretFields(b.provider).map((f) => f.key))
  const cleanConfig: Record<string, string> = {}
  for (const [k, v] of Object.entries(b.config ?? {})) {
    if (allowed.has(k) && typeof v === 'string') cleanConfig[k] = v
  }

  const { data, error } = await sb.rpc('admin_upsert_gateway', {
    p_id: b.id ?? null,
    p_provider: b.provider,
    p_country_code: b.country_code ?? null,
    p_currency: b.currency ?? null,
    p_label: b.label,
    p_environment: b.environment,
    p_priority: b.priority ?? null,
    p_config: cleanConfig,
    p_min_amount: b.min_amount ?? null,
    p_max_amount: b.max_amount ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, data })
}
