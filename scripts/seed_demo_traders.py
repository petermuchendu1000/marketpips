#!/usr/bin/env python3
"""Seed idempotent demo traders, positions, price history and activity.

Populates the Top Holders board, holder peek-card and public trader profile
(migration 026) with realistic, East-Africa-flavoured content so the surfaces
render like the Polymarket reference while the platform has no organic volume
yet.

SAFETY / IDEMPOTENCY
--------------------
* Reads the DB URL from the SUPABASE_DB_URL env var. No secrets are committed.
* Demo identities are keyed by the ``@demo.marketpips`` email domain and by
  deterministic uuid5 ids, so re-runs update in place (never duplicate).
* On every run it first removes demo-owned positions/activity and the price
  ticks for the two target markets, then re-inserts a clean snapshot.
* It only ever touches demo rows and the two seed markets' price_history /
  option prices -- it never deletes or mutates real user data.

USAGE
-----
    SUPABASE_DB_URL="postgresql://...:5432/postgres" \
        python3 scripts/seed_demo_traders.py
"""
from __future__ import annotations

import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
DEMO_DOMAIN = "demo.marketpips"
NS = uuid.uuid5(uuid.NAMESPACE_DNS, DEMO_DOMAIN)  # stable namespace for uuid5

# Target markets (looked up by slug so ids stay environment-agnostic).
BINARY_SLUG = "ke-ruto-reelection-2027"          # yes 0.46 / no 0.54
MULTI_SLUG = "ke-2027-president"                  # 6 candidate options
NOW = datetime.now(timezone.utc)

random.seed(2027)  # deterministic amounts across runs


def uid(key: str) -> str:
    return str(uuid.uuid5(NS, key))


# --------------------------------------------------------------------------- #
# Demo traders  (display_name, username, bio, joined, pnl, volume, win%, bets, wins, views)
# --------------------------------------------------------------------------- #
TRADERS = [
    # key            display          username         bio                                    joined       pnl        volume     win   bets wins views
    ("kimani_w",     "kimani.w",      "kimani_w",      "Long Kenya. Conviction over noise.",  "2024-11-02", 973_641,   12_040_000, 0.71, 340, 241, 4712),
    ("achieng_o",    "achieng.o",     "achieng_o",     "Nairobi. Macro + elections.",         "2025-01-18", 214_880,   3_180_000,  0.63, 512, 322, 1980),
    ("otieno_cap",   "OtienoCapital", "otieno_cap",    "Value on East African politics.",     "2024-08-27", 486_210,   6_420_000,  0.66, 288, 190, 3120),
    ("wanjiru_m",    "wanjiru.m",     "wanjiru_m",     "Slow money. Kisumu.",                 "2025-03-05", 88_400,    1_240_000,  0.58, 176, 102, 640),
    ("mutua_t",      "mutua.trades",  "mutua_t",       "Momentum + resolution edge.",         "2025-02-11", 51_233,    980_400,    0.55, 210, 116, 512),
    ("barasa_k",     "barasa.k",      "barasa_k",      "Eldoret. Sports + politics.",         "2025-04-22", 22_010,    540_200,    0.52, 133, 69,  308),
    ("njoki_bets",   "njoki",         "njoki_bets",    "Small stakes, sharp reads.",          "2025-05-30", 9_890,     212_600,    0.61, 88,  54,  151),
    ("ndegwa_short", "ndegwa",        "ndegwa_short",  "Fading the favourite since 2023.",    "2024-09-14", 331_400,   4_010_000,  0.64, 260, 166, 2210),
    ("sanaipei",     "sanaipei",      "sanaipei",      "No-side specialist.",                 "2025-01-03", 74_050,    1_160_000,  0.59, 190, 112, 720),
    ("omollo_fx",    "omollo.fx",     "omollo_fx",     "FX + rates. Mombasa.",                "2024-12-08", 120_700,   2_240_000,  0.60, 224, 134, 990),
    ("chebet_r",     "chebet",        "chebet_r",      "Rift Valley. Turnout models.",        "2025-03-27", 33_440,    610_500,    0.57, 150, 85,  402),
    ("kiptoo_arb",   "kiptoo.arb",    "kiptoo_arb",    "Sports arbs. Cross-book value.",      "2023-06-19", 151_700,   9_324_300,  0.83, 3589, 2979, 6400),
    ("amina_h",      "amina.h",       "amina_h",       "Coast trader. Contrarian.",           "2025-06-01", 6_700,     140_050,    0.54, 66,  36,  120),
    ("githua",       "githua",        "githua",        "Nyeri. Weekend positions only.",      "2025-05-12", 4_130,     96_700,     0.50, 54,  27,  88),
    ("wangari_p",    "wangari.p",     "wangari_p",     "Policy desk. Long-horizon.",          "2024-10-21", 205_900,   2_980_000,  0.62, 240, 149, 1740),
    ("juma_d",       "juma.d",        "juma_d",        "Data over vibes.",                    "2025-02-28", 40_120,    720_300,    0.56, 168, 94,  455),
]

