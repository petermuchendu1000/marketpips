-- ============================================================
-- 01_flags_and_independent.sql
-- OPS RESTORE (incident: betting-panel UI regressed after a Supabase move)
--
-- ROOT CAUSE
--   The betting panel is entirely config/data-driven. When the project was
--   moved to a fresh Supabase, the schema + market data were migrated but the
--   dark-launch feature-flag ROWS in platform_settings were NOT. Every
--   dark-launch flag defaults OFF (lib/admin/settings.ts), so the panel silently
--   fell back to the legacy "simplex pick-one" board:
--     * no per-candidate Yes/No toggle  -> "where are the No buttons"
--     * the full sibling option list is always shown -> "why are other options
--       listed after I pick one and click Yes"
--     * order book never mounts          -> "where is the order book"
--
-- WHAT THIS SCRIPT DOES (idempotent, reversible)
--   1. Restores the dark-launch feature-flag rows the live app expects:
--        flags.independent_options  -> per-candidate binary Yes/No lines (No btn)
--        flags.pm_ticket            -> Polymarket-style compact order ticket
--        flags.clob                 -> CLOB order-book drawer + per-candidate Buy Yes/No
--   2. Opts the 7 multi-outcome (multiple_choice) markets into the INDEPENDENT
--      pricing model via the migration-023 RPC set_market_pricing_independent().
--      This gives per-candidate Yes/No on the AMM path immediately, and also
--      acts as the graceful fallback if flags.clob is ever killed (deploy != release).
--
-- ROLLBACK
--   * Flags:   update platform_settings set value='false'::jsonb where key in
--              ('flags.independent_options','flags.pm_ticket','flags.clob');
--   * Markets: update markets set options_pricing_mode='simplex' where <ids>;
--     (q_shares / prices are untouched by 023, so simplex still works.)
--
-- APPLY
--   psql "$SEED_DB_URL" -v ON_ERROR_STOP=1 -f 01_flags_and_independent.sql
-- ============================================================

BEGIN;

-- 1. Feature flags (upsert; matches the SETTINGS_SCHEMA keys the app reads) ---
INSERT INTO public.platform_settings (key, value) VALUES
  ('flags.independent_options', 'true'::jsonb),
  ('flags.pm_ticket',           'true'::jsonb),
  ('flags.clob',                'true'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Opt the multi-outcome markets into the independent per-candidate model ---
--    Only active multiple_choice markets that still carry >2 options. The RPC is
--    idempotent: it seeds per-candidate (q_yes,q_no,yes_price,no_price) and sets
--    options_pricing_mode='independent'. Re-running is safe.
DO $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN
    SELECT DISTINCT mk.id, mk.slug
    FROM public.markets mk
    JOIN public.market_options o ON o.market_id = mk.id
    WHERE mk.status = 'active'
      AND mk.resolution_type = 'multiple_choice'
    GROUP BY mk.id, mk.slug
    HAVING COUNT(o.id) > 2
  LOOP
    PERFORM public.set_market_pricing_independent(m.id);
    RAISE NOTICE 'independent -> % (%)', m.slug, m.id;
  END LOOP;
END $$;

COMMIT;

-- Verification (read-only)
SELECT key, value FROM public.platform_settings WHERE key LIKE 'flags.%' ORDER BY key;
SELECT options_pricing_mode, COUNT(*) FROM public.markets
  WHERE resolution_type = 'multiple_choice' GROUP BY 1;
