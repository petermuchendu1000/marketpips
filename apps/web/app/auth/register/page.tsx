'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogoMark, IconShield, IconArrowRight, IconCheck } from '@/components/ui/icons'

const COUNTRIES = [
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', currency: 'KES' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬', currency: 'UGX' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', currency: 'TZS' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼', currency: 'RWF' },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲', currency: 'ZMW' },
  { code: 'ET', name: 'Ethiopia', flag: '🇪🇹', currency: 'ETB' },
  { code: 'BI', name: 'Burundi', flag: '🇧🇮', currency: 'BIF' },
]

const PERKS = [
  'Trade on elections, sports, crypto & more',
  'Deposit with M-Pesa, MTN MoMo, Airtel',
  'Multi-currency wallets (KES, UGX, TZS…)',
  'Earn bonuses for referring friends',
]

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [country, setCountry] = useState('KE')
  const [refCode, setRefCode] = useState(
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') ?? '' : ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError('Password must be at least 8 characters')
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
          country_code: country,
          preferred_currency: COUNTRIES.find(c => c.code === country)?.currency ?? 'KES',
          referral_code_used: refCode || null,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  if (done) return (
    <div className="min-h-[calc(100dvh-56px)] flex items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: 'var(--green-dim)' }}>
          <IconCheck size={28} className="text-green-light" strokeWidth={2.5} />
        </div>
        <h2 className="font-display text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          Check your email
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
        </p>
        <Link href="/auth/login" className="btn btn-secondary w-full">
          Go to Sign in
        </Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-[calc(100dvh-56px)] flex items-start justify-center px-4 py-10"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <LogoMark size={44} className="mb-3" />
          <h1 className="font-display text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Create your account
          </h1>
          <p className="text-sm mt-1 text-center" style={{ color: 'var(--text-muted)' }}>
            Free to join · No credit card needed
          </p>
        </div>

        {/* Perks */}
        <div className="rounded-xl p-4 mb-6 space-y-2"
          style={{ background: 'var(--green-faint)', border: '1px solid rgba(34,197,94,0.15)' }}>
          {PERKS.map(p => (
            <div key={p} className="flex items-center gap-2 text-xs"
              style={{ color: 'var(--text-secondary)' }}>
              <IconCheck size={12} className="text-green-light flex-shrink-0" strokeWidth={2.5} />
              <span>{p}</span>
            </div>
          ))}
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label htmlFor="full-name" className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
              style={{ color: 'var(--text-muted)' }}>Full Name</label>
            <input id="full-name"
              className="input"
              type="text"
              placeholder="John Kamau"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
              style={{ color: 'var(--text-muted)' }}>Email</label>
            <input id="email"
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
              style={{ color: 'var(--text-muted)' }}>Password</label>
            <input id="password"
              className="input"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label htmlFor="country" className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
              style={{ color: 'var(--text-muted)' }}>Country</label>
            <select id="country"
              className="input"
              value={country}
              onChange={e => setCountry(e.target.value)}
            >
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} · {c.currency}
                </option>
              ))}
            </select>
          </div>

          {refCode !== '' && (
            <div>
              <label htmlFor="referral-code" className="text-xs font-semibold uppercase tracking-wide block mb-1.5"
                style={{ color: 'var(--text-muted)' }}>Referral Code</label>
              <input id="referral-code"
                className="input font-mono"
                type="text"
                value={refCode}
                onChange={e => setRefCode(e.target.value)}
                placeholder="Optional"
              />
            </div>
          )}

          {error && (
            <div className="text-xs p-3 rounded-lg"
              style={{ background: 'var(--red-faint)', color: 'var(--red)', border: '1px solid var(--red-dim)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg w-full mt-2"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                Creating account…
              </span>
            ) : (
              <>Create free account <IconArrowRight size={15} /></>
            )}
          </button>
        </form>

        <p className="text-center text-sm mt-5" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link href="/auth/login" style={{ color: 'var(--green)', fontWeight: 600 }}>
            Sign in
          </Link>
        </p>

        <div className="flex items-center justify-center gap-1.5 mt-6 text-xs"
          style={{ color: 'var(--text-muted)' }}>
          <IconShield size={11} />
          <span>Your data is encrypted and never shared</span>
        </div>
      </div>
    </div>
  )
}