# Binary market holders: (trader_key, side, shares, avg_entry_price)
BINARY_HOLDERS = [
    ("kimani_w",     "yes", 8_200_000, 0.31),
    ("achieng_o",    "yes", 1_950_000, 0.37),
    ("otieno_cap",   "yes", 1_240_000, 0.40),
    ("wanjiru_m",    "yes",   870_500, 0.42),
    ("mutua_t",      "yes",   512_300, 0.44),
    ("barasa_k",     "yes",   340_100, 0.45),
    ("njoki_bets",   "yes",   158_900, 0.43),
    ("ndegwa_short", "no",  2_100_000, 0.49),
    ("sanaipei",     "no",    640_200, 0.51),
    ("omollo_fx",    "no",    410_700, 0.52),
    ("chebet_r",     "no",    233_400, 0.53),
    ("kiptoo_arb",   "no",    150_050, 0.50),
    ("amina_h",      "no",     96_700, 0.55),
    ("githua",       "no",     41_300, 0.54),
]

# Multi-market (president) holders, per candidate option label -> yes side.
# (trader_key, option_label, shares, avg_entry_price)
MULTI_HOLDERS = [
    ("kimani_w",   "William Ruto",     3_400_000, 0.39),
    ("otieno_cap", "William Ruto",     1_100_000, 0.42),
    ("achieng_o",  "William Ruto",       560_000, 0.43),
    ("wangari_p",  "Kalonzo Musyoka",    900_000, 0.18),
    ("ndegwa_short","Kalonzo Musyoka",   420_000, 0.21),
    ("mutua_t",    "Rigathi Gachagua",   680_000, 0.12),
    ("juma_d",     "Rigathi Gachagua",   240_000, 0.15),
    ("omollo_fx",  "Fred Matiang'i",     310_000, 0.11),
    ("chebet_r",   "Jimi Wanjigi",       120_000, 0.05),
]


