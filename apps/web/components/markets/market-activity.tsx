// components/markets/market-activity.tsx
import { formatDistanceToNow } from 'date-fns'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActivityItem {
  id: string
  user_id: string
  action: string
  amount_usd: number | null
  side: 'yes' | 'no' | null
  price: number | null
  created_at: string | null | null
  user?: {
    display_name: string | null
    username: string | null
  }
}

interface MarketActivityProps {
  activity: ActivityItem[]
}

export function MarketActivity({ activity }: MarketActivityProps) {
  if (!activity.length) {
    return (
      <p className="text-center text-muted-foreground text-sm py-4">
        No activity yet
      </p>
    )
  }

  return (
    <div className="space-y-2.5">
      {activity.map((item) => {
        const isBuy = item.action === 'bet_yes' || item.action === 'bet_no'
        const isYes = item.side === 'yes'
        const displayName = item.user?.display_name || item.user?.username || `User...${item.user_id.slice(-4)}`

        return (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 min-w-0">
              {isBuy && (
                isYes
                  ? <TrendingUp className="w-3.5 h-3.5 text-yes flex-none" />
                  : <TrendingDown className="w-3.5 h-3.5 text-no flex-none" />
              )}
              <span className="truncate text-muted-foreground">
                <span className="font-medium text-foreground">{displayName}</span>
                {' '}
                {isBuy
                  ? `bet ${isYes ? 'YES' : 'NO'} at ${item.price ? Math.round(item.price * 100) : '?'}¢`
                  : item.action.replace(/_/g, ' ')
                }
              </span>
            </div>
            <div className="flex items-center gap-3 flex-none ml-2">
              {item.amount_usd && (
                <span className={cn(
                  'text-xs font-medium',
                  isYes ? 'text-yes' : 'text-no'
                )}>
                  ${item.amount_usd.toFixed(2)}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {item.created_at ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true }) : ''}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
