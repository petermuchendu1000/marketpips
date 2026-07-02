// lib/admin/gateways.ts — Payment gateway admin model + config resolver.
//
// PURE, testable model for the gateway console (mirrors lib/admin/finance &
// markets) PLUS the runtime config resolver used by the payment libs.
//
// Split of responsibility:
//   • Non-secret config (paybill/shortcode, base_url, callbacks, limits) lives
//     in payment_gateways.config and is safe to render in the UI.
//   • Secret material is write-only from the UI, stored encrypted, and only
//     resolved server-side (service role) at payment-call time.
//
// The resolver is DB-FIRST with an ENV FALLBACK so nothing breaks during
// rollout (docs/08-ADMIN.md §4.7): a gateway configured in the DB wins; if none
// exists we fall back to the historical process.env values.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Enums } from '@/types/supabase'

export type Provider = Enums<'payment_provider'>
export type GatewayEnv = 'sandbox' | 'production'
export type GatewayRow = Database['public']['Tables']['payment_gateways']['Row']

export const GATEWAY_PROVIDERS: Provider[] = [
  'mpesa',
  'mtn_momo',
  'airtel_money',
  'pesapal',
  'bank_transfer',
  'internal',
]

export const GATEWAY_ENVIRONMENTS: GatewayEnv[] = ['sandbox', 'production']

// ------------------------------------------------------------
// Per-provider field schema (drives the UI form + validation + env fallback)
// ------------------------------------------------------------
export interface FieldDef {
  key: string
  label: string
  /** Secret fields are write-only + encrypted; never returned to the client. */
  secret?: boolean
  placeholder?: string
  /** process.env var this field falls back to during rollout. */
  envVar?: string
  help?: string
}

export interface ProviderSchema {
  provider: Provider
  label: string
  /** Human note shown atop the form. */
  note: string
  fields: FieldDef[]
}

export const PROVIDER_SCHEMAS: Record<Provider, ProviderSchema> = {
  mpesa: {
    provider: 'mpesa',
    label: 'M-Pesa (Safaricom Daraja)',
    note: 'Lipa na M-Pesa Online (STK Push) + B2C disbursement.',
    fields: [
      { key: 'base_url', label: 'Base URL', placeholder: 'https://sandbox.safaricom.co.ke', envVar: 'MPESA_BASE_URL' },
      { key: 'business_shortcode', label: 'Business shortcode / Paybill', envVar: 'MPESA_SHORTCODE' },
      { key: 'party_b', label: 'Party B (till/paybill)', help: 'Defaults to the shortcode when blank.' },
      { key: 'transaction_type', label: 'Transaction type', placeholder: 'CustomerPayBillOnline' },
      { key: 'stk_callback_url', label: 'STK callback URL', envVar: 'MPESA_CALLBACK_URL' },
      { key: 'b2c_shortcode', label: 'B2C shortcode' },
      { key: 'b2c_callback_url', label: 'B2C result URL' },
      { key: 'initiator_name', label: 'Initiator name' },
      { key: 'consumer_key', label: 'Consumer key', envVar: 'MPESA_CONSUMER_KEY' },
      { key: 'consumer_secret', label: 'Consumer secret', secret: true, envVar: 'MPESA_CONSUMER_SECRET' },
      { key: 'passkey', label: 'Passkey', secret: true, envVar: 'MPESA_PASSKEY' },
      { key: 'security_credential', label: 'Security credential (B2C)', secret: true },
    ],
  },
  mtn_momo: {
    provider: 'mtn_momo',
    label: 'MTN Mobile Money',
    note: 'Collections + disbursements via the MTN MoMo API.',
    fields: [
      { key: 'base_url', label: 'Base URL', placeholder: 'https://sandbox.momodeveloper.mtn.com', envVar: 'MTN_MOMO_BASE_URL' },
      { key: 'target_environment', label: 'Target environment', placeholder: 'sandbox', envVar: 'MTN_MOMO_TARGET_ENV' },
      { key: 'api_user', label: 'API user (UUID)', envVar: 'MTN_MOMO_API_USER' },
      { key: 'callback_url', label: 'Callback URL', envVar: 'MTN_MOMO_CALLBACK_URL' },
      { key: 'subscription_key', label: 'Collection subscription key', secret: true, envVar: 'MTN_MOMO_SUBSCRIPTION_KEY' },
      { key: 'disbursement_key', label: 'Disbursement subscription key', secret: true, envVar: 'MTN_MOMO_DISBURSEMENT_KEY' },
      { key: 'api_key', label: 'API key', secret: true, envVar: 'MTN_MOMO_API_KEY' },
    ],
  },
  airtel_money: {
    provider: 'airtel_money',
    label: 'Airtel Money',
    note: 'Collections + disbursements via the Airtel Africa API.',
    fields: [
      { key: 'base_url', label: 'Base URL', placeholder: 'https://openapiuat.airtel.africa', envVar: 'AIRTEL_MONEY_BASE_URL' },
      { key: 'client_id', label: 'Client ID', envVar: 'AIRTEL_MONEY_CLIENT_ID' },
      { key: 'callback_url', label: 'Callback URL', envVar: 'AIRTEL_MONEY_CALLBACK_URL' },
      { key: 'client_secret', label: 'Client secret', secret: true, envVar: 'AIRTEL_MONEY_CLIENT_SECRET' },
      { key: 'disbursement_pin', label: 'Disbursement PIN', secret: true, envVar: 'AIRTEL_MONEY_PIN' },
    ],
  },
  pesapal: {
    provider: 'pesapal',
    label: 'PesaPal',
    note: 'Hosted checkout + IPN for Ethiopia / Burundi and card payments.',
    fields: [
      { key: 'base_url', label: 'Base URL', placeholder: 'https://cybqa.pesapal.com/pesapalv3', envVar: 'PESAPAL_BASE_URL' },
      { key: 'consumer_key', label: 'Consumer key', envVar: 'PESAPAL_CONSUMER_KEY' },
      { key: 'ipn_id', label: 'IPN ID', envVar: 'PESAPAL_IPN_ID' },
      { key: 'ipn_url', label: 'IPN URL', envVar: 'PESAPAL_IPN_URL' },
      { key: 'consumer_secret', label: 'Consumer secret', secret: true, envVar: 'PESAPAL_CONSUMER_SECRET' },
    ],
  },
  bank_transfer: {
    provider: 'bank_transfer',
    label: 'Bank transfer (manual)',
    note: 'Manual settlement instructions shown to the user.',
    fields: [
      { key: 'bank_name', label: 'Bank name' },
      { key: 'account_name', label: 'Account name' },
      { key: 'account_number', label: 'Account number' },
      { key: 'instructions', label: 'Instructions' },
    ],
  },
  internal: {
    provider: 'internal',
    label: 'Internal (bonus / adjustments)',
    note: 'No external credentials — used for internal ledger movements.',
    fields: [],
  },
}

