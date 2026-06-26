'use client'

// components/layout/navbar.tsx
import Link from 'next/link'
import { useState } from 'react'
import { Menu, X, Bell, Wallet, LogOut, User, Settings, ChevronDown } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useWallets } from '@/hooks/use-wallets'
import { DepositModal } from '@/components/payments/deposit-modal'
import WithdrawModal from '@/components/payments/withdraw-modal'
import { cn } from '@/lib/utils'

export function Navbar() {
  const { user, profile, isLoading, signOut } = useAuth()
  const { totalBalanceUsd } = useWallets()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  return (
    <>
      <nav className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 font-black text-xl">
              <span className="text-2xl">🎯</span>
              <span>MarketPips</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              <Link href="/markets" className="text-muted-foreground hover:text-foreground transition-colors">
                Markets
              </Link>
              <Link href="/leaderboard" className="text-muted-foreground hover:text-foreground transition-colors">
                Leaderboard
              </Link>
              {user && (
                <>
                  <Link href="/portfolio" className="text-muted-foreground hover:text-foreground transition-colors">
                    Portfolio
                  </Link>
                  <Link href="/markets/create" className="text-muted-foreground hover:text-foreground transition-colors">
                    Create
                  </Link>
                </>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {isLoading ? (
                <div className="h-8 w-24 skeleton rounded-lg" />
              ) : user ? (
                <>
                  {/* Add funds button */}
                  <button
                    onClick={() => setDepositOpen(true)}
                    className="hidden sm:flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Wallet className="w-4 h-4" />
                    Add Funds
                  </button>

                  {/* Balance display */}
                  <div className="hidden sm:block text-sm">
                    <span className="text-muted-foreground">~</span>
                    <span className="font-medium">${totalBalanceUsd.toFixed(2)}</span>
                  </div>

                  {/* Withdraw button */}
                  <button
                    onClick={() => setWithdrawOpen(true)}
                    className="hidden sm:flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl border hover:bg-muted transition-colors"
                  >
                    💸 Withdraw
                  </button>

                  {/* Notifications */}
                  <Link href="/notifications" className="relative p-2 rounded-xl hover:bg-muted transition-colors">
                    <Bell className="w-4 h-4" />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
                  </Link>

                  {/* User menu */}
                  <div className="relative">
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-muted transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                        {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
                      </div>
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    </button>

                    {userMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setUserMenuOpen(false)}
                        />
                        <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border bg-card shadow-lg z-50 overflow-hidden">
                          <div className="p-3 border-b">
                            <p className="font-medium text-sm truncate">
                              {profile?.display_name || 'Anonymous'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>
                          <Link href="/portfolio" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted" onClick={() => setUserMenuOpen(false)}>
                            <User className="w-4 h-4" /> Portfolio
                          </Link>
                          <Link href="/profile" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted" onClick={() => setUserMenuOpen(false)}>
                            👤 My Profile
                          </Link>
                          <Link href="/notifications" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted" onClick={() => setUserMenuOpen(false)}>
                            🔔 Notifications
                          </Link>
                          <Link href="/kyc" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted" onClick={() => setUserMenuOpen(false)}>
                            🪪 Verify Identity
                          </Link>
                          <Link href="/settings" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted" onClick={() => setUserMenuOpen(false)}>
                            <Settings className="w-4 h-4" /> Settings
                          </Link>
                          {profile?.role === 'admin' && (
                            <Link href="/admin" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-primary" onClick={() => setUserMenuOpen(false)}>
                              ⚙️ Admin Panel
                            </Link>
                          )}
                          <button
                            onClick={() => { signOut(); setUserMenuOpen(false) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-destructive"
                          >
                            <LogOut className="w-4 h-4" /> Sign Out
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/auth/login" className="text-sm font-medium px-3 py-1.5 rounded-xl hover:bg-muted transition-colors">
                    Sign In
                  </Link>
                  <Link href="/auth/register" className="text-sm font-medium px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                    Get Started
                  </Link>
                </div>
              )}

              {/* Mobile menu toggle */}
              <button
                className="md:hidden p-2 rounded-xl hover:bg-muted"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3 space-y-1">
            <Link href="/markets" className="block py-2 text-sm font-medium" onClick={() => setMobileOpen(false)}>
              Markets
            </Link>
            <Link href="/leaderboard" className="block py-2 text-sm font-medium" onClick={() => setMobileOpen(false)}>
              Leaderboard
            </Link>
            {user ? (
              <>
                <Link href="/portfolio" className="block py-2 text-sm font-medium" onClick={() => setMobileOpen(false)}>
                  Portfolio
                </Link>
                <button
                  onClick={() => { setDepositOpen(true); setMobileOpen(false) }}
                  className="w-full text-left py-2 text-sm font-medium text-primary"
                >
                  💰 Add Funds
                </button>
              </>
            ) : (
              <Link href="/auth/login" className="block py-2 text-sm font-medium text-primary" onClick={() => setMobileOpen(false)}>
                Sign In
              </Link>
            )}
          </div>
        )}
      </nav>

      <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
      {withdrawOpen && (
        <div className="modal modal-open">
          <div className="modal-box">
            <button className="btn btn-ghost btn-sm btn-circle absolute right-2 top-2" onClick={() => setWithdrawOpen(false)}>✕</button>
            <WithdrawModal onClose={() => setWithdrawOpen(false)} />
          </div>
          <div className="modal-backdrop" onClick={() => setWithdrawOpen(false)} />
        </div>
      )}
    </>
  )
}
