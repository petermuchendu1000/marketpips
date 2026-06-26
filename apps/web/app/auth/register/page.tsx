'use client'

// app/auth/register/page.tsx
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { Loader2, CheckCircle2 } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const referralCode = searchParams.get('ref') || ''
  const supabase = createClient()

  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [country, setCountry] = useState('KE')
  const [referral, setReferral] = useState(referralCode)
  const [agreed, setAgreed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed) { toast.error('Please agree to terms'); return }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }

    setIsLoading(true)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: displayName,
          country_code: country,
          referral_code: referral || undefined,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      toast.error(error.message)
    } else {
      setStep('verify')
    }
    setIsLoading(false)
  }

  if (step === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <CheckCircle2 className="w-16 h-16 text-yes mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Check Your Email</h1>
          <p className="text-muted-foreground mb-6">
            We sent a verification link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <Link href="/auth/login" className="text-primary hover:underline">
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black">🎯 MarketPips</Link>
          <p className="text-muted-foreground mt-2">Start predicting today</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-bold mb-6">Create Account</h1>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                minLength={2}
                maxLength={50}
                className="w-full px-4 py-2.5 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                placeholder="John Kamau"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="KE">🇰🇪 Kenya</option>
                <option value="UG">🇺🇬 Uganda</option>
                <option value="TZ">🇹🇿 Tanzania</option>
                <option value="RW">🇷🇼 Rwanda</option>
                <option value="ZM">🇿🇲 Zambia</option>
                <option value="ET">🇪🇹 Ethiopia</option>
                <option value="BI">🇧🇮 Burundi</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Referral Code <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                type="text"
                value={referral}
                onChange={(e) => setReferral(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                placeholder="Enter referral code"
              />
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="text-xs text-muted-foreground">
                I agree to the{' '}
                <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                I confirm I am 18+ years old.
              </span>
            </label>

            <button
              type="submit"
              disabled={isLoading || !agreed}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 transition-all active:scale-95"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Creating account...
                </span>
              ) : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-primary font-medium hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
