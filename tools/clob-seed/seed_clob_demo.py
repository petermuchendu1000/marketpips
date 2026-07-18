#!/usr/bin/env python3
"""Seed a working CLOB demo market so the inline Order Book / Graph / Resolution
drawer renders end-to-end. Idempotent: safe to re-run. Teardown with --down.

Why this exists: the drawer only shows when a market has BOTH
pricing_engine='clob' AND flags.clob is enabled (deploy != release). A fresh DB
has zero CLOB markets, so the tabs never appear. This creates one isolated demo
market (cloned from an existing multi-outcome market to satisfy every NOT NULL
enum), seeds realistic per-candidate order books + last-trade fills + 30 days of
price history, and flips flags.clob on.

Usage:
  DATABASE_URL=postgres://... python3 tools/clob-seed/seed_clob_demo.py               # create demo market
  DATABASE_URL=postgres://... python3 tools/clob-seed/seed_clob_demo.py --down         # remove demo market
  DATABASE_URL=postgres://... python3 tools/clob-seed/seed_clob_demo.py --market SLUG   # flip an EXISTING
       # market to CLOB and seed books from its current option prices (idempotent;
       # re-run to refresh). Use this to make a real market's desktop tabs + mobile
       # order book light up (e.g. --market ke-2027-president).

Backend contract (migration 030): clob_get_book builds BIDS from resting BUY YES
orders and ASKS synthesized from resting BUY NO @ q -> ask (100-q); `last` comes
from clob_fills. So a two-sided book = BUY YES rungs + BUY NO rungs per option.
"""
import os, sys, uuid, random
from datetime import datetime, timedelta, timezone
import psycopg2

SLUG = 'clob-demo-genz-preferred-2027'
SRC_SLUG = 'ke-y-genz-preferred-2027'  # clone source (6 candidates)
MIDS = {  # per-candidate implied YES mid, in cents
    'William Ruto': 34.0, 'Rigathi Gachagua': 21.0, 'Kalonzo Musyoka': 12.0,
    "Fred Matiang'i": 9.0, 'None of the above': 15.0, 'Someone else': 7.0,
}
MAKER_USER = None  # resolved to an existing user at runtime


def connect():
    dsn = os.environ.get('DATABASE_URL') or os.environ.get('SUPABASE_DB_URL')
    if not dsn:
        sys.exit('Set DATABASE_URL to your Supabase Postgres connection string.')
    return psycopg2.connect(dsn, connect_timeout=20)


def teardown(cur):
    cur.execute("select id from markets where slug=%s", (SLUG,))
    row = cur.fetchone()
    if not row:
        print('nothing to remove'); return
    mid = row[0]
    for t in ('clob_fills', 'clob_orders', 'price_history', 'market_options'):
        cur.execute(f"delete from {t} where market_id=%s", (mid,))
    cur.execute("delete from markets where id=%s", (mid,))
    print('removed demo market', mid)


def _maker_wallet(cur):
    """A USD market-maker wallet (reuse an existing user; create the wallet once)."""
    cur.execute("select id,user_id from wallets where currency='USD' order by available_balance desc limit 1")
    w = cur.fetchone()
    if w:
        return w[0], w[1]
    cur.execute("select user_id from wallets order by created_at limit 1")
    maker = cur.fetchone()[0]
    wallet = str(uuid.uuid4())
    cur.execute("""insert into wallets(id,user_id,currency,available_balance,is_active)
                   values (%s,%s,'USD',1000000,true)""", (wallet, maker))
    return wallet, maker


