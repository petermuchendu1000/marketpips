#!/usr/bin/env python3
"""
scripts/sim/seed_intensive.py — intensive, real-time-flavoured simulation seeder.

Drives the quant models in sim/quant.py to populate MarketPips with a large,
internally-consistent, reproducible dataset for aggressive end-to-end testing —
while staying comfortably inside the Supabase FREE-TIER 500 MB database budget.

Subcommands (all idempotent — safe to re-run):
    price   enhanced implied-probability history for every active market, driven
            by a SHARED cross-market latent factor (so markets co-move like a
            real book), plus dense intraday history for the top markets by volume.
    clob    central-limit-order-book depth + trade history: flips a curated set
            of markets to pricing_engine='clob', enables flags.clob, ensures USD
            maker/taker wallets, and seeds multi-maker resting books (BUY YES
            bids + BUY NO synthesised asks, per migration-030 contract) plus a
            stream of autocorrelated taker fills.
    btc     real-time BTC price feed: a Merton jump-diffusion 1-minute tick
            series over the trailing window (source='sim'), and re-anchors the
            open Up/Down windows' reference price to the live feed.
    verify  prints row counts + DB size so we can watch the free-tier budget.
    all     price -> clob -> btc -> verify.

Budget note: per-row costs were measured on the live DB (price_history ~513 B,
positions ~1.75 kB, activity/comments ~430 B). The 'intensive' tier targets
well under 120 MB total so E2E write-churn, WAL and Supabase overhead all fit.

Usage:
    SEED_DB_URL="postgresql://...:5432/postgres" \
        python3 scripts/sim/seed_intensive.py all --tier intensive [--dry-run]
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
import psycopg2
from psycopg2.extras import execute_values

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import quant  # noqa: E402  (sibling module)

NOW = datetime.now(timezone.utc)

# --------------------------------------------------------------------------- #
# tier configuration (footprint knobs)
# --------------------------------------------------------------------------- #
TIERS = {
    "lean": dict(price_days=60, price_pts=140, intraday_top=8, intraday_pts=240,
                 clob_markets=8, clob_depth=6, clob_makers_per_level=2, clob_fills_per_book=90,
                 btc_days=7, btc_step_min=1),
    "intensive": dict(price_days=90, price_pts=380, intraday_top=20, intraday_pts=720,
                      clob_markets=14, clob_depth=8, clob_makers_per_level=3, clob_fills_per_book=260,
                      btc_days=30, btc_step_min=1),
    "max": dict(price_days=120, price_pts=760, intraday_top=40, intraday_pts=1440,
                clob_markets=28, clob_depth=10, clob_makers_per_level=3, clob_fills_per_book=520,
                btc_days=45, btc_step_min=1),
}

BTC_ANCHOR_FALLBACK = 66_000.0   # used only if no prior tick exists


def connect():
    dsn = (os.environ.get("SEED_DB_URL") or os.environ.get("DATABASE_URL")
           or os.environ.get("SUPABASE_DB_URL"))
    if not dsn:
        sys.exit("Set SEED_DB_URL (or DATABASE_URL) to the Supabase Postgres URL.")
    return psycopg2.connect(dsn, connect_timeout=25)


def _tstamps(n: int, days: float, end: datetime) -> list[datetime]:
    start = end - timedelta(days=days)
    span = (end - start).total_seconds()
    return [start + timedelta(seconds=span * i / (n - 1)) for i in range(n)]


# --------------------------------------------------------------------------- #
# price history
# --------------------------------------------------------------------------- #
def seed_price(conn, cfg, rng, dry: bool) -> dict:
    cur = conn.cursor()
    cur.execute(
        """select id, resolution_type, coalesce(yes_price,0.5), total_volume_usd
           from public.markets
           where status='active' and title not ilike '%%Up or Down%%'
           order by total_volume_usd desc nulls last""")
    markets = cur.fetchall()
    top_ids = {m[0] for m in markets[: cfg["intraday_top"]]}

    # options for multi markets
    multi_ids = [m[0] for m in markets if m[1] == "multiple_choice"]
    opts: dict[str, list] = {}
    if multi_ids:
        cur.execute("""select id, market_id, coalesce(yes_price, price, 0.5), display_order
                       from public.market_options where market_id = any(%s::uuid[])
                       order by display_order""", (multi_ids,))
        for oid, mid, price, _ in cur.fetchall():
            opts.setdefault(str(mid), []).append((str(oid), float(price)))

    # shared cross-market factor at the finest resolution we use
    max_pts = max(cfg["price_pts"], cfg["intraday_pts"])
    factor_full = quant.market_factor_path(max_pts, rng)

    total_rows, seeded = 0, 0
    for mid, rtype, yes_price, _vol in markets:
        mid = str(mid)
        is_top = mid in {str(t) for t in top_ids}
        n = cfg["intraday_pts"] if is_top else cfg["price_pts"]
        days = 2.0 if is_top else cfg["price_days"]
        ts = _tstamps(n, days, NOW)
        factor = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, max_pts), factor_full)
        rows = []
        if rtype == "multiple_choice":
            mopts = opts.get(mid, [])
            if len(mopts) < 2:
                continue
            paths = quant.softmax_simplex_paths([p for _, p in mopts], n, rng)
            for (oid, _), path in zip(mopts, paths):
                for i in range(n):
                    p = float(path[i])
                    rows.append((mid, oid, round(p, 6), round(1 - p, 6), round(p, 6),
                                 round(float(rng.uniform(2e3, 9e4)), 2), ts[i]))
        else:
            beta = float(rng.uniform(0.2, 0.9))
            path = quant.ou_logit_path(float(yes_price), n, rng, factor=factor, beta=beta)
            for i in range(n):
                p = float(path[i])
                rows.append((mid, None, round(p, 6), round(1 - p, 6), round(p, 6),
                             round(float(rng.uniform(2e3, 9e4)), 2), ts[i]))
        total_rows += len(rows)
        seeded += 1
        if dry:
            continue
        cur.execute("delete from public.price_history where market_id=%s::uuid", (mid,))
        execute_values(cur,
            "insert into public.price_history (market_id, market_option_id, yes_price, no_price, price, volume_usd, recorded_at) values %s",
            rows, template="(%s::uuid,%s::uuid,%s,%s,%s,%s,%s)", page_size=1000)
        conn.commit()
    cur.close()
    return {"markets": seeded, "price_history_rows": total_rows}


# --------------------------------------------------------------------------- #
# CLOB order book + fills
# --------------------------------------------------------------------------- #
def _ensure_usd_wallets(cur, n_users: int) -> list[tuple[str, str]]:
    """Return (user_id, usd_wallet_id) for up to n_users demo traders, creating
    USD wallets where missing. Falls back to any users if no demo traders."""
    cur.execute("""select u.id from auth.users u where u.email like '%%@demo.marketpips'
                   order by u.created_at limit %s""", (n_users,))
    users = [r[0] for r in cur.fetchall()]
    if not users:
        cur.execute("select id from auth.users order by created_at limit %s", (n_users,))
        users = [r[0] for r in cur.fetchall()]
    out = []
    for uid_ in users:
        cur.execute("select id from wallets where user_id=%s and currency='USD'", (uid_,))
        w = cur.fetchone()
        if not w:
            wid = str(uuid.uuid4())
            cur.execute("""insert into wallets(id,user_id,currency,available_balance,is_active)
                           values (%s,%s,'USD',1000000,true)""", (wid, uid_))
            w = (wid,)
        out.append((uid_, w[0]))
    return out


def seed_clob(conn, cfg, rng, dry: bool) -> dict:
    cur = conn.cursor()
    # curated target set: top active non-BTC markets by volume
    cur.execute("""select id, resolution_type, coalesce(yes_price,0.5)
                   from public.markets
                   where status='active' and title not ilike '%%Up or Down%%'
                   order by total_volume_usd desc nulls last limit %s""",
                (cfg["clob_markets"],))
    markets = cur.fetchall()
    market_ids = [m[0] for m in markets]

    multi_ids = [m[0] for m in markets if m[1] == "multiple_choice"]
    opts: dict[str, list] = {}
    if multi_ids:
        cur.execute("""select id, market_id, coalesce(yes_price, price, 0.5)
                       from public.market_options where market_id=any(%s::uuid[])
                       order by display_order""", (multi_ids,))
        for oid, mid, price in cur.fetchall():
            opts.setdefault(str(mid), []).append((str(oid), float(price)))

    if dry:
        books = sum(len(opts.get(str(m[0]), [None])) or 1 for m in markets)
        return {"clob_markets": len(markets),
                "est_orders": books * cfg["clob_depth"] * 2 * cfg["clob_makers_per_level"],
                "est_fills": books * cfg["clob_fills_per_book"]}

    wallets = _ensure_usd_wallets(cur, 40)
    # flip target markets to CLOB + enable the flag
    cur.execute("""insert into platform_settings(key,value) values ('flags.clob','true'::jsonb)
                   on conflict (key) do update set value='true'::jsonb""")
    cur.execute("update public.markets set pricing_engine='clob', updated_at=now() where id=any(%s::uuid[])",
                (market_ids,))
    # idempotent reset
    cur.execute("delete from public.clob_fills where market_id=any(%s::uuid[])", (market_ids,))
    cur.execute("delete from public.clob_orders where market_id=any(%s::uuid[])", (market_ids,))

    n_orders = n_fills = 0
    order_rows, fill_rows = [], []
    mpl = cfg["clob_makers_per_level"]
    for mid, rtype, yes_price in markets:
        mid = str(mid)
        books = opts.get(mid) if rtype == "multiple_choice" else [(None, float(yes_price))]
        for oid, price in books:
            mid_cents = min(99.0, max(1.0, price * 100.0))
            book = quant.clob_book(mid_cents, rng, depth=cfg["clob_depth"])
            for lvl in book:
                # map YES-sell (ask) -> BUY NO @ (100 - ask); YES-buy stays BUY YES
                if lvl.action == "sell":
                    side, pc = "no", round(100.0 - lvl.price_cents, 1)
                else:
                    side, pc = "yes", lvl.price_cents
                pc = min(quant.CENTS_MAX, max(quant.CENTS_MIN, pc))
                for _ in range(mpl):
                    uid_, wid = wallets[rng.integers(0, len(wallets))]
                    size = round(float(lvl.size) * float(rng.uniform(0.5, 1.2)) / mpl, 2)
                    if size <= 0:
                        continue
                    order_rows.append((mid, oid, uid_, wid, side, "buy", "limit",
                                       pc, size, 0, "open", "USD", 1, round(pc / 100 * size, 2)))
            # trade history: autocorrelated taker flow around the mid
            flow = quant.taker_flow(cfg["clob_fills_per_book"], rng)
            for k in range(cfg["clob_fills_per_book"]):
                drift = flow[k] * float(rng.uniform(0.0, 1.5))
                pc = min(99.9, max(0.1, round(mid_cents + drift + rng.normal(0, 0.8), 1)))
                size = round(float(rng.uniform(50, 6000)), 2)
                taker = wallets[rng.integers(0, len(wallets))][0]
                maker = wallets[rng.integers(0, len(wallets))][0]
                mk = "direct" if rng.random() < 0.82 else ("mint" if rng.random() < 0.5 else "burn")
                mins = int(rng.integers(0, 60 * 24 * 7))  # fills spread over last 7 days
                fill_rows.append((mid, oid, "yes", pc, size, mk, None, None, taker, maker,
                                  NOW - timedelta(minutes=mins)))
        if len(order_rows) >= 4000:
            execute_values(cur,
                "insert into public.clob_orders (market_id,market_option_id,user_id,wallet_id,outcome_side,action,order_type,price_cents,size,filled,status,currency,exchange_rate_to_usd,reserved_usd) values %s",
                order_rows, template="(%s::uuid,%s::uuid,%s::uuid,%s::uuid,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", page_size=1000)
            n_orders += len(order_rows); order_rows = []; conn.commit()
        if len(fill_rows) >= 4000:
            execute_values(cur,
                "insert into public.clob_fills (market_id,market_option_id,outcome_side,price_cents,size,match_kind,taker_order_id,maker_order_id,taker_user_id,maker_user_id,created_at) values %s",
                fill_rows, template="(%s::uuid,%s::uuid,%s,%s,%s,%s,%s::uuid,%s::uuid,%s::uuid,%s::uuid,%s)", page_size=1000)
            n_fills += len(fill_rows); fill_rows = []; conn.commit()
    if order_rows:
        execute_values(cur,
            "insert into public.clob_orders (market_id,market_option_id,user_id,wallet_id,outcome_side,action,order_type,price_cents,size,filled,status,currency,exchange_rate_to_usd,reserved_usd) values %s",
            order_rows, template="(%s::uuid,%s::uuid,%s::uuid,%s::uuid,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", page_size=1000)
        n_orders += len(order_rows)
    if fill_rows:
        execute_values(cur,
            "insert into public.clob_fills (market_id,market_option_id,outcome_side,price_cents,size,match_kind,taker_order_id,maker_order_id,taker_user_id,maker_user_id,created_at) values %s",
            fill_rows, template="(%s::uuid,%s::uuid,%s,%s,%s,%s,%s::uuid,%s::uuid,%s::uuid,%s::uuid,%s)", page_size=1000)
        n_fills += len(fill_rows)
    conn.commit()
    cur.close()
    return {"clob_markets": len(markets), "clob_orders": n_orders, "clob_fills": n_fills}


# --------------------------------------------------------------------------- #
# BTC real-time tick feed
# --------------------------------------------------------------------------- #
def seed_btc(conn, cfg, rng, dry: bool) -> dict:
    cur = conn.cursor()
    cur.execute("select price from public.btc_price_ticks order by observed_at desc limit 1")
    row = cur.fetchone()
    s0 = float(row[0]) if row else BTC_ANCHOR_FALLBACK

    step = cfg["btc_step_min"]
    n = int(cfg["btc_days"] * 24 * 60 / step)
    dt = step / (365.0 * 24 * 60)                     # minutes -> years
    # realistic crypto params: ~55% annual vol, mild drift, ~30 news jumps/yr
    path = quant.merton_jump_diffusion(s0, n, mu=0.15, sigma=0.55, dt=dt,
                                       lam=30.0, jump_mu=0.0, jump_sigma=0.012, rng=rng)
    start = NOW - timedelta(minutes=(n - 1) * step)
    ts = [start + timedelta(minutes=i * step) for i in range(n)]
    if dry:
        return {"btc_ticks": n, "btc_anchor": round(s0, 2)}

    cur.execute("delete from public.btc_price_ticks where source='sim'")
    rows = [(round(float(path[i]), 6), "sim", ts[i]) for i in range(n)]
    execute_values(cur,
        "insert into public.btc_price_ticks (price, source, observed_at) values %s",
        rows, template="(%s,%s,%s)", page_size=2000)

    # re-anchor OPEN windows' reference price to the live feed (unique per market)
    epochs = np.array([t.timestamp() for t in ts])
    prices = np.array([float(p) for p in path])
    cur.execute("""select id, opens_at from public.btc_windows where status='open'""")
    for wid, opens_at in cur.fetchall():
        ref = float(np.interp(opens_at.timestamp(), epochs, prices))
        cur.execute("update public.btc_windows set reference_price=%s where id=%s", (round(ref, 2), wid))
    conn.commit()
    cur.close()
    return {"btc_ticks": n, "btc_anchor": round(s0, 2), "btc_last": round(float(path[-1]), 2)}


# --------------------------------------------------------------------------- #
# verify / budget
# --------------------------------------------------------------------------- #
def verify(conn) -> dict:
    cur = conn.cursor()
    out = {}
    for t in ["price_history", "clob_orders", "clob_fills", "btc_price_ticks",
              "positions", "market_activity", "comments", "transactions"]:
        cur.execute(f"select count(*) from public.{t}")
        out[t] = cur.fetchone()[0]
    cur.execute("select pg_size_pretty(pg_database_size('postgres'))")
    out["db_size"] = cur.fetchone()[0]
    cur.execute("select pg_database_size('postgres')")
    out["db_bytes"] = cur.fetchone()[0]
    cur.close()
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["price", "clob", "btc", "verify", "all"])
    ap.add_argument("--tier", choices=list(TIERS), default="intensive")
    ap.add_argument("--seed", type=int, default=2027)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cfg = TIERS[args.tier]
    rng = np.random.default_rng(args.seed)
    conn = connect()
    conn.autocommit = False
    print(f"tier={args.tier} dry_run={args.dry_run}")

    if args.cmd in ("price", "all"):
        print("price ->", seed_price(conn, cfg, rng, args.dry_run))
    if args.cmd in ("clob", "all"):
        print("clob  ->", seed_clob(conn, cfg, rng, args.dry_run))
    if args.cmd in ("btc", "all"):
        print("btc   ->", seed_btc(conn, cfg, rng, args.dry_run))
    if args.cmd in ("verify", "all"):
        print("verify->", verify(conn))
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
