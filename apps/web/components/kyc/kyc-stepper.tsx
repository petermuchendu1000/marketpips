// components/kyc/kyc-stepper.tsx
// Progress indicator for the KYC console.
//   - variant="vertical": full rail with connectors + descriptors for the desktop
//     trust bridge; the active step is emphasised, completed steps are checked.
//   - variant="compact": "Step X of N" + label + progress bar for narrow panels.
// Steps carry three states - done, current, upcoming - never relying on color
// alone (icon + weight + text all shift).
import type { ReactNode } from 'react'
import { IconCheck } from '@/components/ui/icons'

export interface StepDef {
  key: string
  label: string
  icon: ReactNode
  /** One-line descriptor shown in the vertical rail. */
  desc?: string
}

interface KycStepperProps {
  steps: StepDef[]
  /** Index of the current step (0-based). */
  current: number
  variant?: 'vertical' | 'compact'
}

export function KycStepper({ steps, current, variant = 'vertical' }: KycStepperProps) {
  if (variant === 'compact') {
    const pct = steps.length > 1 ? ((current + 1) / steps.length) * 100 : 0
    return (
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-text-primary">{steps[current]?.label}</span>
          <span className="font-mono text-xs text-text-muted">
            Step {current + 1} of {steps.length}
          </span>
        </div>
        <div className="prob-bar" role="progressbar" aria-valuenow={current + 1} aria-valuemin={1} aria-valuemax={steps.length}>
          <div className="prob-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  // Vertical rail
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const done = i < current
        const active = i === current
        const isLast = i === steps.length - 1
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Connector */}
            {!isLast && (
              <span
                aria-hidden
                className={`absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px ${
                  done ? 'bg-yes' : 'bg-hairline'
                }`}
              />
            )}
            {/* Node */}
            <span
              aria-current={active ? 'step' : undefined}
              className={`relative z-10 flex h-8 w-8 flex-none items-center justify-center rounded-pill border transition-colors ${
                done
                  ? 'border-yes bg-yes text-white'
                  : active
                    ? 'border-pip-500 bg-pip-100 text-pip-500 shadow-[0_0_0_4px_var(--pip-100)]'
                    : 'border-hairline bg-surface text-text-muted'
              }`}
            >
              {done ? <IconCheck size={15} strokeWidth={2.5} /> : step.icon}
            </span>
            {/* Copy */}
            <div className="min-w-0 pt-1">
              <span
                className={`block text-sm font-semibold leading-none ${
                  active ? 'text-text-primary' : done ? 'text-text-secondary' : 'text-text-muted'
                }`}
              >
                {step.label}
              </span>
              {step.desc && (
                <span className="mt-1 block text-xs leading-snug text-text-muted">{step.desc}</span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
