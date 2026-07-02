// app/api/telemetry/vitals/route.ts — RUM ingest for Core Web Vitals.
//
// Receives sampled web-vitals reports from the client and forwards them to the
// structured logger (Module 13) tagged with route + request id, for aggregation
// in log-based dashboards. Validates strictly; never trusts client input. Always
// `no-store`. Returns 204 with no body to keep the beacon cheap.
import { NextRequest, NextResponse } from 'next/server'
import { parseVitalReport } from '@/lib/perf/vitals'
import { logger } from '@/lib/observability/logger'
import { resolveRequestId } from '@/lib/observability/request-id'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const requestId = resolveRequestId(req.headers)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  }

  const report = parseVitalReport(body)
  if (!report) {
    // Bad payloads are ignored (204) — RUM is best-effort, not an API contract.
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  }

  logger.child({ request_id: requestId, route: '/api/telemetry/vitals' }).info('web-vital', {
    metric: report.name,
    value: report.value,
    rating: report.rating,
    path: report.path,
    navigation_type: report.navigationType,
  })

  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
