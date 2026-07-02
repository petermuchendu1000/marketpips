// POST /api/admin/gateways/[id]/test — live connection test for a gateway.
//
// Requires gateways:read. Resolves the gateway's config + decrypted secrets via
// the SERVICE-ROLE client (secrets never touch the browser), performs a
// sandbox-safe provider auth call, records a gateway_health row, and returns
// the ok/latency/detail — but NEVER any secret value.
import { NextRequest, NextResponse } from 'next/server'
import { requireCapability } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchGateway, getGatewayConfig, type GatewayEnv } from '@/lib/admin/gateways'
import { testGatewayConnection } from '@/lib/admin/gateway-test'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const guard = await requireCapability('gateways:read')
  if (!guard.ok) return guard.response

  // Load the row (RLS-scoped to the operator) to know provider/country/env.
  const row = await fetchGateway(guard.ctx.supabase, id)
  if (!row) return NextResponse.json({ error: 'Gateway not found' }, { status: 404 })

  // Resolve full config incl. secrets with the service role (server-only).
  const admin = await createAdminClient()
  const cfg = await getGatewayConfig(
    admin,
    row.provider,
    row.country_code,
    (row.environment as GatewayEnv) ?? 'sandbox'
  )

  const result = await testGatewayConnection(cfg)

  // Record health via the operator session (audited capability check inside).
  await guard.ctx.supabase.rpc('admin_record_gateway_health', {
    p_gateway_id: id,
    p_ok: result.ok,
    p_latency_ms: result.latencyMs,
    p_detail: result.detail,
  })

  return NextResponse.json({ success: true, ...result })
}
