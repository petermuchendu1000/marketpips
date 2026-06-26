'use client'

// components/layout/stats-bar.tsx
interface StatsBarProps {
  activeMarkets: number
  totalVolume: number
}

export function StatsBar({ activeMarkets, totalVolume }: StatsBarProps) {
  return (
    <div className="flex flex-wrap gap-4 mb-6 p-4 rounded-2xl border bg-card">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="text-lg">🏪</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Active Markets</p>
          <p className="font-bold text-lg">{activeMarkets.toLocaleString()}</p>
        </div>
      </div>

      <div className="h-10 w-px bg-border mx-1 self-center hidden sm:block" />

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="text-lg">💰</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Volume</p>
          <p className="font-bold text-lg">
            ${totalVolume >= 1000000
              ? `${(totalVolume / 1000000).toFixed(1)}M`
              : totalVolume >= 1000
              ? `${(totalVolume / 1000).toFixed(1)}K`
              : totalVolume.toFixed(0)
            }
          </p>
        </div>
      </div>

      <div className="h-10 w-px bg-border mx-1 self-center hidden sm:block" />

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="text-lg">🌍</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Countries</p>
          <p className="font-bold text-lg">7</p>
        </div>
      </div>

      <div className="h-10 w-px bg-border mx-1 self-center hidden sm:block" />

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="text-lg">📱</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Payment Methods</p>
          <p className="font-bold text-sm">M-Pesa · MTN · Airtel</p>
        </div>
      </div>
    </div>
  )
}
