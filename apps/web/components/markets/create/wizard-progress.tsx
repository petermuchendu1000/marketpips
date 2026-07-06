// components/markets/create/wizard-progress.tsx
// Numbered step rail for the create-market wizard. Completed steps are checkable
// (jump back to edit); the current step is emphasised; upcoming steps are muted.
// Never color-only — number/check + weight + label all shift. Compact on mobile.
import { IconCheck } from '@/components/ui/icons'

interface WizardProgressProps {
  steps: string[]
  current: number
  /** Highest step the user has reached (for jump-back affordances). */
  maxReached: number
  onJump: (index: number) => void
}

export function WizardProgress({ steps, current, maxReached, onJump }: WizardProgressProps) {
  return (
    <nav aria-label="Progress">
      {/* Mobile: compact */}
      <div className="sm:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-text-primary">{steps[current]}</span>
          <span className="font-mono text-xs text-text-muted">
            Step {current + 1} of {steps.length}
          </span>
        </div>
        <div className="prob-bar" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={steps.length}>
          <div className="prob-bar-fill" style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      {/* Desktop: full rail */}
      <ol className="hidden items-center sm:flex">
        {steps.map((label, i) => {
          const done = i < current
          const active = i === current
          const reachable = i <= maxReached
          return (
            <li key={label} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => reachable && onJump(i)}
                disabled={!reachable}
                aria-current={active ? 'step' : undefined}
                className={`group flex items-center gap-2.5 ${reachable && !active ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span
                  className={`flex h-8 w-8 flex-none items-center justify-center rounded-pill border text-[13px] font-semibold transition-colors ${
                    done
                      ? 'border-pip-500 bg-pip-500 text-white'
                      : active
                        ? 'border-pip-500 bg-pip-100 text-pip-500 shadow-[0_0_0_4px_var(--pip-100)]'
                        : 'border-hairline bg-surface text-text-muted'
                  }`}
                >
                  {done ? <IconCheck size={15} strokeWidth={2.5} /> : i + 1}
                </span>
                <span
                  className={`whitespace-nowrap text-[13px] font-medium ${
                    active ? 'text-text-primary' : done ? 'text-text-secondary group-hover:text-text-primary' : 'text-text-muted'
                  }`}
                >
                  {label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span className={`mx-3 h-px flex-1 ${done ? 'bg-pip-400' : 'bg-hairline'}`} aria-hidden />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