def _seed_books(cur, mkt, opts, maker, wallet, rng):
    """opts: list of (option_id, mid_cents). Two-sided book + last fill per option.
    Bids = BUY YES @ m..m-0.5; asks = BUY NO @ 100-(m+0.1..m+0.6) (clob_get_book
    synthesizes the ask ladder from those). Idempotent: clears prior clob rows."""
    cur.execute("delete from clob_fills where market_id=%s", (mkt,))
    cur.execute("delete from clob_orders where market_id=%s", (mkt,))
    sz = lambda: round(rng.uniform(400, 32000), 2)
    n = 0
    for oid, m in opts:
        m = min(99.3, max(0.7, round(m, 1)))
        for k in range(6):
            p = round(m - 0.1 * k, 1)
            if p < 0.1:
                break
            s = sz()
            cur.execute("""insert into clob_orders(market_id,market_option_id,user_id,wallet_id,
                outcome_side,action,order_type,price_cents,size,filled,status,currency,
                exchange_rate_to_usd,reserved_usd)
                values (%s,%s,%s,%s,'yes','buy','limit',%s,%s,0,'open','USD',1,%s)""",
                (mkt, oid, maker, wallet, p, s, round(p / 100 * s, 2)))
            n += 1
        for k in range(6):
            a = round(m + 0.1 * (k + 1), 1)
            if a > 99.9:
                break
            qn = round(100 - a, 1)
            s = sz()
            cur.execute("""insert into clob_orders(market_id,market_option_id,user_id,wallet_id,
                outcome_side,action,order_type,price_cents,size,filled,status,currency,
                exchange_rate_to_usd,reserved_usd)
                values (%s,%s,%s,%s,'no','buy','limit',%s,%s,0,'open','USD',1,%s)""",
                (mkt, oid, maker, wallet, qn, s, round(qn / 100 * s, 2)))
            n += 1
        cur.execute("""insert into clob_fills(market_id,market_option_id,outcome_side,price_cents,
            size,taker_user_id,maker_user_id,match_kind)
            values (%s,%s,'yes',%s,%s,%s,%s,'direct')""",
            (mkt, oid, m, round(sz(), 2), maker, maker))
    return n


def seed_existing(cur, slug):
    """Flip an existing market to CLOB and seed books from its current prices."""
    random.seed(2027)
    cur.execute("""insert into platform_settings(key,value) values ('flags.clob','true'::jsonb)
                   on conflict (key) do update set value='true'::jsonb""")
    cur.execute("select id from markets where slug=%s", (slug,))
    row = cur.fetchone()
    if not row:
        sys.exit(f'market {slug} not found')
    mkt = row[0]
    cur.execute("update markets set pricing_engine='clob', updated_at=now() where id=%s", (mkt,))
    cur.execute("""select id, coalesce(yes_price, price, 0.1)*100 from market_options
                   where market_id=%s order by display_order""", (mkt,))
    opts = [(r[0], float(r[1])) for r in cur.fetchall()]
    wallet, maker = _maker_wallet(cur)
    n = _seed_books(cur, mkt, opts, maker, wallet, random)
    print(f'{slug} -> CLOB; seeded {n} resting orders across {len(opts)} candidates')


