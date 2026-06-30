# Module 4 — Trading (Orders & Positions)

## `place_bet` (migration 004) — authoritative, atomic

A single `SECURITY DEFINER` RPC executes the whole bet in one transaction:
lock market (`FOR UPDATE`) → validate (active, not past close) → FX → fees →
lock wallet → balance check → LMSR shares → debit wallet → insert order →
upsert position → bet transaction → creator reward → market stats/price →
price history + activity. Any failure rolls the entire bet back.

### Fixes vs. the original

| Problem (original) | Fix (004) |
| --- | --- |
| **Reserve leak** — filled bets added stake to `reserved_balance` and never released it (funds locked forever) | Filled market bet **debits `available_balance` only**; nothing reserved |
| **Wrong share math** — `shares = net_usd / price` (no slippage) + USD volume used as LMSR quantity | **True LMSR** via a numerically-stable closed-form inverse (below); new price via exact ratio |
| **No creator reward** | 0.25% carved from the 2% platform fee, credited to the creator's USD wallet (+ `creator_reward` txn); **skipped on self-bets** (anti wash-trading) |
| **Latent enum bug** — inserting `order_side` into `positions.side` (`position_side`) | explicit `::text::position_side` cast |

### Slippage-aware share allocation (stable)

Reconstruct quantities from current prices (anchor `q_no = 0`), then for a YES
buy of `net` USD at liquidity `b`:

```
shares_yes = net + b·ln( (1 − no_price · e^(−net/b)) / yes_price )
new ratio  R = (yes/no) · e^(shares/b)   →   yes' = R/(1+R),  no' = 1/(1+R)
```

`e^(−net/b) ∈ (0,1]`, so no overflow. `b = max(liquidity_pool_usd/2, 50)`
(same as `lib/lmsr.bFromLiquidity`). Verified DB-live: a 100 KES YES bet on a
fresh 0.50/0.50 market → **1.507636 shares**, avg fill **0.503769**, price →
**0.507538** — and `lib/trading.previewBet` reproduces these exactly.

## Fees (`lib/trading.ts`)

```
feeUsd           = amountUsd · platform_fee_rate          (default 2%)
creatorRewardUsd = min(amountUsd · creator_reward_rate, feeUsd)   (default 0.25%)
platformNetUsd   = feeUsd − creatorRewardUsd
netStakeUsd      = amountUsd − feeUsd          (enters the LMSR)
```

`previewBet()` mirrors `place_bet` (full-precision USD, same fees, same LMSR
inversion) so the UI preview equals on-chain execution. `meetsMinBet` enforces
the $0.10 minimum.

## Orders API (`/api/orders`)

- `POST` → `place_bet` RPC. Zod validation; **limit orders require `limit_price`**.
  A single `BET_ERRORS` table maps SQLSTATE → HTTP:

  | Code | HTTP | Meaning |
  | --- | --- | --- |
  | P0001 | 404 | market not found / not active |
  | P0002 | 409 | market closed for betting |
  | P0003 | 400 | unsupported currency |
  | P0004 | 400 | below $0.10 minimum |
  | P0005 | 400 | wallet not found |
  | P0006 | 402 | insufficient balance |
  | P0007 | 400 | limit order missing price |
  | P0008 | 422 | non-positive computed shares |

- `GET` → user's orders (paginated), joined with market summary.

## Positions

Aggregated per `(user_id, market_id, side)` (unique) via `ON CONFLICT DO UPDATE`:
shares and invested USD accumulate, `avg_entry_price` is re-weighted, and
`current_value_usd` re-marked at the new price. Detailed P&L surfacing is
Module 5 (Portfolio).

## Gate (all green)
- DB-live (rolled back): happy path moves balance (debit, **reserved=0**) +
  price + position + creator reward atomically; **P0006** insufficient and
  **P0002** closed rejection paths.
- Unit: 7 trading tests (fee split, cap, min-bet FX, preview≡DB) + 18 LMSR +
  10 lifecycle. **77/77** · `tsc` clean · `next build`.
