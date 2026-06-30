# MarketPips — Execution Roadmap (module-by-module, e2e-gated)

Each module has: scope → implementation → **e2e/test gate** that must pass before
moving on. "DB-live" gates require Supabase access (see 00-ASSESSMENT §4).

Legend: ☐ todo · ◐ in progress · ☑ done

---

### Module 0 — Typed foundation & build health  ◐
- Generate/commit `types/supabase.ts` `Database` type from schema.
- Wire typed client into `lib/supabase/*`.
- Fix residual genuine type bugs (e.g. withdraw duplicate key).
- Add testing harness (Vitest), lint/format config, env validation (Zod).
- **Gate:** `tsc --noEmit` clean · `next build` succeeds · lint passes.

### Module 1 — Auth & RBAC  ☑
- Email/password + OAuth (Google) sign-in, email confirm, callback route. ✓
- `profiles` auto-provision trigger fixed (migration 003): correct metadata
  mapping (display_name/country/currency), preferred-currency wallet, referral. ✓
- Centralized RBAC helpers (`lib/auth.ts`); edge middleware admin-role gate. ✓
- Polymarket free-API client scaffolded (`lib/integrations/polymarket.ts`,
  live-validated) for Module 3 ingestion. ✓
- **Gate:** ✓ DB e2e (signup → profile+wallets+referral, rolled back) ·
  unit tests for `hasRole` · tsc clean · build · 20 tests pass.

### Module 2 — Wallets & currency  ☑
- Canonical FX module (`lib/currency.ts`): decimal-precise (big.js) conversion,
  single source of truth — `getUsdRate` / `localToUsd` / `usdToLocal` / `convert`,
  `CURRENCY_META`, `FALLBACK_USD_RATES`, `buildRatesMap`, `fetchRatesMap`. ✓
- Live-rate client hook (`hooks/use-rates.ts`) reading anon-readable
  `exchange_rates` with module-level cache (5-min TTL) + de-duped in-flight fetch. ✓
- `use-wallets.ts` now values balances via live rates (removed hardcoded
  `APPROX_RATES`). ✓
- Eliminated dangerous magic-number FX fallbacks (`|| 0.01`, `|| 1`,
  `|| 0.00775`, `|| 0.000267`) in withdraw/deposit/mpesa/mtn-momo routes — all
  now route through `getUsdRate` (currency-correct last-known-good fallback). ✓
- Legacy `convertCurrency` in `lib/payments` delegates to the canonical module. ✓
- **Gate:** ✓ 22 currency unit tests (round-trip, cross-currency, precision,
  fallback, formatting) · 42/42 total tests · tsc clean · `next build` · DB-live:
  FX completeness (8/8 currencies) + `handle_new_user` provisions preferred-currency wallet.

### Module 3 — Markets & LMSR pricing  ☑
- Canonical TS LMSR module (`lib/lmsr.ts`): numerically-stable (log-sum-exp)
  port of the authoritative Postgres `lmsr_price` / `lmsr_cost_to_buy` —
  `lmsrPrices` / `lmsrCost` / `lmsrCostToBuy` / `spreadFromPrices` /
  `sharesForBudget` (true LMSR inversion w/ slippage) / `bFromLiquidity`. ✓
- Market lifecycle state machine (`lib/market-lifecycle.ts`):
  draft→pending→active→closed→resolved (+ disputed/cancelled), terminal-state
  guards, `validateTransition`. ✓
- API: single-market GET (`/api/markets/[id]`, by UUID or slug) + admin
  lifecycle PATCH (`/api/markets/[id]/status`) enforcing the state machine,
  optimistic concurrency guard, `cancel_market` RPC for cancellations, audit log. ✓
- Hardened create-market validation (≥1h trading window, resolves_at ≥ closes_at). ✓
- **Gate:** ✓ 18 LMSR unit tests vs DB reference values (+ stability/monotonicity)
  · 10 lifecycle tests · 70/70 total · tsc clean · `next build` · DB-live: LMSR
  parity (TS≡DB) + create-market defaults (status=draft, 0.50/0.50, rolled back).

### Module 4 — Trading (orders & positions)  ☐
- `place_bet` RPC path, fees (2% / 0.25% creator), positions aggregation.
- **Gate:** DB-live: place bet moves balance + price + position atomically;
  insufficient-balance + closed-market rejection paths.

### Module 5 — Portfolio & price history  ☐
- Holdings, P&L, history; price_history time-series for charts.
- **Gate:** e2e: bet → appears in portfolio with correct P&L.

### Module 6 — Payments: deposits  ☐
- M-Pesa STK, MTN MoMo collection, Airtel, PesaPal initiate + webhooks.
- Idempotent webhook handling; deposit→wallet credit.
- **Gate:** sandbox provider simulation; webhook idempotency test.

### Module 7 — Payments: withdrawals + KYC gate  ☐
- B2C/disbursement; KYC required > threshold; fee handling.
- **Gate:** withdraw reserves balance, completes/fails atomically; KYC gate test.

### Module 8 — KYC  ☐
- Private bucket upload, admin review (`admin_review_kyc`).
- **Gate:** upload → pending → admin verify → status flips.

### Module 9 — Notifications  ☐
- In-app + SMS (Africa's Talking) + email (Resend); send-notifications cron.
- **Gate:** event → notification row → dispatch (mocked providers).

### Module 10 — Search & leaderboard  ☐
- Full-text market search; leaderboard matview + refresh.
- **Gate:** search relevance test; leaderboard ranking test.

### Module 11 — Admin  ☐
- Dashboard: market review/resolution, KYC, audit log, users.
- **Gate:** RBAC-enforced; resolution flows to payout.

### Module 12 — Background jobs  ☐
- close-markets, update-exchange-rates, resolve-market, send-notifications.
- **Gate:** function smoke tests; CRON_SECRET auth.

### Module 13 — Observability & ops  ☐
- Sentry, structured logging, /health, metrics, alerting.
- **Gate:** error captured; health green.

### Module 14 — Security & abuse  ☐
- Rate limiting (Upstash/Cloudflare), input sanitization, headers/CSP,
  webhook signature verification, secret management review.
- **Gate:** rate-limit test; security header scan.

### Module 15 — Performance & caching  ☐
- Query/Cache strategy, CDN rules, image optimization, DB indexes review.
- **Gate:** Lighthouse mobile ≥ target; key queries use indexes.

### Module 16 — CI/CD & IaC  ☐
- GitHub Actions: lint→typecheck→test→build→deploy (Fly), Supabase migration
  step; Fly `fly.toml`, Cloudflare config; rollback strategy.
- **Gate:** green pipeline; staging deploy; documented rollback.

### Module 17 — Accessibility, i18n, docs, launch  ☐
- a11y pass, EA localization scaffolding, full docs, runbook, DR/backup.
- **Gate:** a11y audit; restore-from-backup drill documented.

---

## Testing strategy (applies to every module)
- **Unit:** pure logic (LMSR, FX, validators, formatters) — Vitest.
- **Integration:** route handlers against a test DB / mocked Supabase.
- **DB:** SQL functions + RLS executed against live/branch Supabase.
- **E2E:** Playwright user journeys (auth, bet, deposit, withdraw, resolve).
- **Load/security:** k6 smoke + dependency/secret scans before launch.
