// supabase/functions/update-exchange-rates/index.ts
// Deno edge function — called by Supabase cron every 6 hours
// Updates exchange rates for all supported currencies

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CURRENCIES = ['KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'ETB', 'BIF']

// Fallback rates (used if API unavailable)
const FALLBACK_RATES: Record<string, number> = {
  KES: 0.00775,    // 1 USD = ~129 KES
  UGX: 0.000267,   // 1 USD = ~3750 UGX
  TZS: 0.000385,   // 1 USD = ~2600 TZS
  RWF: 0.000714,   // 1 USD = ~1400 RWF
  ZMW: 0.0385,     // 1 USD = ~26 ZMW
  ETB: 0.00714,    // 1 USD = ~140 ETB
  BIF: 0.000333,   // 1 USD = ~3000 BIF
}

serve(async (req) => {
  // Verify cron secret
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const oxrAppId = Deno.env.get('OPEN_EXCHANGE_RATES_APP_ID')

  const supabase = createClient(supabaseUrl, serviceKey)

  let rates: Record<string, number> = {}
  let source = 'fallback'

  // Try Open Exchange Rates
  if (oxrAppId) {
    try {
      const res = await fetch(
        `https://openexchangerates.org/api/latest.json?app_id=${oxrAppId}&symbols=${CURRENCIES.join(',')}&base=USD`
      )
      if (res.ok) {
        const data = await res.json()
        if (data.rates) {
          // OXR gives USD->currency, we need currency->USD
          for (const [code, rate] of Object.entries(data.rates as Record<string, number>)) {
            rates[code] = 1 / rate
          }
          source = 'openexchangerates'
        }
      }
    } catch (e) {
      console.error('OXR fetch failed:', e)
    }
  }

  // Fallback to free exchangerate-api if OXR fails
  if (Object.keys(rates).length === 0) {
    try {
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
      if (res.ok) {
        const data = await res.json()
        for (const code of CURRENCIES) {
          if (data.rates[code]) {
            rates[code] = 1 / data.rates[code]
          }
        }
        source = 'exchangerate-api'
      }
    } catch (e) {
      console.error('ExchangeRate-API fetch failed:', e)
    }
  }

  // Use fallback rates if both fail
  if (Object.keys(rates).length === 0) {
    rates = { ...FALLBACK_RATES }
    source = 'fallback'
  }

  // Upsert rates into database
  const upserts = Object.entries(rates).map(([code, rate]) => ({
    from_currency: code,
    to_currency: 'USD',
    rate: Number(rate.toFixed(10)),
    source,
    fetched_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('exchange_rates')
    .upsert(upserts, { onConflict: 'from_currency,to_currency' })

  if (error) {
    console.error('DB upsert error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = {
    success: true,
    source,
    updated: Object.keys(rates).length,
    rates,
    at: new Date().toISOString(),
  }

  console.log('Exchange rates updated:', result)

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})
