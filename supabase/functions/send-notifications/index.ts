// supabase/functions/send-notifications/index.ts
// Deno edge function — send SMS/Email for pending notifications

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function sendSMS(to: string, message: string, apiKey: string): Promise<boolean> {
  if (!apiKey || !to) return false
  const params = new URLSearchParams({
    username: Deno.env.get('AFRICASTALKING_USERNAME') || 'sandbox',
    to,
    message,
    from: 'MarketPips',
  })
  const isSandbox = (Deno.env.get('AFRICASTALKING_USERNAME') || 'sandbox') === 'sandbox'
  const url = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging'
  const res = await fetch(url, {
    method: 'POST',
    headers: { apiKey, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params.toString(),
  })
  return res.ok
}

async function sendEmail(to: string, subject: string, html: string, resendKey: string): Promise<boolean> {
  if (!resendKey || !to) return false
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `MarketPips <noreply@marketpips.co.ke>`,
      to: [to],
      subject,
      html,
    }),
  })
  return res.ok
}

serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const atKey = Deno.env.get('AFRICASTALKING_API_KEY') || ''
  const resendKey = Deno.env.get('RESEND_API_KEY') || ''

  // Get recent unprocessed notifications
  const { data: notifs } = await supabase
    .from('notifications')
    .select(`
      id, user_id, type, title, body,
      profiles!inner(phone_number, sms_notifications, email_notifications, display_name)
    `)
    .is('read_at', null)
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()) // last 10 min
    .limit(50)

  if (!notifs?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let smsCount = 0, emailCount = 0

  for (const n of notifs as any[]) {
    const profile = n.profiles
    if (!profile) continue

    // Lookup email
    const { data: authUser } = await supabase.auth.admin.getUserById(n.user_id)
    const email = authUser?.user?.email

    // SMS
    if (profile.sms_notifications && profile.phone_number && atKey) {
      const ok = await sendSMS(profile.phone_number, `${n.title}: ${n.body}`, atKey)
      if (ok) smsCount++
    }

    // Email (only for high-priority types)
    const emailTypes = ['bet_won', 'deposit_completed', 'withdrawal_completed', 'kyc_approved', 'kyc_rejected', 'market_resolved']
    if (profile.email_notifications && email && resendKey && emailTypes.includes(n.type)) {
      const ok = await sendEmail(email, n.title, `<p>${n.body}</p><p><a href="https://marketpips.co.ke">Open MarketPips</a></p>`, resendKey)
      if (ok) emailCount++
    }
  }

  return new Response(JSON.stringify({
    processed: notifs.length,
    sms_sent: smsCount,
    emails_sent: emailCount,
    at: new Date().toISOString(),
  }), { headers: { 'Content-Type': 'application/json' } })
})
