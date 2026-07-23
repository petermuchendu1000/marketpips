# Betting-panel restore (incident runbook)

## Symptom
After moving the project to a fresh Supabase, the live betting panel regressed:
1. No "No" buttons in the betting panel.
2. Selecting an option and clicking Yes still listed every sibling option.
3. "Nothing changed but the database" — yet the UI changed.
4. The order book disappeared.

## Root cause
The betting panel is **entirely config/data-driven**. Which panel renders is
decided in `apps/web/app/markets/[slug]/page.tsx` from:

| Condition | Renders |
|---|---|
| `pricing_engine='clob'` **and** `flags.clob` | CLOB order-book drawer + per-candidate Buy Yes/Buy No |
| `options_pricing_mode='independent'` **and** `flags.independent_options` | independent per-candidate Yes/No lines (No button) |
| multi-outcome, neither of the above | **legacy simplex pick-one board** (no No button, all options listed) |
| binary | Yes/No grid |

The dark-launch feature flags live as rows in `platform_settings` and **all
default OFF** (`apps/web/lib/admin/settings.ts` + `apps/web/lib/flags.ts`). The
Supabase move recreated the schema + market data but **not** the flag rows, and
the markets came across as `options_pricing_mode='simplex'` / `pricing_engine='amm'`.
So every multi-outcome market fell into the legacy simplex branch — exactly
symptoms 1–4. No application code changed.

## Fix (this folder)
Both scripts are idempotent and reversible.

1. `01_flags_and_independent.sql` — upsert `flags.independent_options`,
   `flags.pm_ticket`, `flags.clob` = true, and opt the 7 active
   `multiple_choice` markets into the migration-023 independent per-candidate
   model (`set_market_pricing_independent`).
2. `02_seed_clob_multi.py` — flip ONLY those 7 markets to `pricing_engine='clob'`
   and seed two-sided resting books + taker fills so the order book populates.

Apply order:
```bash
export SEED_DB_URL="postgresql://…:5432/postgres"
# 01 (SQL) — run the body against the DB (psql or a psycopg2 runner)
python3 02_seed_clob_multi.py
```

## ⚠️ Gotcha: platform_settings.is_public (RLS)
`platform_settings` has RLS `Settings readable USING (is_public OR
has_capability('settings:write'))`. A flag row inserted with the default
`is_public=false` is **invisible to the anon SSR client**, so `isFeatureEnabled()`
reads NULL and falls back to the OFF default — the flag value is ignored. Every
flag the public app reads (all three here) MUST be `is_public=true`. Step 01's
upsert sets it explicitly; do not drop that column from the insert.

## Client hydration (date formatting)
`betting-panel.tsx` formatted the resolve date with `toLocaleDateString(undefined, …)`,
which resolves to the server locale on the server and the browser locale on the
client → a React hydration mismatch ("28 Feb 2027" vs "Feb 28, 2027"). Pinned to
`'en-GB'` to match the market page's own date format.

## Rollback / kill-switches (deploy ≠ release)
- Kill the order book instantly: `flags.clob=false` → markets fall back to the
  independent AMM Yes/No lines (still have No buttons).
- Kill independent mode: `flags.independent_options=false` → simplex pick-one.
- Full revert: `update markets set pricing_engine='amm', options_pricing_mode='simplex'`
  for the affected ids and delete the seeded `clob_orders`/`clob_fills`.

## Prevention
Treat `platform_settings` feature-flag rows as part of environment
configuration — export/import them alongside any database move, or codify them
in a per-environment bootstrap so a fresh DB never silently ships the legacy UI.
