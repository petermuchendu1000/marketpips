// app/admin/layout.tsx — Admin control-plane shell.
//
// Server component: resolves the operator, enforces portal access (defence in
// depth atop middleware + RLS), and renders the capability-filtered nav so each
// operator only sees the sections they can use. superadmin sees everything.
import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth'
import { canAccessAdminPortal, isSuperadmin } from '@/lib/admin/rbac'
import { visibleNav } from '@/lib/admin/nav'
import { AdminNav } from '@/components/admin/AdminNav'

export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  moderator: 'Moderator',
  finance: 'Finance',
  support: 'Support',
  resolver: 'Resolver',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/auth/login?next=/admin')
  if (!canAccessAdminPortal(ctx.role)) redirect('/')

  const groups = visibleNav(ctx.role)
  const superadmin = isSuperadmin(ctx.role)

  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-col md:flex-row">
        <AdminNav groups={groups} />

        <div className="min-w-0 flex-1">
          {/* Top bar */}
          <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-card/80 px-4 py-3 backdrop-blur md:px-8">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Control Plane</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ' +
                  (superadmin
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-primary/10 text-primary')
                }
                title={superadmin ? 'God-mode: holds every capability' : undefined}
              >
                {superadmin && <span aria-hidden>👑</span>}
                {ROLE_LABEL[ctx.role] ?? ctx.role}
              </span>
            </div>
          </header>

          <main className="p-4 md:p-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
