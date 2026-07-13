#!/usr/bin/env python3
"""
seed_activity.py — seed realistic trader activity (recent trades + comments) for
the hero/featured markets so the homepage "Activity" feed feels live.

- Fresh trades in the last ~24h (buy/sell Yes/No) with amounts + prices near the
  market's current implied probability, spread across random profiles.
- Believable discussion comments (varied tone, some Yes/No leaning, light Kenyan
  market flavour) with staggered timestamps and like counts.

Idempotent-ish: only ADDS rows (does not delete existing activity). Safe to run
once after seeding price history. Requires DATABASE_URL.
"""
from __future__ import annotations
import argparse
import os
import random
import sys
from datetime import datetime, timedelta, timezone

import psycopg2
from psycopg2.extras import execute_values

COMMENTS = [
    "Yes looks overpriced here — fading it.",
    "No is the value play at these levels.",
    "Volume spiked after the news this morning, watching closely.",
    "Loading up on Yes, the momentum is clear.",
    "Market's mispricing this imo, fundamentals say otherwise.",
    "Anyone else think this resolves earlier than expected?",
    "The move from 40 to 46 was too fast, expecting a pullback.",
    "Smart money is clearly on No.",
    "This is basically a coin flip until the announcement.",
    "Called it last week — trend is holding.",
    "Liquidity is thin, careful with size.",
    "Ata mimi niko kwa Yes, hii ni obvious.",  # "I'm on Yes too, this is obvious"
    "Wacha tuone how the debate shifts things.",  # "Let's see how the debate shifts things"
    "Hedged my position, risk/reward not great now.",
    "The chart says consolidation, not a breakout.",
    "News cycle is driving this more than fundamentals.",
    "I'd wait for a dip below 40 before entering.",
    "Strong hands holding Yes through the volatility.",
    "This has priced in way too much optimism.",
    "Sentiment flipped hard after last week's headlines.",
    "Following the volume — it doesn't lie.",
    "No at 54 is free money if you ask me.",
    "Too much noise, staying flat until it settles.",
    "That resistance around 50 keeps holding.",
    "Whales moved the price, retail chasing now.",
]

SIDES = ["yes", "no"]
ACTIONS = ["buy", "buy", "buy", "sell"]  # buys more common


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trades", type=int, default=22, help="recent trades per market")
    ap.add_argument("--comments", type=int, default=7, help="comments per market")
    ap.add_argument("--limit", type=int, default=24, help="markets to seed (by volume)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--seed", type=int, default=11)
    args = ap.parse_args()

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("ERROR: set DATABASE_URL", file=sys.stderr)
        return 2
    rng = random.Random(args.seed)

    conn = psycopg2.connect(dsn, connect_timeout=20)
    cur = conn.cursor()

    cur.execute("select id from public.profiles order by random() limit 60")
    profiles = [r[0] for r in cur.fetchall()]
    if len(profiles) < 5:
        print("Not enough profiles to attribute activity", file=sys.stderr)
        return 3

    cur.execute(
        """
        select id, resolution_type, coalesce(yes_price, 0.5), total_volume_usd
        from public.markets
        where status = 'active'
          and title not ilike '%%Up or Down%%'
          and (is_featured = true or is_trending = true or total_volume_usd > 0)
        order by total_volume_usd desc nulls last
        limit %s
        """,
        (args.limit,),
    )
    markets = cur.fetchall()
    now = datetime.now(timezone.utc)

    trade_rows: list[tuple] = []
    comment_rows: list[tuple] = []
    for mid, rtype, yes_price, total_vol in markets:
        mid = str(mid)
        p = float(yes_price)
        vol = float(total_vol or 0) or 1e6
        # recent trades over the last 24h
        for _ in range(args.trades):
            side = rng.choice(SIDES)
            action = rng.choice(ACTIONS)
            # price near current implied prob for the chosen side, with jitter
            base = p if side == "yes" else (1 - p)
            price = min(0.98, max(0.02, base + rng.uniform(-0.04, 0.04)))
            amount = round(abs(rng.gauss(vol * 0.0005, vol * 0.0004)) + 500, 2)
            mins_ago = rng.randint(1, 24 * 60)
            trade_rows.append((mid, rng.choice(profiles), action, side,
                               amount, round(price, 6), now - timedelta(minutes=mins_ago)))
        # discussion comments over the last ~3 days
        picks = rng.sample(COMMENTS, min(args.comments, len(COMMENTS)))
        for text in picks:
            hrs_ago = rng.randint(1, 72)
            likes = int(abs(rng.gauss(6, 8)))
            comment_rows.append((mid, rng.choice(profiles), text, likes,
                                 now - timedelta(hours=hrs_ago)))

    print(f"Markets: {len(markets)} · trades: {len(trade_rows)} · comments: {len(comment_rows)}")
    if args.dry_run:
        print("dry-run — nothing written")
        return 0

    execute_values(
        cur,
        "insert into public.market_activity "
        "(market_id, user_id, action, side, amount_usd, price, created_at) values %s",
        trade_rows,
        template="(%s::uuid, %s::uuid, %s, %s::order_side, %s, %s, %s)",
        page_size=500,
    )
    execute_values(
        cur,
        "insert into public.comments "
        "(market_id, user_id, content, like_count, created_at) values %s",
        comment_rows,
        template="(%s::uuid, %s::uuid, %s, %s, %s)",
        page_size=500,
    )
    # keep markets.comment_count roughly in sync for the seeded set
    cur.execute(
        """
        update public.markets m set comment_count = sub.c
        from (select market_id, count(*) c from public.comments
              where is_deleted = false group by market_id) sub
        where m.id = sub.market_id
        """
    )
    conn.commit()
    print(f"DONE: inserted {len(trade_rows)} trades + {len(comment_rows)} comments")
    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
