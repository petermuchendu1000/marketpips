// lib/notifications/index.ts
// Unified notification dispatcher — sends DB + SMS + Email

import { createClient } from '@supabase/supabase-js'
import { sendSMS, SMS_TEMPLATES } from './sms'
import { sendEmail, EMAIL_TEMPLATES } from './email'

// Use service role for notification dispatch (server only)
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function notifyDepositSuccess(userId: string, amount: number, currency: string, newBalance: number) {
  const supabase = getServiceClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone_number, email_notifications, sms_notifications, preferred_currency')
    .eq('id', userId)
    .single()

  const { data: user } = await supabase.auth.admin.getUserById(userId)

  // In-app notification
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'deposit_completed',
    title: '💰 Deposit Confirmed',
    body: `${amount.toLocaleString()} ${currency} added to your wallet. New balance: ${newBalance.toLocaleString()} ${currency}`,
    data: { amount, currency, new_balance: newBalance },
  })

  // SMS
  if (profile?.sms_notifications && profile?.phone_number) {
    await sendSMS(
      profile.phone_number,
      SMS_TEMPLATES.deposit_success(
        amount.toLocaleString(), currency, newBalance.toLocaleString()
      )
    )
  }

  // Email
  if (profile?.email_notifications && user?.user?.email) {
    const tmpl = EMAIL_TEMPLATES.deposit_success(
      profile.display_name || 'there',
      amount.toLocaleString(),
      currency,
      newBalance.toLocaleString()
    )
    await sendEmail({ to: user.user.email, ...tmpl })
  }
}

export async function notifyWithdrawalSuccess(userId: string, amount: number, currency: string, phone: string) {
  const supabase = getServiceClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone_number, email_notifications, sms_notifications')
    .eq('id', userId)
    .single()

  const { data: user } = await supabase.auth.admin.getUserById(userId)

  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'withdrawal_completed',
    title: '✅ Withdrawal Sent',
    body: `${amount.toLocaleString()} ${currency} sent to ${phone}.`,
    data: { amount, currency, phone },
  })

  if (profile?.sms_notifications && profile?.phone_number) {
    await sendSMS(profile.phone_number, SMS_TEMPLATES.withdrawal_success(amount.toLocaleString(), currency, phone))
  }

  if (profile?.email_notifications && user?.user?.email) {
    await sendEmail({
      to: user.user.email,
      subject: `✅ Withdrawal of ${amount.toLocaleString()} ${currency} Sent`,
      html: `<p>Your withdrawal of ${amount.toLocaleString()} ${currency} has been sent to ${phone}.</p>`,
    })
  }
}

export async function notifyWelcome(userId: string) {
  const supabase = getServiceClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, referral_code, email_notifications')
    .eq('id', userId)
    .single()

  const { data: user } = await supabase.auth.admin.getUserById(userId)

  if (profile?.email_notifications && user?.user?.email) {
    const tmpl = EMAIL_TEMPLATES.welcome(
      profile.display_name || 'there',
      profile.referral_code || ''
    )
    await sendEmail({ to: user.user.email, ...tmpl })
  }
}

export async function notifyKYCApproved(userId: string) {
  const supabase = getServiceClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone_number, email_notifications, sms_notifications')
    .eq('id', userId)
    .single()

  const { data: user } = await supabase.auth.admin.getUserById(userId)

  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'kyc_approved',
    title: '✅ Identity Verified',
    body: 'Your identity has been verified. You now have full platform access.',
    data: {},
  })

  if (profile?.sms_notifications && profile?.phone_number) {
    await sendSMS(profile.phone_number, SMS_TEMPLATES.kyc_approved())
  }

  if (profile?.email_notifications && user?.user?.email) {
    const tmpl = EMAIL_TEMPLATES.kyc_approved(profile.display_name || 'there')
    await sendEmail({ to: user.user.email, ...tmpl })
  }
}

export async function notifyKYCRejected(userId: string, reason: string) {
  const supabase = getServiceClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone_number, email_notifications, sms_notifications')
    .eq('id', userId)
    .single()

  const { data: user } = await supabase.auth.admin.getUserById(userId)

  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'kyc_rejected',
    title: '⛔ KYC Rejected',
    body: `Reason: ${reason}. Please resubmit your documents.`,
    data: { reason },
  })

  if (profile?.sms_notifications && profile?.phone_number) {
    await sendSMS(profile.phone_number, SMS_TEMPLATES.kyc_rejected(reason))
  }

  if (profile?.email_notifications && user?.user?.email) {
    const tmpl = EMAIL_TEMPLATES.kyc_rejected(profile.display_name || 'there', reason)
    await sendEmail({ to: user.user.email, ...tmpl })
  }
}
