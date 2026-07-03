-- ============================================================
-- MarketPips - Migration 018: Per-user preferred locale (i18n)
-- ============================================================
-- Module 17.4. Persists a signed-in user's UI language choice alongside the
-- existing profiles.preferred_currency (migration 001). The app selects the
-- active locale from the NEXT_LOCALE cookie for anonymous visitors, and mirrors
-- this column into that cookie on sign-in so a returning user keeps their
-- language across devices/sessions.
--
-- Robustness: idempotent (IF NOT EXISTS) so it is safe to re-run in CI/local.
-- The CHECK constraint keeps the column in lock-step with i18n/config.ts LOCALES
-- (en, sw, fr, am); adding a locale is a one-line migration + a catalog file.
-- RLS on `profiles` (migration 001) already restricts writes to auth.uid(),
-- so no new policy is required — a user can only change their own locale.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'en';

-- Constrain to the shipped locale registry. Dropped-and-recreated so re-running
-- the migration after the allowed set changes stays deterministic.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_locale_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_locale_check
  CHECK (preferred_locale IN ('en', 'sw', 'fr', 'am'));

COMMENT ON COLUMN public.profiles.preferred_locale IS
  'BCP-47 UI language for this user (Module 17.4). Mirrored into the NEXT_LOCALE cookie on sign-in. Must match i18n/config.ts LOCALES.';
