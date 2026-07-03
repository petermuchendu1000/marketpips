// app/api/locale/route.ts — switch the active UI language (Module 17.4).
//
// POST { locale } sets the NEXT_LOCALE cookie that i18n/request.ts reads to pick
// the message catalog, and — for signed-in users — persists the choice to
// profiles.preferred_locale (migration 018) so it follows them across devices.
// Anonymous visitors get cookie-only persistence, which is enough for the SSR
// locale resolver. RLS scopes the update to the caller's own row.
//
// The cookie is intentionally NOT httpOnly: it only selects a display language
// (no security value) and staying readable keeps future client-side locale
// reads cheap. It is SameSite=Lax + long-lived so the choice survives sessions.
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { LOCALES, LOCALE_COOKIE } from '@/i18n/config'

export const dynamic = 'force-dynamic'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

const schema = z.object({
  locale: z.enum(LOCALES),
})

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid locale', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { locale } = parsed.data

  // 1. Cookie: the source of truth for the SSR locale resolver. Always set,
  //    for both anonymous and signed-in users.
  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
  })

  // 2. Profile: best-effort persistence for signed-in users so the choice is
  //    portable across devices. A failure here never blocks the switch — the
  //    cookie already took effect.
  let persisted = false
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_locale: locale })
        .eq('id', user.id)
      persisted = !error
    }
  } catch {
    // Ignore — cookie is authoritative for rendering.
  }

  return NextResponse.json({ success: true, locale, persisted })
}
