#!/usr/bin/env python3
"""
Quantum-scale synthetic seeder for the ISOLATED pm_lab schema.

Generates production-shaped data modeled on the *measured* live Polymarket
distributions (see docs/research/polymarket): longshot-dense implied prices,
power-law 24h volume/liquidity, deep multi-level books, ~50% neg-risk, tick
{0.001, 0.01}. Uses COPY for throughput. NEVER writes to public.* — pm_lab only.

DSN is read from env PM_LAB_DSN (never hardcode secrets).

Scale (defaults): 10k markets, ~30k options, 800k orders, 300k fills,
1.5M price ticks, 300k positions  (~2.9M rows).
"""
import os, io, sys, uuid, random, math, time
import psycopg2

DSN = os.environ["PM_LAB_DSN"]
random.seed(42)
N_MARKETS   = int(os.environ.get("N_MARKETS", 10000))
N_ORDERS    = int(os.environ.get("N_ORDERS", 800000))
N_FILLS     = int(os.environ.get("N_FILLS", 300000))
N_TICKS     = int(os.environ.get("N_TICKS", 1500000))
N_POSITIONS = int(os.environ.get("N_POSITIONS", 300000))
CHUNK = 50000

CATS = ['politics','sports','economics','crypto','technology','entertainment','weather','elections','business','other']
CUR  = ['KES','UGX','TZS','USD']
FX   = {'KES':129.0,'UGX':3700.0,'TZS':2500.0,'USD':1.0}

def yes_price():
    """Longshot-dense mixture matching measured histogram (46% in [0,0.05], bump near 1)."""
    r = random.random()
    if r < 0.46:   p = random.uniform(0.001, 0.05)
    elif r < 0.55: p = random.uniform(0.05, 0.10)
    elif r < 0.83: p = random.uniform(0.10, 0.50)
    elif r < 0.91: p = random.uniform(0.50, 0.95)
    else:          p = random.uniform(0.95, 0.999)
    return round(p, 3)

def lognormal(median, sigma):
    return max(0.0, math.exp(math.log(median) + random.gauss(0, sigma)))

def cents(p):
    return min(99.9, max(0.1, round(p * 100, 1)))

def copy_rows(cur, table, cols, rows_iter, total, label):
    """Stream rows via COPY in chunks."""
    done = 0
    buf = io.StringIO()
    def flush():
        nonlocal buf, done
        buf.seek(0)
        cur.copy_expert(f"COPY pm_lab.{table} ({','.join(cols)}) FROM STDIN WITH (FORMAT csv)", buf)
        buf = io.StringIO()
    for i, row in enumerate(rows_iter, 1):
        buf.write(",".join("" if v is None else str(v) for v in row) + "\n")
        if i % CHUNK == 0:
            flush(); done = i
            print(f"  {label}: {i}/{total}", flush=True)
    flush()
    print(f"  {label}: DONE {total}", flush=True)

