'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogoMark, IconMail, IconShield, IconArrowRight } from '@/components/ui/icons'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else { router.push('/'); router.refresh() }
  }

  return (
    <div className="min-h-[calc(100dvh-56px)] flex items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <LogoMark size={48} className="mb-3" />
          <h1 className="font-display text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Welcome back
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Sign in to your MarketPips account
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
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
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}>Password</label>
              <Link href="/auth/reset-password" className="text-xs"
                style={{ color: 'var(--green)' }}>
                Forgot?
              </Link>
            </div>
            <input id="password"
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

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
                Signing in…
              </span>
            ) : (
              <>Sign in <IconArrowRight size={15} /></>
            )}
          </button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
          No account?{' '}
          <Link href="/auth/register" style={{ color: 'var(--green)', fontWeight: 600 }}>
            Create one free
          </Link>
        </p>

        <div className="flex items-center justify-center gap-1.5 mt-8 text-xs"
          style={{ color: 'var(--text-muted)' }}>
          <IconShield size={12} />
          <span>End-to-end encrypted · No credit card needed</span>
        </div>
      </div>
    </div>
  )
}
