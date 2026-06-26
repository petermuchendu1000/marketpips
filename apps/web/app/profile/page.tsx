'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import type { Profile, Wallet, CurrencyCode } from '@/types'
import { CURRENCIES } from '@/types'

export default function ProfilePage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    display_name: '',
    username: '',
    bio: '',
    phone_number: '',
    preferred_currency: 'KES' as CurrencyCode,
    email_notifications: true,
    sms_notifications: true,
  })

  useEffect(() => {
    if (!loading && !user) router.push('/auth/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [{ data: prof }, { data: wals }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('wallets').select('*').eq('user_id', user.id),
      ])
      if (prof) {
        setProfile(prof as Profile)
        setForm({
          display_name: prof.display_name || '',
          username: prof.username || '',
          bio: prof.bio || '',
          phone_number: prof.phone_number || '',
          preferred_currency: prof.preferred_currency || 'KES',
          email_notifications: prof.email_notifications ?? true,
          sms_notifications: prof.sms_notifications ?? true,
        })
      }
      if (wals) setWallets(wals as Wallet[])
    }
    load()
  }, [user])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: form.display_name,
        username: form.username || null,
        bio: form.bio,
        phone_number: form.phone_number || null,
        preferred_currency: form.preferred_currency,
        email_notifications: form.email_notifications,
        sms_notifications: form.sms_notifications,
      })
      .eq('id', user.id)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  if (loading || !user) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="loading loading-spinner loading-lg" />
    </div>
  )

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">👤 My Profile</h1>

      {/* Stats */}
      {profile && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Total Bets', value: profile.total_bets },
            { label: 'Win Rate', value: `${Math.round((profile.win_rate || 0) * 100)}%` },
            { label: 'Volume', value: `$${(profile.total_volume_usd || 0).toFixed(0)}` },
            { label: 'P&L', value: `$${(profile.profit_loss_usd || 0).toFixed(2)}` },
          ].map((s) => (
            <div key={s.label} className="bg-base-200 rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{s.value}</div>
              <div className="text-xs text-base-content/60">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Wallets */}
      <div className="card bg-base-200 mb-6">
        <div className="card-body py-4">
          <h2 className="card-title text-base">💰 Wallets</h2>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {wallets.map((w) => {
              const info = CURRENCIES[w.currency]
              return (
                <div key={w.id} className="flex justify-between items-center bg-base-100 rounded-lg px-3 py-2">
                  <span className="text-sm">{info?.flag} {w.currency}</span>
                  <span className="font-mono text-sm font-semibold">
                    {info?.symbol}{w.available_balance.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <div className="card bg-base-200">
        <div className="card-body">
          <h2 className="card-title text-base">✏️ Edit Profile</h2>
          <div className="space-y-4 mt-2">
            <div className="form-control">
              <label className="label"><span className="label-text">Display Name</span></label>
              <input
                type="text"
                className="input input-bordered"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Username</span></label>
              <input
                type="text"
                className="input input-bordered"
                placeholder="@username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.replace('@', '') })}
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Bio</span></label>
              <textarea
                className="textarea textarea-bordered"
                rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Phone Number</span></label>
              <input
                type="tel"
                className="input input-bordered"
                placeholder="+254700000000"
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Preferred Currency</span></label>
              <select
                className="select select-bordered"
                value={form.preferred_currency}
                onChange={(e) => setForm({ ...form, preferred_currency: e.target.value as CurrencyCode })}
              >
                {Object.values(CURRENCIES).map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.code} – {c.name}</option>
                ))}
              </select>
            </div>

            <div className="divider text-xs">Notifications</div>
            <div className="flex gap-6">
              <label className="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={form.email_notifications}
                  onChange={(e) => setForm({ ...form, email_notifications: e.target.checked })}
                />
                <span className="label-text">Email</span>
              </label>
              <label className="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={form.sms_notifications}
                  onChange={(e) => setForm({ ...form, sms_notifications: e.target.checked })}
                />
                <span className="label-text">SMS</span>
              </label>
            </div>

            <button
              className={`btn btn-primary w-full ${saving ? 'loading' : ''}`}
              onClick={handleSave}
              disabled={saving}
            >
              {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Referral */}
      {profile?.referral_code && (
        <div className="card bg-base-200 mt-6">
          <div className="card-body py-4">
            <h2 className="card-title text-base">🎁 Referral Program</h2>
            <p className="text-sm text-base-content/70">Share your code and earn bonuses when friends join.</p>
            <div className="flex gap-2 mt-2">
              <input
                className="input input-bordered flex-1 font-mono text-sm"
                readOnly
                value={profile.referral_code}
              />
              <button
                className="btn btn-outline btn-sm"
                onClick={() => navigator.clipboard.writeText(
                  `${window.location.origin}?ref=${profile.referral_code}`
                )}
              >
                Copy Link
              </button>
            </div>
            <p className="text-xs mt-1 text-base-content/50">{profile.referral_count} referrals so far</p>
          </div>
        </div>
      )}
    </div>
  )
}
