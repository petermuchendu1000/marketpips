// lib/admin/gateway-test.ts — Live connection test for a resolved gateway.
//
// SERVER-ONLY. Given a resolved config (non-secret + decrypted secrets), performs
// a provider-specific, sandbox-safe auth/token call and reports ok + latency.
// Never returns secret material; failures are captured as a short detail string.
import axios from 'axios'
import type { ResolvedGatewayConfig } from '@/lib/admin/gateways'

export interface TestResult {
  ok: boolean
  latencyMs: number
  detail: string
}

const TIMEOUT = 10000

export async function testGatewayConnection(cfg: ResolvedGatewayConfig): Promise<TestResult> {
  const started = Date.now()
  const done = (ok: boolean, detail: string): TestResult => ({
    ok,
    latencyMs: Date.now() - started,
    detail: detail.slice(0, 500),
  })

  try {
    switch (cfg.provider) {
      case 'mpesa': {
        const base = cfg.config.base_url || 'https://sandbox.safaricom.co.ke'
        const key = cfg.config.consumer_key
        const secret = cfg.secrets.consumer_secret
        if (!key || !secret) return done(false, 'Missing consumer_key / consumer_secret')
        const creds = Buffer.from(`${key}:${secret}`).toString('base64')
        const res = await axios.get(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
          headers: { Authorization: `Basic ${creds}` },
          timeout: TIMEOUT,
        })
        return done(!!res.data?.access_token, res.data?.access_token ? 'OAuth token acquired' : 'No token in response')
      }
      case 'mtn_momo': {
        const base = cfg.config.base_url || 'https://sandbox.momodeveloper.mtn.com'
        const subKey = cfg.secrets.subscription_key
        if (!subKey) return done(false, 'Missing collection subscription_key')
        // Ping the token endpoint; a 4xx auth error still proves connectivity.
        const res = await axios.post(`${base}/collection/token/`, null, {
          headers: { 'Ocp-Apim-Subscription-Key': subKey },
          timeout: TIMEOUT,
          validateStatus: () => true,
        })
        return done(res.status < 500, `HTTP ${res.status}`)
      }
      case 'airtel_money': {
        const base = cfg.config.base_url || 'https://openapiuat.airtel.africa'
        const id = cfg.config.client_id
        const secret = cfg.secrets.client_secret
        if (!id || !secret) return done(false, 'Missing client_id / client_secret')
        const res = await axios.post(
          `${base}/auth/oauth2/token`,
          { client_id: id, client_secret: secret, grant_type: 'client_credentials' },
          { timeout: TIMEOUT, validateStatus: () => true }
        )
        return done(!!res.data?.access_token, res.data?.access_token ? 'OAuth token acquired' : `HTTP ${res.status}`)
      }
      case 'pesapal': {
        const base = cfg.config.base_url || 'https://cybqa.pesapal.com/pesapalv3'
        const key = cfg.config.consumer_key
        const secret = cfg.secrets.consumer_secret
        if (!key || !secret) return done(false, 'Missing consumer_key / consumer_secret')
        const res = await axios.post(
          `${base}/api/Auth/RequestToken`,
          { consumer_key: key, consumer_secret: secret },
          { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, timeout: TIMEOUT, validateStatus: () => true }
        )
        return done(!!res.data?.token, res.data?.token ? 'Auth token acquired' : `HTTP ${res.status}: ${res.data?.error?.message ?? 'no token'}`)
      }
      case 'bank_transfer': {
        const ok = !!(cfg.config.account_number && cfg.config.account_name)
        return done(ok, ok ? 'Bank details present' : 'Missing account_number / account_name')
      }
      case 'internal':
        return done(true, 'Internal provider — no external endpoint')
      default:
        return done(false, 'Unsupported provider')
    }
  } catch (e) {
    const msg = axios.isAxiosError(e)
      ? `${e.code ?? 'ERR'} ${e.response?.status ?? ''} ${e.message}`
      : e instanceof Error
        ? e.message
        : 'Unknown error'
    return done(false, msg)
  }
}
