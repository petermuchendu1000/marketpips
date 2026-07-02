// lib/env.ts — Centralized, validated environment access (Zod).
// Server-only secrets are validated lazily on first access so that the
// client bundle never imports them and the build never fails on missing
// runtime-only vars.
import { z } from 'zod'

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('MarketPips'),
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DB_URL: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  ADMIN_SECRET_KEY: z.string().optional(),
  // FX provider (update-exchange-rates cron). Free OpenExchangeRates plan is
  // USD-base, which is exactly what we need. Absent -> job degrades gracefully
  // to last-known-good fallback rates without failing.
  OPENEXCHANGERATES_APP_ID: z.string().optional(),
})

export type PublicEnv = z.infer<typeof publicSchema>
export type ServerEnv = z.infer<typeof serverSchema>

let _publicEnv: PublicEnv | null = null
let _serverEnv: ServerEnv | null = null

/** Validated public (NEXT_PUBLIC_*) env — safe on client and server. */
export function getPublicEnv(): PublicEnv {
  if (_publicEnv) return _publicEnv
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  })
  if (!parsed.success) {
    throw new Error(
      'Invalid public environment configuration: ' +
        JSON.stringify(parsed.error.flatten().fieldErrors)
    )
  }
  _publicEnv = parsed.data
  return _publicEnv
}

/** Validated server-only env. Throws if called on the client. */
export function getServerEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() must not be called on the client')
  }
  if (_serverEnv) return _serverEnv
  const parsed = serverSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new Error(
      'Invalid server environment configuration: ' +
        JSON.stringify(parsed.error.flatten().fieldErrors)
    )
  }
  _serverEnv = parsed.data
  return _serverEnv
}
