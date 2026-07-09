// components/markets/market-card-skeleton.tsx
// Loading placeholder — mirrors the Polymarket-style MarketCard structure
// (header + two action buttons + footer) so the grid has zero layout shift
// (CLS) when live data replaces skeletons. Tokens-only.
export function MarketCardSkeleton() {
  return (
    <div className="market-card flex flex-col gap-3" aria-hidden="true">
      <div className="flex items-start gap-2.5">
        <div className="skeleton h-8 w-8 flex-none rounded-md" />
        <div className="flex-1 space-y-1.5">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-2/3 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="skeleton h-11 rounded-lg" />
        <div className="skeleton h-11 rounded-lg" />
      </div>
      <div className="flex items-center justify-between pt-2">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-3 w-10 rounded" />
      </div>
    </div>
  )
}
