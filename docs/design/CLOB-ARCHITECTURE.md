# CLOB Architecture — per-candidate Central Limit Order Book (Polymarket parity)

Status: **Phase 1 (foundation) in progress.** Owner: platform. Ground truth:
live PM `event/presidential-election-winner-2028` (see
`docs/design/PM-MARKET-DETAIL-MEASURED.md` — inline Order Book / Graph /
Resolution drawer, Buy-Yes/Buy-No per candidate, order-book depth table with
Asks / Bids / Last / Spread).

## 1. Why
Our multi-outcome markets price with an AMM (LMSR): `simplex` (shared, ΣΣ=1) or
`independent` (per-candidate binary LMSR). PM instead runs a **CLOB** — real
resting limit orders matched by price-time priority, with **complementary
minting** (a YES buyer and a NO buyer combine $1 to mint a YES+NO set). Faithful
PM parity for *Buy No on every candidate*, the *order-book depth table*, *Last*,
*Spread*, and maker/taker semantics requires an order book, not an AMM.

## 2. Design principles
- **Additive & reversible.** New `markets.pricing_engine` flag: `'amm'`
  (default — all existing LMSR/simplex/independent paths untouched) or `'clob'`.
  Rollback = flip the flag; AMM code is never removed in Phase 1.
- **Per-candidate binary books.** A multi-outcome CLOB market = N independent
  YES/NO books (one per `market_option`). A binary market = one YES/NO book
  (option_id NULL). YES(p) and NO(1−p) are complementary tokens summing to $1.
- **Integer tick.** Prices in cents, tick **0.1¢** → stored as `price_cents
  numeric(4,1)` in `[0.1, 99.9]` (matches PM `19.8¢`).
- **Ledgered & atomic.** Every match debits/credits wallets, updates
  `positions`, writes `clob_fills`, inside one SERIALIZABLE-safe RPC with row
  locks (`SELECT … FOR UPDATE`) — no double-spend, no partial state.
- **Reuse existing enums/tables** where possible (`order_side`, `order_status`,
  `positions`, `wallets`, `transactions`).

## 3. Data model (migration 030)
- `markets.pricing_engine text NOT NULL DEFAULT 'amm' CHECK (in ('amm','clob'))`.
- **`clob_orders`** — resting/working orders:
  `id, market_id, market_option_id (nullable), user_id, wallet_id,
   outcome_side order_side (yes|no), action clob_action (buy|sell),
   order_type order_type, price_cents numeric(4,1), size numeric(20,6),
   filled numeric(20,6) default 0, status order_status,
   currency, exchange_rate_to_usd, reserved_usd numeric(20,2),
   created_at, updated_at, expires_at, client_order_id`.
- **`clob_fills`** — immutable trade prints:
  `id, market_id, market_option_id, outcome_side, price_cents, size,
   taker_order_id, maker_order_id, taker_user_id, maker_user_id,
   match_kind (direct|mint|burn), created_at`.
- Indexes: book scan `(...option, outcome_side, action, price_cents, created_at)
  WHERE status IN ('open','partially_filled')`; user history `(user_id, created_at)`.

## 4. Matching semantics (`clob_place_order`)
Taker **BUY YES @ p** fills, best-price-then-oldest, against:
  1. **direct**: resting **SELL YES** @ ask ≤ p (shares transfer, seller paid ask).
  2. **mint**: resting **BUY NO** @ q with `p + q ≥ 100` — $1 mints a YES+NO
     set; taker pays `100 − q`, maker pays `q`. Taker gets YES, maker gets NO.
Symmetric for BUY NO, and SELL = direct match vs opposite BUY or **burn** vs
same-side SELL of the complement. Remainder of a **limit** order rests in the
book; a **market** order drops its remainder. Phase 1 implements **buy-side
(direct + mint)** end-to-end; sells/burn land in Phase 1b.

Execution price = the **maker's** resting price (price-time priority). `Last` =
most recent fill; `Spread` = best ask − best bid per book.

## 5. API (Phase 2)
- `POST /api/orders` gains a CLOB branch when `market.pricing_engine='clob'`:
  `{ market_id, market_option_id?, outcome_side, action, order_type,
     price_cents?, size|amount_local, currency }` → `clob_place_order` RPC.
