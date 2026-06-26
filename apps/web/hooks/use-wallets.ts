'use client'

// hooks/use-wallets.ts
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Wallet, CurrencyCode } from '@/types'
import { useAuth } from './use-auth'

interface UseWalletsReturn {
  wallets: Wallet[]
  preferredCurrency: CurrencyCode
  totalBalanceUsd: number
  isLoading: boolean
  getWallet: (currency: CurrencyCode) => Wallet | undefined
  refreshWallets: () => Promise<void>
  refresh: () => Promise<void>  // alias for refreshWallets
}

// Approximate exchange rates (will be replaced by real rates)
const APPROX_RATES: Record<string, number> = {
  KES: 0.00775,
  UGX: 0.000267,
  TZS: 0.000385,
  RWF: 0.000714,
  ZMW: 0.0385,
  ETB: 0.00714,
  BIF: 0.000333,
  USD: 1.0,
}

export function useWallets(): UseWalletsReturn {
  const { user, profile } = useAuth()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  const fetchWallets = useCallback(async () => {
    if (!user) {
      setWallets([])
      setIsLoading(false)
      return
    }

    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)

    setWallets((data as Wallet[]) || [])
    setIsLoading(false)
  }, [user, supabase])

  useEffect(() => {
    fetchWallets()
  }, [fetchWallets])

  const getWallet = useCallback(
    (currency: CurrencyCode) => wallets.find((w) => w.currency === currency),
    [wallets]
  )

  const totalBalanceUsd = wallets.reduce((sum, w) => {
    const rate = APPROX_RATES[w.currency] || 1
    return sum + w.available_balance * rate
  }, 0)

  return {
    wallets,
    preferredCurrency: (profile?.preferred_currency || 'KES') as CurrencyCode,
    totalBalanceUsd,
    isLoading,
    getWallet,
    refreshWallets: fetchWallets,
    refresh: fetchWallets, // alias
  }
}
