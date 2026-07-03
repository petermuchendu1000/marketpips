// apps/web/i18n/config.ts — locale registry (Module 17.3/17.4).
// Cookie/profile-based locale selection (no URL segment) so we avoid an
// app/[locale] restructure. `en` is complete at launch; others are scaffolded.
export const LOCALES = ['en', 'sw', 'fr', 'am'] as const
export type AppLocale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'en'

// Cookie the middleware/UI set when a user switches locale; also mirrors
// profiles.preferred_locale (migration 018) for signed-in users.
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: 'English',
  sw: 'Kiswahili',
  fr: 'Français',
  am: 'አማርኛ',
}

// Default IANA timezone per locale for date/time formatting (East Africa).
export const LOCALE_TIMEZONE: Record<AppLocale, string> = {
  en: 'Africa/Nairobi',
  sw: 'Africa/Nairobi',
  fr: 'Africa/Kigali',
  am: 'Africa/Addis_Ababa',
}

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return !!value && (LOCALES as readonly string[]).includes(value)
}

export function resolveLocale(value: string | undefined | null): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE
}
