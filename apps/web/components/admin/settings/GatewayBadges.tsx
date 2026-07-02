// components/admin/settings/GatewayBadges.tsx — gateway status pills.
function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' + className}>
      {children}
    </span>
  )
}

export function EnvBadge({ environment }: { environment: string }) {
  const prod = environment === 'production'
  return (
    <Pill className={prod ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}>
      {environment}
    </Pill>
  )
}

export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <Pill className={enabled ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}>
      {enabled ? 'enabled' : 'disabled'}
    </Pill>
  )
}

export function HealthBadge({ ok, at }: { ok: boolean | null; at?: string | null }) {
  if (ok === null || ok === undefined) return <span className="text-xs text-muted-foreground">never tested</span>
  return (
    <Pill className={ok ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}>
      {ok ? 'healthy' : 'failing'}
      {at ? ` · ${new Date(at).toLocaleDateString()}` : ''}
    </Pill>
  )
}
