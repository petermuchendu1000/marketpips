# CLOB two-sided matching engine (migration 033)

Completes the phase-1b BUY/MINT-only book into the full Polymarket Conditional-
Token matching taxonomy so each candidate trades as a real two-sided CLOB.

## Match taxonomy (S = order's outcome_side, C = complement)

| Taker | Maker | Kind | Collateral | Execution price on S |
|---|---|---|---|---|
| BUY S | SELL S | `direct` | shares transfer, cash taker→maker | maker's ask |
| BUY S | BUY C | `mint` | $1 → S+C (both buyers fund it) | 100 − maker's C price |
| SELL S | BUY S | `direct` | shares transfer, cash maker→taker | maker's bid |
| SELL S | SELL C | `burn` | S+C → $1 (released to both sellers) | 100 − maker's C price |

Because YES(p) + NO(100−p) = 100¢ = $1, a resting **BUY C @ q** is a synthetic
**ask on S @ (100−q)** (mint) and a resting **SELL C @ a** is a synthetic **bid
on S @ (100−a)** (burn). `clob_get_book` merges real + synthetic levels on both
sides; `clob_place_order` builds one unified ladder and consumes it in strict
**price-time priority** with **self-trade prevention**.

## Escrow
- Resting **BUY** reserves cash = size × limit/100 (wallet.reserved_balance).
- Resting **SELL** reserves **shares** (positions.reserved_shares); available to
  sell = shares − reserved_shares. `clob_cancel_order` releases exactly the
  unfilled remainder (cash for buys, shares for sells).

## Invariants (proven by scripts/ops/clob/test_two_sided.py, run in a rolled-back txn)
- **I1 share conservation** — per option, Σ YES shares ≡ Σ NO shares (mint +1/+1,
  burn −1/−1, direct transfers).
- **I3 price-time priority**, **I4 self-trade prevention**, **I5 no negative
  balances/shares/reservations**, **I6 exact escrow release on cancel**,
  **I7 no over-sell**.
- **CC cash/collateral conservation** — a mint→burn round-trip returns Σ(cash) to
  its start (collateral in == collateral out); at resolution winners are paid $1
  per share from exactly that held collateral.

Result of the last run: **20 PASS / 0 FAIL**. The harness itself caught four real
bugs during development (match-kind inversion, two enum casts, and a latent
binary-era positions constraint that blocked multi-outcome positions).

## Schema fix shipped alongside
The binary-era `UNIQUE(user_id, market_id, side)` on `positions` forbade a user
holding the same side on two candidates of one multi-outcome market. Scoped to
binary only (`WHERE market_option_id IS NULL`); per-option uniqueness remains via
`positions_user_market_option_side_uidx`.

## Fees
Plumbed but 0 (Polymarket charges 0 taker/maker on the CLOB). A non-zero fee can
be added without a schema change.

## Reversibility
Additive: one column (`positions.reserved_shares`), one constraint re-scope, and
`CREATE OR REPLACE` on the three CLOB RPCs. Rollback = re-apply migration 030
(restores the buy/mint-only bodies).