/** Non-secret field keys for a provider. */
export function nonSecretFields(provider: Provider): FieldDef[] {
  return PROVIDER_SCHEMAS[provider].fields.filter((f) => !f.secret)
}

/** Secret field keys for a provider. */
export function secretFields(provider: Provider): FieldDef[] {
  return PROVIDER_SCHEMAS[provider].fields.filter((f) => f.secret)
}

/** Mask a secret for display: only the last 4 chars are ever known client-side. */
export function maskSecret(last4?: string | null): string {
  return last4 ? `•••• ${last4}` : '•••• ••••'
}

export interface SecretMeta {
  set: boolean
  last4?: string | null
  updatedAt?: string | null
}

/** Read the write-only secret metadata (never the value) from secret_ref. */
export function secretMeta(secretRef: unknown, key: string): SecretMeta {
  if (!secretRef || typeof secretRef !== 'object') return { set: false }
  const entry = (secretRef as Record<string, unknown>)[key]
  if (!entry || typeof entry !== 'object') return { set: false }
  const e = entry as Record<string, unknown>
  return {
    set: true,
    last4: typeof e.last4 === 'string' ? e.last4 : null,
    updatedAt: typeof e.updated_at === 'string' ? e.updated_at : null,
  }
}

// ------------------------------------------------------------
// List params (mirrors finance/markets parsing)
// ------------------------------------------------------------
const PROVIDER_SET = new Set<string>(GATEWAY_PROVIDERS)
const ENV_SET = new Set<string>(GATEWAY_ENVIRONMENTS)

export interface GatewayListParams {
  provider: Provider | null
  environment: GatewayEnv | null
  country: string | null
  enabled: boolean | null
}

function readParams(
  sp: Record<string, string | string[] | undefined> | URLSearchParams
): (k: string) => string | null {
  return (k: string) => {
    if (sp instanceof URLSearchParams) return sp.get(k)
    const v = sp[k]
    return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  }
}

