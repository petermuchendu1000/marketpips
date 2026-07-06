// components/kyc/level-badge.tsx
// Verification-level indicator (Basic → Enhanced). Basic = email + phone;
// Enhanced = + government ID, selfie and address. The current level is derived
// from completed steps so the badge always reflects real progress.
import { IconShield } from '@/components/ui/icons'

export type KycLevel = 'basic' | 'enhanced'

interface LevelBadgeProps {
  level: KycLevel
  /** When true, the level is submitted but awaiting review. */
  pending?: boolean
}

export function LevelBadge({ level, pending }: LevelBadgeProps) {
  const isEnhanced = level === 'enhanced'
  return (
    <span
      className={`badge gap-1.5 ${isEnhanced ? 'badge-green' : 'badge-muted'}`}
      title={
        isEnhanced
          ? 'Enhanced: government ID, selfie and address'
          : 'Basic: email and phone verified'
      }
    >
      <IconShield size={12} />
      {isEnhanced ? 'Enhanced' : 'Basic'}
      {pending && <span className="opacity-70">· pending</span>}
    </span>
  )
}
