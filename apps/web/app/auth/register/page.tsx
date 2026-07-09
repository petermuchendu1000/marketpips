'use client'

// app/auth/register/page.tsx — Create account (Preview → Gate → Bridge)
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthShell } from '@/components/auth/auth-shell'
import { PasswordInput } from '@/components/auth/password-input'
import { LogoMark, IconShield, IconArrowRight, IconCheck } from '@/components/ui/icons'
import { safeRedirectPath } from '@/lib/security/sanitize'

const COUNTRIES = [
  { code: 'KE', name: 'Kenya', currency: 'KES' },
  { code: 'UG', name: 'Uganda', currency: 'UGX' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS' },
  { code: 'RW', name: 'Rwanda', currency: 'RWF' },
  { code: 'ZM', name: 'Zambia', currency: 'ZMW' },
  { code: 'ET', name: 'Ethiopia', currency: 'ETB' },
  { code: 'BI', name: 'Burundi', currency: 'BIF' },
]

/** 0..4 password strength from length + character variety. */
function scorePassword(pw: string): number {
  if (!pw) return 0
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  return Math.min(score, 4)
}

const STRENGTH = [
  { label: 'Too short', cls: 'bg-no' },
  { label: 'Weak', cls: 'bg-no' },
  { label: 'Fair', cls: 'bg-amber' },
  { label: 'Good', cls: 'bg-pip-500' },
  { label: 'Strong', cls: 'bg-yes' },
]

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [country, setCountry] = useState('KE')
  const [refCode, setRefCode] = useState(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('ref') ?? ''
      : '',
  )
  const [showRef, setShowRef] = useState(
    typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('ref'),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  // Preserve the pre-auth destination (e.g. an in-progress bet's market) so the
  // account flow returns there — through both the instant-session path and the
  // email-confirmation callback — instead of the landing page.
  const [next] = useState(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('next') ?? ''
      : '',
  )

  const strength = useMemo(() => scorePassword(password), [password])
  const canSubmit =
    !loading && name.trim().length > 1 && /\S+@\S+\.\S+/.test(email) && password.length >= 8

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError('Password must be at least 8 characters')
    setError('')
    setLoading(true)

    // Thread the return path through email confirmation: the callback reads
    // ?next and redirects there after exchanging the code for a session.
    const safeNext = safeRedirectPath(next)
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    if (safeNext !== '/') callbackUrl.searchParams.set('next', safeNext)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
          country_code: country,
          preferred_currency: COUNTRIES.find((c) => c.code === country)?.currency ?? 'KES',
          referral_code_used: refCode || null,
        },
        emailRedirectTo: callbackUrl.toString(),
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.session) {
      // Email confirmation disabled → session is live now; return immediately.
      router.push(safeNext)
      router.refresh()
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <AuthShell
        bridgeHeading="You're almost in."
        bridgeSub="Confirm your email to activate your account and claim your welcome wallet."
      >
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-pill bg-yes/10 text-yes">
            <IconCheck size={28} strokeWidth={2.5} />
          </div>
          <h2 className="font-display text-2xl text-text-primary">Check your email</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-text-secondary">
            We sent a confirmation link to <strong className="text-text-primary">{email}</strong>.
            Click it to activate your account.
          </p>
          <Link
            href={next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login'}
            className="btn btn-secondary mt-6 w-full"
          >
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      bridgeHeading="Start with an edge."
      bridgeSub="Create a free account in under a minute. No credit card, no lock-in — just markets priced by the crowd."
    >
      <div className="mb-6 flex flex-col items-center text-center lg:items-start lg:text-left">
        <LogoMark size={40} className="mb-3 lg:hidden" />
        <h1 className="font-display text-2xl text-text-primary">Create your account</h1>
        <p className="mt-1 text-sm text-text-muted">Free to join · No credit card needed</p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label htmlFor="full-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Full name
          </label>
          <input
            id="full-name"
            className="input w-full"
            type="text"
            placeholder="John Kamau"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Email
          </label>
          <input
            id="email"
            className="input w-full"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Password
          </label>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="new-password"
            describedBy="pw-strength"
          />
          {password.length > 0 && (
            <div id="pw-strength" className="mt-2">
              <div className="flex gap-1" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-pill transition-colors ${
                      i < strength ? STRENGTH[strength].cls : 'bg-hairline'
                    }`}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                Password strength: <span className="font-medium">{STRENGTH[strength].label}</span>
                {password.length < 8 && ' · at least 8 characters'}
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="country" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
            Country
          </label>
          <select
            id="country"
            className="input w-full"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} · {c.currency}
              </option>
            ))}
          </select>
        </div>

        {/* Referral — progressive disclosure */}
        {showRef ? (
          <div>
            <label htmlFor="ref" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Referral code <span className="font-normal normal-case text-text-muted">(optional)</span>
            </label>
            <input
              id="ref"
              className="input w-full"
              type="text"
              placeholder="Enter code"
              value={refCode}
              onChange={(e) => setRefCode(e.target.value)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowRef(true)}
            className="text-xs font-medium text-pip-500 hover:underline"
          >
            Have a referral code?
          </button>
        )}

        {error && (
          <div role="alert" aria-live="assertive" className="rounded-md border border-no/30 bg-no/10 p-3 text-xs text-no">
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-lg mt-1 w-full" disabled={!canSubmit}>
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
              Creating account…
            </span>
          ) : (
            <>
              Create free account <IconArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-text-muted">
        Already have an account?{' '}
        <Link
          href={next ? `/auth/login?next=${encodeURIComponent(next)}` : '/auth/login'}
          className="font-semibold text-pip-500 hover:underline"
        >
          Sign in
        </Link>
      </p>

      <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-text-muted">
        <IconShield size={11} />
        <span>Your data is encrypted and never shared</span>
      </div>
    </AuthShell>
  )
}
