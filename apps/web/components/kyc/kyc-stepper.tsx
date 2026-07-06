// components/kyc/kyc-stepper.tsx
// Progress indicator for the KYC flow. Full horizontal rail with connectors on
// desktop; a compact "Step X of N" + progress bar on narrow panels. Steps carry
// three states — done, current, upcoming — never relying on color alone.
import type { ReactNode } from 'react'
import { IconCheck } from '@/components/ui/icons'

export interface StepDef {
  key: string
  label: string
  icon: ReactNode
}

interface KycStepperProps {
  steps: StepDef[]
  /** Index of the current step (0-based). */
  current: number
}

export function KycStepper({ steps, current }: KycStepperProps) {
  const pct = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 0

  return (
    <div>
      {/* Compact (mobile) */}
      <div className="sm:hidden">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-text-primary">{steps[current]?.label}</span>
          <span className="font-mono text-text-muted">
            Step {current + 1} of {steps.length}
          </span>
        </div>
        <div className="prob-bar">
          <div className="prob-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Full rail (desktop) */}
      <ol className="hidden items-center sm:flex">
        {steps.map((step, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={step.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <span
                  aria-current={active ? 'step' : undefined}
                  className={`flex h-9 w-9 items-center justify-center rounded-pill border transition-colors ${
                    done
                      ? 'border-yes bg-yes text-white'
                      : active
                        ? 'border-pip-500 bg-pip-100 text-pip-500'
                        : 'border-hairline bg-surface text-text-muted'
                  }`}
                >
                  {done ? <IconCheck size={16} strokeWidth={2.5} /> : step.icon}
                </span>
                <span
                  className={`text-[11px] font-medium ${
                    active ? 'text-text-primary' : 'text-text-muted'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span
                  className={`mx-2 h-px flex-1 ${done ? 'bg-yes' : 'bg-hairline'}`}
                  aria-hidden
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