def seed(cur):
    random.seed(42)
    # 0) flag on
    cur.execute("""insert into platform_settings(key,value) values ('flags.clob','true'::jsonb)
                   on conflict (key) do update set value='true'::jsonb""")
    # idempotency: wipe a prior demo first
    teardown(cur)

    # 1) clone the source market row -> new CLOB market
    cur.execute("select id from markets where slug=%s", (SRC_SLUG,))
    src = cur.fetchone()
    if not src:
        sys.exit(f'clone source {SRC_SLUG} not found; pick any multi-outcome market')
    src_id = src[0]
    new_mid = str(uuid.uuid4())
    cur.execute("""select column_name from information_schema.columns
                   where table_name='markets' and column_name <> 'search_vector'
                   order by ordinal_position""")
    cols = [c[0] for c in cur.fetchall()]
    ov = {'id': new_mid, 'slug': SLUG,
          'title': 'Gen Z Preferred Candidate 2027 (CLOB demo)',
          'pricing_engine': 'clob', 'status': 'active',
          'is_hidden': False, 'is_featured': True}
    sel, params = [], []
    for c in cols:
        if c in ('created_at', 'updated_at'):
            sel.append('now()')
        elif c in ov:
            sel.append('%s'); params.append(ov[c])
        else:
            sel.append(c)
    cur.execute(f"insert into markets ({', '.join(cols)}) "
                f"select {', '.join(sel)} from markets where id=%s", (*params, src_id))

    # 2) clone options with per-candidate mids
    cur.execute("""select label, description, display_order, entity_kind, entity_ref, image_url
                   from market_options where market_id=%s order by display_order""", (src_id,))
    opts = []
    for label, desc, order, ek, er, img in cur.fetchall():
        oid = str(uuid.uuid4()); m = MIDS.get(label, 10.0)
        cur.execute("""insert into market_options
            (id,market_id,label,description,display_order,entity_kind,entity_ref,image_url,
             price,yes_price,no_price,is_active)
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true)""",
            (oid, new_mid, label, desc, order, ek, er, img, m/100, m/100, (100-m)/100))
        opts.append((oid, label, m))

    # 3) market-maker USD wallet (reuse an existing user)
    cur.execute("select user_id from wallets order by created_at limit 1")
    maker = cur.fetchone()[0]
    cur.execute("select id from wallets where user_id=%s and currency='USD'", (maker,))
    w = cur.fetchone()
    if w:
        wallet = w[0]
    else:
        wallet = str(uuid.uuid4())
        cur.execute("""insert into wallets(id,user_id,currency,available_balance,is_active)
                       values (%s,%s,'USD',1000000,true)""", (wallet, maker))

    # 4) two-sided books + last-trade fills + 30d history
    sz = lambda: round(random.uniform(400, 32000), 2)
    now = datetime.now(timezone.utc)
    for oid, label, m in opts:
        for k in range(6):                      # bids: BUY YES @ m..m-0.5
            p = round(m - 0.1*k, 1)
            if p < 0.1: break
            s = sz()
            cur.execute("""insert into clob_orders(market_id,market_option_id,user_id,wallet_id,
                outcome_side,action,order_type,price_cents,size,filled,status,currency,
                exchange_rate_to_usd,reserved_usd)
                values (%s,%s,%s,%s,'yes','buy','limit',%s,%s,0,'open','USD',1,%s)""",
                (new_mid, oid, maker, wallet, p, s, round(p/100*s, 2)))
        for k in range(6):                      # asks: BUY NO @ 100-(m+0.1..m+0.6)
            a = round(m + 0.1*(k+1), 1)
            if a > 99.9: break
            qn = round(100-a, 1); s = sz()
            cur.execute("""insert into clob_orders(market_id,market_option_id,user_id,wallet_id,
                outcome_side,action,order_type,price_cents,size,filled,status,currency,
                exchange_rate_to_usd,reserved_usd)
                values (%s,%s,%s,%s,'no','buy','limit',%s,%s,0,'open','USD',1,%s)""",
                (new_mid, oid, maker, wallet, qn, s, round(qn/100*s, 2)))
        cur.execute("""insert into clob_fills(market_id,market_option_id,outcome_side,price_cents,
            size,taker_user_id,maker_user_id,match_kind)
            values (%s,%s,'yes',%s,%s,%s,%s,'direct')""",
            (new_mid, oid, m, round(sz(), 2), maker, maker))
        # price history (mean-reverting walk toward the mid)
        val = max(0.02, min(0.9, m/100 + random.uniform(-0.06, 0.06)))
        for i in range(60):
            t = now - timedelta(days=30) + timedelta(days=30*i/59)
            val += (m/100 - val)*0.15 + random.uniform(-0.012, 0.012)
            val = max(0.02, min(0.95, val))
            price = round(m/100 if i == 59 else val, 4)
            cur.execute("""insert into price_history(market_id,market_option_id,price,yes_price,
                no_price,volume_usd,recorded_at) values (%s,%s,%s,%s,%s,%s,%s)""",
                (new_mid, oid, price, price, round(1-price, 4),
                 round(random.uniform(2000, 60000), 2), t))
    print(f'seeded CLOB demo market: /markets/{SLUG}  ({len(opts)} candidates)')


def main():
    conn = connect(); conn.autocommit = False; cur = conn.cursor()
    try:
        if '--down' in sys.argv:
            teardown(cur)
        elif '--market' in sys.argv:
            slug = sys.argv[sys.argv.index('--market') + 1]
            seed_existing(cur, slug)
        else:
            seed(cur)
        conn.commit()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()


if __name__ == '__main__':
    main()