- `POST /api/orders/cancel` → `clob_cancel_order`.
- `GET /api/markets/[id]/book?option=&side=` → `clob_get_book` (aggregated depth,
  public, cache 1–2s).

## 6. UI (Phase 3)
- Candidate row **Buy Yes / Buy No** both active on CLOB markets (already styled).
- Inline **Order Book / Graph / Resolution** drawer under a clicked candidate
  (PM parity): depth table (PRICE/SHARES/TOTAL, Asks/Bids), Last, Spread, Maker
  Rebate/Rewards chips.
- Ticket: Limit mode posts a resting order; Market mode crosses the book.

## 7. Cross-cutting (the full checklist)
- **Security/authz**: RLS — a user reads/writes only their own `clob_orders`;
  aggregated book via SECURITY DEFINER function (no counterparty identity leak).
- **Validation**: price tick/range, size > 0, wallet currency, market open,
  self-match prevention (skip own resting orders — anti-wash, mirrors place_bet).
- **Concurrency**: `FOR UPDATE` row locks on matched maker orders + wallets;
  retry on serialization failure at API layer.
- **Rate limiting / abuse**: per-user order rate cap + max open orders (Phase 2).
- **Observability**: structured logs per match, `job_runs`-style metrics; fills
  feed analytics; audit via `audit_log`.
- **Testing**: pgTAP/unit for matching invariants (conservation: Σ YES = Σ NO
  minted; no negative balances; price-time priority), integration on a seeded
  CLOB market, E2E on the drawer.
- **Migrations/rollback**: forward-only SQL, idempotent (`IF NOT EXISTS`,
  `CREATE OR REPLACE`); rollback = `pricing_engine='amm'`.
- **Performance**: partial indexes for O(log n) best-price scans; book depth
  cached at the CDN/edge for 1–2s.
- **i18n/currency**: orders carry `currency` + `exchange_rate_to_usd`; book shown
  in the viewer's currency, matched in USD-cents internally.

## 8. Phase plan (commit + CI per slice)
1. **1a** ✅ design doc (this file).
2. **1b** ✅ migration `030_clob_foundation.sql`: `markets.pricing_engine`
   flag, `clob_action` enum, `clob_orders` + `clob_fills` tables, partial
   book indexes, RLS (owner-only orders, participant-only fills),
   `clob_get_book` (SECURITY DEFINER, synthesized asks), buy-side
   `clob_place_order` (complementary **mint**, price-time priority, partial
   fills, escrow, atomic wallet+position+transaction+fill+price_history+
   activity ledger), `clob_cancel_order` (escrow release). Applied to Supabase
   + validated by a 7-case rolled-back smoke suite (see below).
3. **2** `/api/orders` CLOB branch + cancel + book endpoints; unit/integration.
4. **3** UI: Buy-No parity + inline Order Book drawer + limit posts to book.
5. **1b′** sell/burn matching + expiries (background job) + maker rebates.

### 1b smoke results (2026-07-18, rolled-back txn — no live pollution)
| # | Case | Result |
|---|---|---|
| S1 | mint: BUY NO@45×100 vs BUY YES@60×100 | filled 100 @ **55¢**, wallets −55/−45, YES 100@.55 / NO 100@.45 ✅ |
| S2 | partial + rest: YES@70×120 vs NO@40×50 | 50 filled @60¢, 70 rest, escrow **$49**; book bids `70×70`, synth NO ask `30×70`, last 55 ✅ |
| S3 | self-match prevention | own resting YES not crossed → 0 filled, rests ✅ |
| S4 | market-order remainder dropped | status `cancelled`, 0 filled ✅ |
| S5 | insufficient funds | raises `P0006` ✅ |
| S6 | cancel releases escrow | reserved $30 → available, back to $1000 ✅ |
| S7 | conservation ΣYES == ΣNO minted | invariant holds ✅ |

Error codes: `P0100` sell-not-yet, `P0101` option required, `P0103` not-CLOB,
`P0006` insufficient funds, `P0110-2` cancel guards.
