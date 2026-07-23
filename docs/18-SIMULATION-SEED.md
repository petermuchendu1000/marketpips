# Module 18 — Intensive Real-Time Simulation Seeding

Quant-grade, reproducible, **free-tier-safe** simulated data for aggressive
end-to-end testing. Code lives in `scripts/sim/`.

## Why

E2E and load tests need lifelike data on every surface: chart curves, order-book
depth, trade history, holder boards, and a live BTC feed. This module generates
all of it deterministically while staying well inside Supabase's **500 MB
free-tier database limit**.

## Free-tier budget

| Resource | Free-tier cap | Target after seed |
|---|---|---|
| Database size | **500 MB** | ≤ ~120 MB (≈24 %) |
| File storage | 1 GB | ~0 (no blobs seeded) |
| Egress | 5 GB / mo | n/a for seeding |

Measured per-row cost (incl. indexes): `price_history` ~513 B · `positions`
~1.75 kB · `market_activity`/`comments` ~430 B. Row targets below are chosen
against these so the intensive tier lands ~50–90 MB total.

## Quant models (`scripts/sim/quant.py`)

- **`gbm_path` / `merton_jump_diffusion`** — spot-price processes (BTC feed):
  geometric Brownian motion plus a compound-Poisson log-normal jump component
  for headline shocks (Merton 1976).
- **`ou_logit_path`** — binary implied-probability in logit space: OU
  mean-reversion toward a drifting fair value, AR(1) stochastic volatility
  (vol clustering), rare Poisson news jumps, and a loading `beta` on a shared
  **cross-market factor** so markets co-move on macro days. Anchored so the last
  point equals the market's current `yes_price`.
- **`softmax_simplex_paths`** — multi-outcome: correlated latent OU scores →
  softmax; probabilities sum to 1 at **every** timestamp (a proper simplex).
- **`clob_book` / `taker_flow`** — CLOB microstructure: a laddered resting book
  with geometric depth decay + bid/ask spread, and autocorrelated (herding)
  signed taker order-flow that mints realistic fills.

## Seeder (`scripts/sim/seed_intensive.py`)

Idempotent subcommands: `price`, `clob`, `btc`, `verify`, `all`.

```bash
SEED_DB_URL="postgresql://…:5432/postgres" \
  python3 scripts/sim/seed_intensive.py all --tier intensive
```

- **price** — enhanced history for every active market (shared cross-market
  factor) + dense intraday history for the top markets by volume.
- **clob** — flips a curated set of markets to `pricing_engine='clob'`, enables
  `flags.clob`, ensures USD maker/taker wallets, and seeds multi-maker resting
  books (BUY YES bids + BUY NO synthesised asks per the migration-030 contract)
  plus autocorrelated taker fills.
- **btc** — Merton jump-diffusion 1-minute tick feed over the trailing window
  (`source='sim'`) and re-anchors open Up/Down windows to the live feed.
  `btc_windows` is `UNIQUE(market_id)` (cron-managed current window), so no
  window backlog is inserted — the tick feed is the real-time layer.

Tiers: `lean` (~35 MB) · `intensive` (~50–90 MB, default) · `max` (~250 MB).

## Current dataset

Intensive tier seeded (DB **45 MB** — 9 % of the 500 MB free-tier cap):

| Table | Rows |
|---|---|
| price_history | 31,279 |
| clob_orders | 1,776 |
| clob_fills | 9,620 |
| btc_price_ticks | 43,226 |
| positions | 1,834 |
| market_activity | 9,507 |
| comments | 1,185 |

| Stage | Status |
|---|---|
| quant library | ✅ |
| orchestrator | ✅ |
| price history (cross-market factor) | ✅ |
| CLOB books + fills (14 markets) | ✅ |
| BTC 1-min tick feed (30 d) | ✅ |
| traders / holders / activity | ✅ |
