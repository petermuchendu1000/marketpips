// apps/web/i18n/request.ts — next-intl server request config (no-routing mode).
// Resolves the active locale from the NEXT_LOCALE cookie (falling back to the
// default) and loads its message catalog. A missing catalog falls back to `en`
// so a partial locale never crashes the app.
import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, resolveLocale, type AppLocale } from './config'

async function loadMessages(locale: AppLocale) {
  try {
    return (await import(`../messages/${locale}.json`)).default
  } catch {
    return (await import(`../messages/${DEFAULT_LOCALE}.json`)).default
  }
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = resolveLocale(cookieStore.get('NEXT_LOCALE')?.value)
  return {
    locale,
    messages: await loadMessages(locale),
    // App-wide formatting defaults; components can override per call.
    now: new Date(),
    timeZone: 'Africa/Nairobi',
  }
})
