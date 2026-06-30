# Module 3 — Markets & LMSR Pricing

## LMSR (Logarithmic Market Scoring Rule)

For a binary market with inventory `qYes` / `qNo` and liquidity `b > 0`:

```
Cost function:   C(q) = b · ln( e^(qYes/b) + e^(qNo/b) )
Marginal price:  p_i  = e^(qi/b) / Σ_j e^(qj/b)          (p_yes + p_no = 1)
Cost to buy Δ:   C(q + Δ) − C(q)
```

### Authority & parity

`public.lmsr_price` / `public.lmsr_cost_to_buy` (Postgres, `IMMUTABLE`) are
**authoritative** — `place_bet` runs them server-side, atomically. `lib/lmsr.ts`
is the matching TypeScript reference used for UI previews (price impact, est.
shares, slippage). It is **numerically stable** via the log-sum-exp trick, so it
matches the DB wherever the DB doesn't overflow and stays finite where naive
`EXP()` would blow up. Parity is asserted in `lib/__tests__/lmsr.test.ts` against
values captured directly from the DB functions.

| Input | DB | `lib/lmsr.ts` |
| --- | --- | --- |
| `price(0,0,100)` | 0.500000 / 0.500000 | ✓ |
| `price(100,0,100)` yes | 0.731059 | ✓ |
| `price(200,50,100)` yes | 0.817574 | ✓ |
| `price(30,10,50)` yes | 0.598688 | ✓ |
| `cost(0,0,100)` | 69.314718 | ✓ |
| `costToBuy(100,50,25,0,100)` | 16.279402 | ✓ |

`b` mirrors `place_bet`: `b = max(liquidity_pool_usd / 2, 50)` (`bFromLiquidity`).

> Tech-debt note (Module 4): `place_bet` currently allocates shares with the
> simplified `net_usd / price` and uses USD volume as the quantity proxy, rather
> than the exact LMSR inverse (`sharesForBudget`). Reconciling execution with the
> exact inversion is tracked for the Trading module.

## Market lifecycle (`lib/market-lifecycle.ts`)

State machine over the `market_status` enum:

```
draft ──submit──▶ pending ──approve──▶ active ──close──▶ closed ──resolve──▶ resolved
  │ activate(admin) ▲ return                  │ dispute        │ dispute
  └────────────────┘                          ▼                ▼
        (cancel from draft/pending/active/closed) ──▶ cancelled   disputed ──▶ resolved/cancelled
```

- `resolved` and `cancelled` are **terminal**.
- `canTransition` / `validateTransition` are the single source of truth; the
  admin status route validates every change through them.

## API

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/markets` | GET | public | List w/ filters, sort, pagination |
| `/api/markets` | POST | active user | Create (→ `pending`, or `active` for admins) |
| `/api/markets/[id]` | GET | public | Fetch one by UUID **or** slug |
| `/api/markets/[id]/status` | PATCH | admin/mod | Lifecycle transition (state-machine enforced, audited) |
| `/api/markets/[id]/resolve` | POST | resolver | Resolve via `resolve_market` RPC (separate: needs outcome) |

The status route uses an **optimistic concurrency guard** (`.eq('status', from)`)
so two concurrent transitions can't race, routes cancellations through the
atomic `cancel_market` RPC (handles refunds), and writes an `audit_log` row for
every change.

### Create-market validation
Title/description/criteria length bounds (Zod), category enum, ≥1-hour trading
window, and `resolves_at ≥ closes_at`. Regular users land in `pending` for
review; admins/moderators activate directly.

## Tests & gate
- `lib/__tests__/lmsr.test.ts` — 18 tests: DB parity, price-sum=1, monotonicity,
  convex cost-to-buy, log-sum-exp stability at extreme quantities, `bFromLiquidity`,
  `spreadFromPrices` round-trip, `sharesForBudget` slippage + closed-form match.
- `lib/__tests__/market-lifecycle.test.ts` — 10 tests: legal/illegal transitions,
  terminal guards, structured `validateTransition` errors.

Gate: 70/70 tests · `tsc --noEmit` clean · `next build` · DB-live LMSR parity +
rolled-back create-market verifying defaults (`draft`, 0.50/0.50).
