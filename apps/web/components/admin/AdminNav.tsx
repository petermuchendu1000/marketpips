'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  PenSquare,
  Megaphone,
  ShieldCheck,
  BarChart3,
  Flag,
  Wallet,
  Coins,
  Settings,
  Banknote,
  Plug,
  Bell,
  KeyRound,
  ScrollText,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdminNavGroup } from '@/lib/admin/nav'

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  PenSquare,
  Megaphone,
  ShieldCheck,
  BarChart3,
  Flag,
  Wallet,
  Coins,
  Settings,
  Banknote,
  Plug,
  Bell,
  KeyRound,
  ScrollText,
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

function NavList({
  groups,
  pathname,
  onNavigate,
}: {
  groups: AdminNavGroup[]
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <nav className="flex flex-col gap-6 p-4" aria-label="Admin navigation">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutDashboard
              const active = isActive(pathname, item.href, item.exact)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-foreground/80 hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
        <span className="font-black">🛠️ Admin</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="rounded-lg border p-2 hover:bg-muted"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-b bg-card md:hidden">
          <NavList groups={groups} pathname={pathname} onNavigate={() => setOpen(false)} />
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-card md:block">
        <div className="sticky top-0 max-h-screen overflow-y-auto">
          <div className="px-6 py-5">
            <Link href="/admin" className="font-black text-lg">
              🛠️ Admin
            </Link>
          </div>
          <NavList groups={groups} pathname={pathname} />
        </div>
      </aside>
    </>
  )
}
