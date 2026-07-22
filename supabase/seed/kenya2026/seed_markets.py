#!/usr/bin/env python3
"""
seed_markets.py — insert the researched Kenya-2026 catalog (markets + options)
with entity-imagery refs and coherent initial prices.

Idempotent: markets upsert by slug; multi-outcome options are replaced per market.
Reads SUPABASE_DB_URL from the environment (no secrets committed).

Pricing model
-------------
* binary        -> markets.yes_price = p, no_price = 1-p.
* multi_choice  -> each option is its own Yes/No book (Polymarket "simplex"):
                   option.yes_price = p_i (normalised so sum p_i = 1),
                   option.no_price  = 1 - p_i, option.price = p_i (legacy field).
* liquidity_pool_usd seeds the AMM depth (featured deeper than the long tail) so
  later simulated trades move price realistically.
"""
from __future__ import annotations
import os, sys, json
import psycopg2, psycopg2.extras

sys.path.insert(0, os.path.dirname(__file__))
import catalog as CAT

DB = os.environ["SUPABASE_DB_URL"]
ALLOWED = ["KE", "TZ", "UG", "RW", "ZM", "ET", "BI"]


def liq(m):
    if m.get("featured"): return 2000
    if m.get("trending"): return 1200
    return 600


def main() -> int:
    conn = psycopg2.connect(DB, connect_timeout=25)
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("select id from public.profiles where role='superadmin' order by created_at limit 1")
    row = cur.fetchone()
    if not row:
        print("FATAL: no superadmin profile found"); return 2
    creator = row[0]
    print("creator (superadmin):", creator)

    feat_order = 0
    n_mk = n_opt = 0
    for m in CAT.MARKETS:
        rtype = m["rtype"]
        is_bin = rtype == "binary"
        yes = float(m.get("yes", 0.5)) if is_bin else 0.5
        status = "active"
        resolved_outcome = None; resolved_at = None; resolver = None; res_notes = None
        if m.get("resolve_to"):
            status = "resolved"; resolved_outcome = m["resolve_to"]
            resolved_at = m["resolves"]; resolver = creator
            res_notes = "Resolved from public record during seed."
        fo = None
        if m.get("featured"):
            feat_order += 1; fo = feat_order

        ck, cref = m["cover"]
        cur.execute(
            """
            insert into public.markets
              (slug,title,description,category,resolution_type,creator_id,status,
               opens_at,closes_at,resolves_at,resolved_at,resolver_id,resolved_outcome,
               resolution_criteria,resolution_notes,resolution_source,
               yes_price,no_price,liquidity_pool_usd,initial_liquidity_usd,
               is_featured,is_trending,featured_order,tags,allowed_countries,
               cover_entity_kind,cover_entity_ref,metadata)
            values
              (%s,%s,%s,%s::market_category,%s::market_resolution_type,%s,%s::market_status,
               now()- interval '20 days',%s,%s,%s,%s,%s::order_side,
               %s,%s,%s,
               %s,%s,%s,%s,
               %s,%s,%s,%s,%s,
               %s,%s,%s::jsonb)
            on conflict (slug) do update set
               title=excluded.title, description=excluded.description,
               category=excluded.category, resolution_type=excluded.resolution_type,
               status=excluded.status, closes_at=excluded.closes_at,
               resolves_at=excluded.resolves_at, resolved_at=excluded.resolved_at,
               resolved_outcome=excluded.resolved_outcome,
               resolution_criteria=excluded.resolution_criteria,
               resolution_notes=excluded.resolution_notes,
               yes_price=excluded.yes_price, no_price=excluded.no_price,
               liquidity_pool_usd=excluded.liquidity_pool_usd,
               initial_liquidity_usd=excluded.initial_liquidity_usd,
               is_featured=excluded.is_featured, is_trending=excluded.is_trending,
               featured_order=excluded.featured_order, tags=excluded.tags,
               cover_entity_kind=excluded.cover_entity_kind,
               cover_entity_ref=excluded.cover_entity_ref
            returning id
            """,
            (m["slug"], m["title"], m["desc"], m["category"], rtype, creator, status,
             m["closes"], m["resolves"], resolved_at, resolver, resolved_outcome,
             m["criteria"], res_notes, ("Seed: public record" if status == "resolved" else None),
             round(yes, 4), round(1 - yes, 4), liq(m), liq(m),
             bool(m.get("featured")), bool(m.get("trending")), fo, m["tags"], ALLOWED,
             ck, cref, json.dumps({"seed": "kenya2026"})),
        )
        mid = cur.fetchone()[0]
        n_mk += 1

        # options
        cur.execute("delete from public.market_options where market_id=%s", (mid,))
        if not is_bin:
            opts = m["options"]
            s = sum(o[3] for o in opts) or 1.0
            for i, (label, ek, eref, p) in enumerate(opts):
                pi = round(p / s, 4)
                cur.execute(
                    """insert into public.market_options
                       (market_id,label,price,yes_price,no_price,q_shares,q_yes,q_no,
                        volume_usd,display_order,is_active,entity_kind,entity_ref)
                       values (%s,%s,%s,%s,%s,0,0,0,0,%s,true,%s,%s)""",
                    (mid, label, pi, pi, round(1 - pi, 4), i, ek, eref),
                )
                n_opt += 1

    conn.commit()
    cur.execute("select count(*) from public.markets"); mk = cur.fetchone()[0]
    cur.execute("select count(*) from public.market_options"); op = cur.fetchone()[0]
    cur.execute("select status,count(*) from public.markets group by status order by 1")
    print(f"upserted markets={n_mk} options={n_opt} | live totals: markets={mk} options={op}")
    print("by status:", cur.fetchall())
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
