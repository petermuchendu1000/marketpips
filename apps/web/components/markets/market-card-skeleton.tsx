// components/markets/market-card-skeleton.tsx
export function MarketCardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-5 w-20 skeleton rounded-full" />
        <div className="h-4 w-16 skeleton rounded" />
      </div>
      <div className="space-y-1.5">
        <div className="h-4 w-full skeleton rounded" />
        <div className="h-4 w-3/4 skeleton rounded" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-16 skeleton rounded-full" />
        <div className="h-6 w-14 skeleton rounded-full" />
      </div>
      <div className="h-2 skeleton rounded-full" />
      <div className="flex justify-between">
        <div className="h-3.5 w-20 skeleton rounded" />
        <div className="h-3.5 w-16 skeleton rounded" />
      </div>
    </div>
  )
}
