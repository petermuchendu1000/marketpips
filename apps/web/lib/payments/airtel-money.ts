// ============================================================
// Airtel Money Integration (Kenya, Tanzania, Uganda, Rwanda, Zambia)
// Docs: https://developers.airtel.africa/
// ============================================================

import axios from 'axios'

const BASE_URL = process.env.AIRTEL_MONEY_BASE_URL || 'https://openapiuat.airtel.africa'
const CLIENT_ID = process.env.AIRTEL_MONEY_CLIENT_ID!
const CLIENT_SECRET = process.env.AIRTEL_MONEY_CLIENT_SECRET!
const CALLBACK_URL = process.env.AIRTEL_MONEY_CALLBACK_URL!

const COUNTRY_CODES: Record<string, string> = {
  KE: 'KE',
  TZ: 'TZ',
  UG: 'UG',
  RW: 'RW',
  ZM: 'ZM',
  MW: 'MW',
  MG: 'MG',
}

const CURRENCY_MAP: Record<string, string> = {
  KE: 'KES',
  TZ: 'TZS',
  UG: 'UGX',
  RW: 'RWF',
  ZM: 'ZMW',
}

interface AirtelTokenResponse {
  access_token: string
  expires_in: string
  token_type: string
}

interface AirtelCollectionResponse {
  data: {
    transaction: {
      id: string
      status: string
      airtel_money_id?: string
    }
  }
  status: {
    code: string
    message: string
    result_code: string
    response_code: string
    success: boolean
  }
}

async function getAirtelToken(): Promise<string> {
  const response = await axios.post<AirtelTokenResponse>(
    `${BASE_URL}/auth/oauth2/token`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  )
  return response.data.access_token
}

export function formatAirtelPhone(phone: string, country: string = 'KE'): string {
  const cleaned = phone.replace(/\D/g, '')
  const prefixes: Record<string, string> = {
    KE: '254',
    TZ: '255',
    UG: '256',
    RW: '250',
    ZM: '260',
  }
  const prefix = prefixes[country] || '254'

  if (cleaned.startsWith(prefix)) return cleaned
  if (cleaned.startsWith('0')) return `${prefix}${cleaned.slice(1)}`
  if (cleaned.length <= 9) return `${prefix}${cleaned}`
  return cleaned
}

// Collect payment from user
export async function airtelCollect({
  phone,
  amount,
  country,
  reference,
  depositId,
}: {
  phone: string
  amount: number
  country: string
  reference: string
  depositId: string
}): Promise<{ transactionId: string; status: string }> {
  const token = await getAirtelToken()
  const formattedPhone = formatAirtelPhone(phone, country)
  const currency = CURRENCY_MAP[country] || 'KES'

  const response = await axios.post<AirtelCollectionResponse>(
    `${BASE_URL}/merchant/v2/payments/`,
    {
      reference: reference.slice(0, 20),
      subscriber: {
        country: COUNTRY_CODES[country] || 'KE',
        currency,
        msisdn: formattedPhone,
      },
      transaction: {
        amount: Math.ceil(amount),
        country: COUNTRY_CODES[country] || 'KE',
        currency,
        id: depositId,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Country': COUNTRY_CODES[country] || 'KE',
        'X-Currency': currency,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  )

  if (!response.data.status.success) {
    throw new Error(`Airtel Money collection failed: ${response.data.status.message}`)
  }

  return {
    transactionId: response.data.data.transaction.id,
    status: response.data.data.transaction.status,
  }
}

// Check transaction status
export async function airtelTransactionStatus(transactionId: string, country: string = 'KE'): Promise<{
  status: 'TS' | 'TF' | 'TP' | string // TS=success, TF=failed, TP=pending
  airtelMoneyId?: string
}> {
  const token = await getAirtelToken()
  const currency = CURRENCY_MAP[country] || 'KES'

  const response = await axios.get(
    `${BASE_URL}/standard/v1/payments/${transactionId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Country': COUNTRY_CODES[country] || 'KE',
        'X-Currency': currency,
      },
      timeout: 10000,
    }
  )

  return {
    status: response.data.data?.transaction?.status,
    airtelMoneyId: response.data.data?.transaction?.airtel_money_id,
  }
}

// Parse an Airtel Money collection IPN/callback.
// Airtel posts a transaction block with a status_code: TS=success, TF=failed,
// TIP/TA=pending. The `id` echoes our deposit reference.
export interface AirtelCallbackBody {
  transaction?: {
    id?: string
    message?: string
    status_code?: string
    airtel_money_id?: string
  }
  data?: {
    transaction?: {
      id?: string
      message?: string
      status_code?: string
      airtel_money_id?: string
    }
  }
}

export function parseAirtelCallback(body: AirtelCallbackBody): {
  success: boolean
  failed: boolean
  pending: boolean
  reference?: string
  airtelMoneyId?: string
  message?: string
  statusCode?: string
} {
  const txn = body.transaction || body.data?.transaction || {}
  const code = (txn.status_code || '').toUpperCase()
  return {
    success: code === 'TS',
    failed: code === 'TF',
    pending: code !== 'TS' && code !== 'TF',
    reference: txn.id,
    airtelMoneyId: txn.airtel_money_id,
    message: txn.message,
    statusCode: code,
  }
}

// Disburse (withdrawal)
export async function airtelDisburse({
  phone,
  amount,
  country,
  reference,
}: {
  phone: string
  amount: number
  country: string
  reference: string
}): Promise<{ transactionId: string }> {
  const token = await getAirtelToken()
  const formattedPhone = formatAirtelPhone(phone, country)
  const currency = CURRENCY_MAP[country] || 'KES'

  const response = await axios.post(
    `${BASE_URL}/standard/v1/disbursements/`,
    {
      payee: {
        msisdn: formattedPhone,
      },
      reference: reference.slice(0, 20),
      pin: process.env.AIRTEL_MONEY_PIN || '',
      transaction: {
        amount: Math.floor(amount),
        id: reference,
        type: 'B2C',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Country': COUNTRY_CODES[country] || 'KE',
        'X-Currency': currency,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  )

  return { transactionId: response.data.data?.transaction?.id }
}