def main():
    t0 = time.time()
    conn = psycopg2.connect(DSN, connect_timeout=30); conn.autocommit = False
    cur = conn.cursor()
    # ---- users/wallets are synthetic UUIDs (no FK in lab) ----
    users   = [str(uuid.uuid4()) for _ in range(20000)]
    wallets = [str(uuid.uuid4()) for _ in range(20000)]

    # ---- markets + options ----
    market_ids, market_meta = [], {}
    option_rows, opt_index = [], {}
    def market_gen():
        for i in range(N_MARKETS):
            mid = str(uuid.uuid4()); market_ids.append(mid)
            p = yes_price(); vol = lognormal(25683, 1.4); vol24 = vol * random.uniform(0.05, 0.4)
            liq = lognormal(68022, 1.1); tick = 0.001 if random.random() < 0.647 else 0.01
            neg = random.random() < 0.5; multi = neg and random.random() < 0.5
            n_opts = random.choice([3,4,5,6]) if multi else 1
            market_meta[mid] = dict(p=p, tick=tick, neg=neg, n_opts=n_opts, vol24=vol24, liq=liq)
            cat = random.choice(CATS); status = 'active'
            slug = f"lab-{i}-{random.randint(0,1<<30)}"
            title = f"Lab market {i}"
            yield (mid, slug, title, "seeded", random.choice(users),
                   "2027-01-01T00:00:00+00:00", "criteria", cat, status,
                   round(p,4), round(1-p,4), round(liq,2), round(vol,2), round(vol24,2), 'clob')
    copy_rows(cur, "markets",
              ["id","slug","title","description","creator_id","closes_at","resolution_criteria",
               "category","status","yes_price","no_price","liquidity_pool_usd","total_volume_usd",
               "volume_24h_usd","pricing_engine"],
              market_gen(), N_MARKETS, "markets")

    def option_gen():
        for mid in market_ids:
            meta = market_meta[mid]; n = meta['n_opts']
            if n == 1:
                oid = str(uuid.uuid4()); opt_index[mid] = [(oid, meta['p'])]
                yield (oid, mid, "Yes", round(meta['p'],4), 0, True)
            else:
                # multi-outcome: prices sum to 1 (neg-risk invariant)
                raw = [random.random() for _ in range(n)]; s = sum(raw)
                ps = [round(x/s,4) for x in raw]; opt_index[mid] = []
                for k in range(n):
                    oid = str(uuid.uuid4()); opt_index[mid].append((oid, ps[k]))
                    yield (oid, mid, f"Outcome {k+1}", ps[k], k, True)
    # count options first
    n_opts_total = sum(market_meta[m]['n_opts'] for m in market_ids)
    copy_rows(cur, "market_options",
              ["id","market_id","label","price","display_order","is_active"],
              option_gen(), n_opts_total, "options")
    conn.commit(); print(f"markets+options committed ({time.time()-t0:.0f}s)", flush=True)

    # ---- clob_orders: deep books (median ~93 levels/token) ----
    def order_gen():
        for _ in range(N_ORDERS):
            mid = random.choice(market_ids); opts = opt_index[mid]; oid, op = random.choice(opts)
            side = 'yes' if random.random() < 0.5 else 'no'
            base = op if side == 'yes' else 1-op
            price = min(0.999, max(0.001, base + random.gauss(0, 0.03)))
            action = 'buy' if random.random() < 0.5 else 'sell'
            size = round(lognormal(500, 1.2), 2)
            cur_c = random.choice(CUR); status = random.choice(['open','open','partially_filled','filled','cancelled'])
            filled = 0 if status in ('open',) else round(size*random.uniform(0,1),2)
            if filled > size: filled = size
            yield (str(uuid.uuid4()), mid, oid, random.choice(users), random.choice(wallets),
                   side, action, 'limit', cents(price), size, filled, status,
                   cur_c, FX[cur_c], round(size*price,2))
    copy_rows(cur, "clob_orders",
              ["id","market_id","market_option_id","user_id","wallet_id","outcome_side","action",
               "order_type","price_cents","size","filled","status","currency","exchange_rate_to_usd","reserved_usd"],
              order_gen(), N_ORDERS, "orders")
    conn.commit(); print(f"orders committed ({time.time()-t0:.0f}s)", flush=True)

    # ---- clob_fills ----
    def fill_gen():
        for _ in range(N_FILLS):
            mid = random.choice(market_ids); oid, op = random.choice(opt_index[mid])
            side = 'yes' if random.random()<0.5 else 'no'
            price = min(0.999, max(0.001, (op if side=='yes' else 1-op)+random.gauss(0,0.02)))
            mk = random.choice(['direct','direct','mint','burn'])
            yield (str(uuid.uuid4()), mid, oid, side, cents(price), round(lognormal(300,1.0),2),
                   mk, random.choice(users), random.choice(users))
    copy_rows(cur, "clob_fills",
              ["id","market_id","market_option_id","outcome_side","price_cents","size","match_kind",
               "taker_user_id","maker_user_id"],
              fill_gen(), N_FILLS, "fills")
    conn.commit()

    # ---- price_history ----
    def tick_gen():
        for _ in range(N_TICKS):
            mid = random.choice(market_ids); oid, op = random.choice(opt_index[mid])
            p = min(0.999,max(0.001, op+random.gauss(0,0.05)))
            yield (str(uuid.uuid4()), mid, round(p,4), round(1-p,4), round(lognormal(1000,1.0),2), oid, round(p,4))
    copy_rows(cur, "price_history",
              ["id","market_id","yes_price","no_price","volume_usd","market_option_id","price"],
              tick_gen(), N_TICKS, "ticks")
    conn.commit()

    # ---- positions (unique user_id, market_id, side) ----
    def pos_gen():
        seen = set(); made = 0
        while made < N_POSITIONS:
            u = random.choice(users); mid = random.choice(market_ids); side = random.choice(['yes','no'])
            key = (u, mid, side)
            if key in seen: continue
            seen.add(key); made += 1
            oid, op = random.choice(opt_index[mid])
            shares = round(lognormal(200,1.1),2); entry = min(0.999,max(0.001, op+random.gauss(0,0.05)))
            yield (str(uuid.uuid4()), u, mid, random.choice(wallets), side, shares,
                   round(shares*entry,2), round(entry,4), round(shares*op,2), True, oid)
    copy_rows(cur, "positions",
              ["id","user_id","market_id","wallet_id","side","shares","total_invested_usd",
               "avg_entry_price","current_value_usd","is_active","market_option_id"],
              pos_gen(), N_POSITIONS, "positions")
    conn.commit()

    # ---- analyze for realistic planner stats ----
    print("ANALYZE ...", flush=True)
    old = conn.autocommit; conn.autocommit = True
    for t in ['markets','market_options','clob_orders','clob_fills','price_history','positions']:
        cur.execute(f"ANALYZE pm_lab.{t};")
    conn.autocommit = old
    cur.execute("""select 'markets',count(*) from pm_lab.markets union all
                   select 'options',count(*) from pm_lab.market_options union all
                   select 'orders',count(*) from pm_lab.clob_orders union all
                   select 'fills',count(*) from pm_lab.clob_fills union all
                   select 'ticks',count(*) from pm_lab.price_history union all
                   select 'positions',count(*) from pm_lab.positions;""")
    print("FINAL COUNTS:", dict(cur.fetchall()))
    print(f"TOTAL TIME: {time.time()-t0:.0f}s")
    cur.close(); conn.close()

if __name__ == "__main__":
    main()
