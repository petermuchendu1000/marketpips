// app/api/health/route.ts - Health check endpoint
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const { error } = await supabase.from('exchange_rates').select('id').limit(1)

    const latency = Date.now() - startTime

    if (error) {
      return NextResponse.json({
        status: 'degraded',
        db: 'error',
        error: error.message,
        latency_ms: latency,
        timestamp: new Date().toISOString(),
      }, { status: 503 })
    }

    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      latency_ms: latency,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    })

  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: 'Database connection failed',
      latency_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    }, { status: 503 })
  }
}