function triState(v: string | null): boolean | null {
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

export function parseGatewayListParams(
  sp: Record<string, string | string[] | undefined> | URLSearchParams
): GatewayListParams {
  const get = readParams(sp)
  const provider = get('provider')
  const environment = get('environment')
  return {
    provider: provider && PROVIDER_SET.has(provider) ? (provider as Provider) : null,
    environment: environment && ENV_SET.has(environment) ? (environment as GatewayEnv) : null,
    country: (get('country') ?? '').trim().toUpperCase().slice(0, 2) || null,
    enabled: triState(get('enabled')),
  }
}

// ------------------------------------------------------------
// Fetch helpers
// ------------------------------------------------------------
export const GATEWAY_SELECT =
  'id, provider, country_code, currency, label, environment, is_enabled, priority, config, secret_ref, min_amount, max_amount, created_at, updated_at'

export async function fetchGateways(
  supabase: SupabaseClient<Database>,
  p: GatewayListParams
): Promise<GatewayRow[]> {
  let q = supabase.from('payment_gateways').select(GATEWAY_SELECT)
  if (p.provider) q = q.eq('provider', p.provider)
  if (p.environment) q = q.eq('environment', p.environment)
  if (p.country) q = q.eq('country_code', p.country)
  if (p.enabled !== null) q = q.eq('is_enabled', p.enabled)
  q = q.order('provider', { ascending: true }).order('priority', { ascending: true })
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as GatewayRow[]
}

export async function fetchGateway(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<GatewayRow | null> {
  const { data, error } = await supabase
    .from('payment_gateways')
    .select(GATEWAY_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as GatewayRow) ?? null
}

export interface HealthRow {
  id: string
  ok: boolean
  latency_ms: number | null
  detail: string | null
  checked_at: string
}

export async function fetchGatewayHealth(
  supabase: SupabaseClient<Database>,
  gatewayId: string,
  limit = 10
): Promise<HealthRow[]> {
  const { data, error } = await supabase
    .from('gateway_health')
    .select('id, ok, latency_ms, detail, checked_at')
    .eq('gateway_id', gatewayId)
    .order('checked_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as HealthRow[]
}

// ------------------------------------------------------------
// Config resolver (DB-first, env fallback) — used by lib/payments/*
// ------------------------------------------------------------
export interface ResolvedGatewayConfig {
  provider: Provider
  source: 'db' | 'env'
  gatewayId: string | null
  environment: GatewayEnv
  enabled: boolean
  /** Non-secret fields (paybill/base_url/callbacks/…). */
  config: Record<string, string>
  /** Decrypted secrets, resolved server-side only. */
  secrets: Record<string, string>
}

/** Build a config object from process.env for a provider (rollout fallback). */
export function envFallbackConfig(
  provider: Provider,
  env: Record<string, string | undefined> = process.env
): ResolvedGatewayConfig {
  const config: Record<string, string> = {}
  const secrets: Record<string, string> = {}
  for (const f of PROVIDER_SCHEMAS[provider].fields) {
    if (!f.envVar) continue
    const v = env[f.envVar]
    if (v == null || v === '') continue
    if (f.secret) secrets[f.key] = v
    else config[f.key] = v
  }
  const environment: GatewayEnv =
    (env.PAYMENTS_ENV as GatewayEnv) === 'production' ? 'production' : 'sandbox'
  return {
    provider,
    source: 'env',
    gatewayId: null,
    environment,
    enabled: Object.keys(config).length > 0 || Object.keys(secrets).length > 0,
    config,
    secrets,
  }
}

/**
 * Resolve the effective gateway configuration for a provider/country/env.
 * DB-first: the highest-priority enabled gateway matching (provider, country
 * [or global], environment) wins, with its encrypted secrets decrypted via the
 * service-role RPC. Falls back to process.env when no DB gateway exists.
 *
 * MUST be called with a SERVICE-ROLE Supabase client (secrets are never exposed
 * to a user session).
 */
export async function getGatewayConfig(
  supabase: SupabaseClient<Database>,
  provider: Provider,
  country?: string | null,
  env: GatewayEnv = 'sandbox'
): Promise<ResolvedGatewayConfig> {
  const cc = country ? country.trim().toUpperCase().slice(0, 2) : null

  let q = supabase
    .from('payment_gateways')
    .select(GATEWAY_SELECT)
    .eq('provider', provider)
    .eq('environment', env)
    .eq('is_enabled', true)
  // Prefer a country-specific row; a global (NULL) row is the fallback.
  q = cc ? q.or(`country_code.eq.${cc},country_code.is.null`) : q.is('country_code', null)
  q = q.order('country_code', { ascending: true, nullsFirst: false }).order('priority', {
    ascending: true,
  })

  const { data, error } = await q.limit(1)
  if (error) throw new Error(error.message)
  const row = (data?.[0] as GatewayRow | undefined) ?? null

  if (!row) return envFallbackConfig(provider)

  const config: Record<string, string> = {}
  const cfg = (row.config ?? {}) as Record<string, unknown>
  for (const f of nonSecretFields(provider)) {
    const v = cfg[f.key]
    if (typeof v === 'string' && v !== '') config[f.key] = v
  }

  const secrets: Record<string, string> = {}
  for (const f of secretFields(provider)) {
    if (!secretMeta(row.secret_ref, f.key).set) continue
    const { data: secret } = await supabase.rpc('admin_get_gateway_secret', {
      p_gateway_id: row.id,
      p_key: f.key,
    })
    if (typeof secret === 'string' && secret !== '') secrets[f.key] = secret
  }

  return {
    provider,
    source: 'db',
    gatewayId: row.id,
    environment: (row.environment as GatewayEnv) ?? env,
    enabled: row.is_enabled,
    config,
    secrets,
  }
}
