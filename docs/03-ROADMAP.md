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

### Module 1 — Auth & RBAC  ☐
- Email/password + OAuth (Google) sign-in, email confirm, callback route.
- `profiles` auto-provision trigger; role enum (user/admin/moderator/resolver).
- Middleware route protection; server-side session helpers.
- **Gate:** unit tests for guards · e2e: register→confirm→login→protected page.

### Module 2 — Wallets & currency  ☐
- Multi-currency wallets; exchange-rate read; FX conversion helpers.
- **Gate:** unit tests for conversion · DB-live: wallet creation on signup.

### Module 3 — Markets & LMSR pricing  ☐
- Market CRUD, lifecycle (draft→pending→active→closed→resolved), categories.
- Verify `lmsr_price` / `lmsr_cost_to_buy` numerically.
- **Gate:** unit tests for LMSR math vs. reference values · DB-live: create market.

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
