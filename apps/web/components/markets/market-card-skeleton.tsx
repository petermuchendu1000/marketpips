// components/markets/market-card-skeleton.tsx
// Loading placeholder — mirrors MarketCard's exact structure so the grid has
// zero layout shift (CLS) when live data replaces skeletons. Tokens-only.
export function MarketCardSkeleton() {
  return (
    <div className="card p-4 space-y-3" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-4 w-12 rounded" />
      </div>
      <div className="space-y-1.5">
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="skeleton h-4 w-10 rounded" />
        <div className="skeleton h-4 w-10 rounded" />
      </div>
      <div className="skeleton h-2 w-full rounded-full" />
      <div className="flex items-center justify-between pt-1">
        <div className="skeleton h-3.5 w-16 rounded" />
        <div className="skeleton h-3.5 w-12 rounded" />
      </div>
    </div>
  )
}