def main() -> int:
    dsn = os.environ.get("SUPABASE_DB_URL")
    if not dsn:
        print("ERROR: set SUPABASE_DB_URL", file=sys.stderr)
        return 2

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # --- resolve target markets ------------------------------------------- #
    cur.execute("SELECT id, yes_price, no_price FROM markets WHERE slug=%s", (BINARY_SLUG,))
    b = cur.fetchone()
    cur.execute("SELECT id FROM markets WHERE slug=%s", (MULTI_SLUG,))
    m = cur.fetchone()
    if not b or not m:
        print("ERROR: target markets not found", file=sys.stderr)
        return 3
    binary_id, yes_px, no_px = b["id"], float(b["yes_price"]), float(b["no_price"])
    multi_id = m["id"]

    cur.execute("SELECT id, label, price FROM market_options WHERE market_id=%s", (multi_id,))
    opt_by_label = {r["label"]: (r["id"], float(r["price"])) for r in cur.fetchall()}

    # Backfill yes/no price on the option (RPCs read mo.yes_price/mo.no_price).
    for oid, price in opt_by_label.values():
        cur.execute(
            "UPDATE market_options SET yes_price=%s, no_price=%s WHERE id=%s",
            (round(price, 4), round(1 - price, 4), oid),
        )

    # --- idempotent cleanup ----------------------------------------------- #
    demo_ids = [uid(t[0]) for t in TRADERS]
    cur.execute("DELETE FROM market_activity WHERE user_id = ANY(%s::uuid[])", (demo_ids,))
    cur.execute("DELETE FROM positions WHERE user_id = ANY(%s::uuid[])", (demo_ids,))
    cur.execute("DELETE FROM price_history WHERE market_id = ANY(%s::uuid[])", ([binary_id, multi_id],))

    # --- ensure auth users (trigger creates profile + wallets) ------------ #
    for key, display, username, bio, joined, *_ in TRADERS:
        u = uid(key)
        cur.execute("SELECT 1 FROM auth.users WHERE id=%s", (u,))
        if not cur.fetchone():
            cur.execute(
                """INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
                     VALUES (%s, %s, %s::jsonb, %s)""",
                (u, f"{key}@{DEMO_DOMAIN}",
                 psycopg2.extras.Json({"display_name": display, "username": username}),
                 datetime.fromisoformat(joined).replace(tzinfo=timezone.utc)),
            )

    # --- update profile fields ------------------------------------------- #
    for key, display, username, bio, joined, pnl, vol, win, bets, wins, views in TRADERS:
        cur.execute(
            """UPDATE profiles
                  SET display_name=%s, username=%s, bio=%s, created_at=%s,
                      avatar_url=NULL, profit_loss_usd=%s, total_volume_usd=%s,
                      win_rate=%s, total_bets=%s, total_wins=%s, profile_view_count=%s
                WHERE id=%s""",
            (display, username, bio,
             datetime.fromisoformat(joined).replace(tzinfo=timezone.utc),
             pnl, vol, win, bets, wins, views, uid(key)),
        )

    # --- wallet map (KES wallet per user) --------------------------------- #
    cur.execute(
        "SELECT user_id, id FROM wallets WHERE user_id = ANY(%s::uuid[]) AND currency='KES'",
        (demo_ids,),
    )
    wallet = {r["user_id"]: r["id"] for r in cur.fetchall()}

    def insert_position(user_key, market_id, option_id, side, shares, entry, cur_price,
                        is_active=True, realized=0.0, payout=0.0):
        u = uid(user_key)
        cur_value = round(shares * cur_price, 2) if is_active else 0.0
        invested = round(shares * entry, 2)
        unreal = round(cur_value - invested, 2) if is_active else 0.0
        cur.execute(
            """INSERT INTO positions
                 (user_id, market_id, wallet_id, market_option_id, side, shares,
                  total_invested_usd, avg_entry_price, current_value_usd,
                  unrealized_pnl_usd, realized_pnl_usd, total_payout_usd,
                  is_active, created_at, updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (u, market_id, wallet[u], option_id, side, shares,
             invested, round(entry, 4), cur_value, unreal,
             round(realized, 2), round(payout, 2), is_active,
             NOW - timedelta(days=random.randint(20, 120)), NOW),
        )

    # binary holders
    for key, side, shares, entry in BINARY_HOLDERS:
        insert_position(key, binary_id, None, side, shares, entry,
                        yes_px if side == "yes" else no_px)

    # multi holders (yes on a candidate option)
    for key, label, shares, entry in MULTI_HOLDERS:
        oid, price = opt_by_label[label]
        insert_position(key, multi_id, oid, "yes", shares, entry, price)

    # --- closed positions (populate the Closed tab + biggest win) --------- #
    # Resolved / historical markets for a few active traders.
    cur.execute(
        "SELECT id, slug FROM markets WHERE slug = ANY(%s)",
        (["btc-up-down-5m-1783639485", "ke-mpesa-record-2026",
          "ke-inflation-below-5-dec2026", "ke-afcon-stadia-pass-2027"],),
    )
    closed_markets = {r["slug"]: r["id"] for r in cur.fetchall()}
    CLOSED = [
        # key,          market slug,                    side, shares,   entry, realized,  payout
        ("kiptoo_arb",  "ke-mpesa-record-2026",         "yes", 620_000, 0.55, 151_743.0, 620_000 * 1.0),
        ("kiptoo_arb",  "ke-afcon-stadia-pass-2027",    "yes", 210_000, 0.60,  84_000.0, 210_000 * 1.0),
        ("kiptoo_arb",  "btc-up-down-5m-1783639485",    "no",  180_000, 0.52, -93_600.0, 0.0),
        ("kimani_w",    "ke-inflation-below-5-dec2026", "yes", 300_000, 0.55, 135_000.0, 300_000 * 1.0),
        ("otieno_cap",  "ke-mpesa-record-2026",         "yes", 140_000, 0.62,  53_200.0, 140_000 * 1.0),
        ("ndegwa_short","ke-afcon-stadia-pass-2027",    "no",   90_000, 0.30, -27_000.0, 0.0),
    ]
    for key, slug, side, shares, entry, realized, payout in CLOSED:
        mid = closed_markets.get(slug)
        if mid:
            insert_position(key, mid, None, side, shares, entry, 0.0,
                            is_active=False, realized=realized, payout=payout)

    # --- price history: 30 daily ticks for the binary market -------------- #
    p = yes_px
    for d in range(30, -1, -1):
        p = min(0.72, max(0.28, p + random.uniform(-0.03, 0.03)))
        cur.execute(
            """INSERT INTO price_history (market_id, yes_price, no_price, price, volume_usd, recorded_at)
                 VALUES (%s,%s,%s,%s,%s,%s)""",
            (binary_id, round(p, 4), round(1 - p, 4), round(p, 4),
             round(random.uniform(30_000, 220_000), 2),
             NOW - timedelta(days=d)),
        )
    # option lines for the multi market's held candidates
    held_opts = {opt_by_label[l][0]: opt_by_label[l][1] for _, l, _, _ in MULTI_HOLDERS}
    for oid, base in held_opts.items():
        q = base
        for d in range(30, -1, -1):
            q = min(0.75, max(0.03, q + random.uniform(-0.02, 0.02)))
            cur.execute(
                """INSERT INTO price_history
                     (market_id, market_option_id, yes_price, no_price, price, volume_usd, recorded_at)
                     VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (multi_id, oid, round(q, 4), round(1 - q, 4), round(q, 4),
                 round(random.uniform(5_000, 60_000), 2), NOW - timedelta(days=d)),
            )

    # --- market activity feed --------------------------------------------- #
    actions = ["buy", "sell"]
    for key, side, shares, entry in BINARY_HOLDERS:
        for _ in range(random.randint(1, 3)):
            act = random.choice(actions)
            amt = round(shares * random.uniform(0.05, 0.3) * (yes_px if side == "yes" else no_px), 2)
            cur.execute(
                """INSERT INTO market_activity
                     (market_id, user_id, action, amount_usd, side, price, created_at)
                     VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (binary_id, uid(key), act, amt, side,
                 round(yes_px if side == "yes" else no_px, 4),
                 NOW - timedelta(days=random.randint(0, 25), hours=random.randint(0, 23))),
            )

    conn.commit()

    # --- verification via the public RPCs --------------------------------- #
    cur.execute("SELECT display_name, side, shares, current_value_usd, share_of_book, side_rank "
                "FROM market_top_holders(%s, NULL, 10) ORDER BY side, side_rank", (binary_id,))
    rows = cur.fetchall()
    print(f"\nmarket_top_holders({BINARY_SLUG}) -> {len(rows)} rows")
    for r in rows:
        print(f"  {r['side']:<3} #{r['side_rank']} {r['display_name']:<16} "
              f"shares={float(r['shares']):>12,.0f} "
              f"${float(r['current_value_usd']):>14,.0f} "
              f"book={float(r['share_of_book'])*100:5.1f}%")

    whale = uid("kimani_w")
    cur.execute("SELECT display_name, positions_value, biggest_win_usd, predictions, "
                "profit_loss_usd, volume_usd, win_rate FROM trader_public_profile(%s)", (whale,))
    print("\ntrader_public_profile(kimani_w):", dict(cur.fetchone()))
    cur.execute("SELECT count(*) AS n FROM trader_positions(%s,'active',NULL,50)", (uid("kiptoo_arb"),))
    print("kiptoo_arb active positions:", cur.fetchone()["n"])
    cur.execute("SELECT count(*) AS n FROM trader_positions(%s,'closed',NULL,50)", (uid("kiptoo_arb"),))
    print("kiptoo_arb closed positions:", cur.fetchone()["n"])
    cur.execute("SELECT count(*) AS n FROM trader_pnl_series(%s,'1M')", (whale,))
    print("kimani_w pnl series points (1M):", cur.fetchone()["n"])

    cur.close()
    conn.close()
    print("\nseed complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
