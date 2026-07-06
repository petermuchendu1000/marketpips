// components/kyc/verification-meter.tsx
// Verification-level ladder (Basic -> Enhanced). Shows the live achieved tier and
// names exactly what each tier unlocks, so the ID/selfie ask always has a payoff
// in view. Pure Pip system, custom icons, never color-only (icons + labels carry
// state). Used inside the console's trust bridge.
import type { KycLevel } from '@/components/kyc/level-badge'
import { IconCheck, IconShield } from '@/components/ui/icons'

interface VerificationMeterProps {
  /** Live achieved level, derived from completed steps. */
  level: KycLevel
  /** True once the packet is submitted and awaiting compliance review. */
  pending?: boolean
}

type TierState = 'done' | 'current' | 'upcoming'

const TIERS: {
  key: KycLevel
  name: string
  unlocks: string
}[] = [
  { key: 'basic', name: 'Basic', unlocks: 'Trade markets · everyday limits' },
  { key: 'enhanced', name: 'Enhanced', unlocks: 'Full deposits, withdrawals & top limits' },
]

export function VerificationMeter({ level, pending }: VerificationMeterProps) {
  // Basic is always in play (email is confirmed at signup). Enhanced becomes the
  // current target until every Enhanced step is satisfied.
  const enhancedDone = level === 'enhanced'
  const fillPct = enhancedDone ? 100 : 50

  const stateFor = (key: KycLevel): TierState => {
    if (key === 'basic') return enhancedDone ? 'done' : 'current'
    return enhancedDone ? 'current' : 'upcoming'
  }

  return (
    <section aria-label="Verification level" className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Verification level
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted">
          <IconShield size={11} />
          {pending ? 'In review' : enhancedDone ? 'Enhanced ready' : 'Basic'}
        </span>
      </div>

      <div className="relative pl-6">
        {/* Rail track + live fill */}
        <span
          aria-hidden
          className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-hairline"
        />
        <span
          aria-hidden
          className="absolute left-[7px] top-1.5 w-px bg-yes transition-[height] duration-500"
          style={{ height: `calc((100% - 12px) * ${fillPct / 100})` }}
        />

        <ol className="space-y-4">
          {TIERS.map((tier) => {
            const st = stateFor(tier.key)
            return (
              <li key={tier.key} className="relative">
                {/* Node */}
                <span
                  aria-hidden
                  className={`absolute -left-6 top-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-pill border transition-colors ${
                    st === 'done'
                      ? 'border-yes bg-yes text-white'
                      : st === 'current'
                        ? 'border-pip-500 bg-surface text-pip-500'
                        : 'border-hairline bg-surface text-text-muted'
                  }`}
                >
                  {st === 'done' ? (
                    <IconCheck size={9} strokeWidth={3} />
                  ) : (
                    <span
                      className={`h-1.5 w-1.5 rounded-pill ${
                        st === 'current' ? 'bg-pip-500' : 'bg-hairline-strong'
                      }`}
                    />
                  )}
                </span>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${
                      st === 'upcoming' ? 'text-text-muted' : 'text-text-primary'
                    }`}
                  >
                    {tier.name}
                  </span>
                  {st === 'done' && (
                    <span className="badge badge-green">Achieved</span>
                  )}
                  {st === 'current' && !pending && (
                    <span className="badge badge-muted">
                      {tier.key === 'enhanced' ? 'In progress' : 'Active'}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-snug text-text-muted">{tier.unlocks}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
