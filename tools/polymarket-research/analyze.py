#!/usr/bin/env python3
"""
Quantitative analysis of the Polymarket ground-truth snapshots produced by collect.py.

Computes and persists:
  * Market-universe descriptive statistics (volume, liquidity, tick sizes, negRisk share)
  * Implied-probability distribution + favorite-longshot diagnostics
  * Order-book microstructure: bid-ask spread, top-of-book depth, book imbalance
  * YES+NO price coherence (no-arbitrage dual-leg check)
  * Price-history realised volatility

Outputs:
  * data/stats.json          machine-readable results (source of every number in the docs)
  * assets/*.png             charts embedded in the analysis docs
  * prints a compact human summary
"""
from __future__ import annotations
import json, os, math, statistics as st
from typing import Any, Dict, List, Optional
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "data")
ASSETS = os.path.abspath(os.path.join(HERE, "..", "..", "docs", "research", "polymarket", "assets"))
os.makedirs(ASSETS, exist_ok=True)

plt.rcParams.update({"figure.dpi": 130, "font.size": 9, "axes.grid": True,
                     "grid.alpha": 0.25})


def load(name: str) -> Any:
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)


def fnum(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        return float(x)
    except (TypeError, ValueError):
        return None


def jloads(x: Any) -> Any:
    if isinstance(x, str):
        try:
            return json.loads(x)
        except Exception:  # noqa: BLE001
            return None
    return x


def pctl(a: List[float], p: float) -> Optional[float]:
    a = [v for v in a if v is not None]
    if not a:
        return None
    return float(np.percentile(a, p))


def summ(a: List[float]) -> Dict[str, Optional[float]]:
    a = [v for v in a if v is not None]
    if not a:
        return {"n": 0}
    return {"n": len(a), "min": float(min(a)), "p25": pctl(a, 25), "median": pctl(a, 50),
            "mean": float(np.mean(a)), "p75": pctl(a, 75), "p95": pctl(a, 95),
            "max": float(max(a)), "sum": float(np.sum(a))}


def analyze_universe(markets: List[dict]) -> Dict[str, Any]:
    vol24 = [fnum(m.get("volume24hr")) for m in markets]
    vol_total = [fnum(m.get("volume")) for m in markets]
    liq = [fnum(m.get("liquidityNum")) for m in markets]
    spread = [fnum(m.get("spread")) for m in markets]
    tick = [fnum(m.get("orderPriceMinTickSize")) for m in markets]
    minsz = [fnum(m.get("orderMinSize")) for m in markets]
    negrisk = sum(1 for m in markets if m.get("negRisk"))
    # implied prob = YES price
    yes_prices: List[float] = []
    coherence: List[float] = []
    for m in markets:
        prices = jloads(m.get("outcomePrices"))
        outs = jloads(m.get("outcomes"))
        if isinstance(prices, list) and len(prices) == 2:
            p0, p1 = fnum(prices[0]), fnum(prices[1])
            if p0 is not None:
                yes_prices.append(p0)
            if p0 is not None and p1 is not None:
                coherence.append(p0 + p1)
    tick_hist: Dict[str, int] = {}
    for t in tick:
        if t is not None:
            tick_hist[str(t)] = tick_hist.get(str(t), 0) + 1
    return {
        "n_markets": len(markets),
        "negRisk_count": negrisk, "negRisk_pct": round(100 * negrisk / max(1, len(markets)), 2),
        "volume24hr": summ(vol24), "volume_total": summ(vol_total),
        "liquidity": summ(liq), "gamma_spread": summ(spread),
        "min_order_size": summ(minsz), "tick_size_hist": tick_hist,
        "yes_price": summ(yes_prices),
        "yes_price_hist": np.histogram([p for p in yes_prices if p is not None], bins=20, range=(0, 1))[0].tolist(),
        "dual_leg_sum": summ(coherence),
        "dual_leg_within_1pct": round(100 * sum(1 for c in coherence if abs(c - 1) <= 0.01) / max(1, len(coherence)), 2),
    }


def book_metrics(book: dict) -> Optional[Dict[str, float]]:
    if not isinstance(book, dict):
        return None
    bids = book.get("bids") or []
    asks = book.get("asks") or []
    def lvl(side):
        out = []
        for x in side:
            p, s = fnum(x.get("price")), fnum(x.get("size"))
            if p is not None and s is not None:
                out.append((p, s))
        return out
    b, a = lvl(bids), lvl(asks)
    if not b or not a:
        return None
    best_bid = max(p for p, _ in b)
    best_ask = min(p for p, _ in a)
    spread = best_ask - best_bid
    mid = (best_bid + best_ask) / 2
    bid_depth = sum(s for _, s in b)
    ask_depth = sum(s for _, s in a)
    tot = bid_depth + ask_depth
    imbalance = (bid_depth - ask_depth) / tot if tot else 0.0
    # notional depth within 5c of mid
    depth_5c = sum(p * s for p, s in b if best_bid - p <= 0.05) + \
               sum(p * s for p, s in a if p - best_ask <= 0.05)
    return {"best_bid": best_bid, "best_ask": best_ask, "spread": spread,
            "spread_bps_of_mid": (spread / mid * 1e4) if mid else None,
            "mid": mid, "n_bid_levels": len(b), "n_ask_levels": len(a),
            "bid_depth_shares": bid_depth, "ask_depth_shares": ask_depth,
            "book_imbalance": imbalance, "notional_depth_within_5c": depth_5c}


def analyze_microstructure(books: List[dict]) -> Dict[str, Any]:
    spreads, spr_bps, n_levels, imbalances, depth5c, mids = [], [], [], [], [], []
    coherence_book = []
    per_market_rows = []
    for rec in books:
        toks = rec.get("tokens") or []
        mvals = []
        for t in toks:
            bm = book_metrics(t.get("book"))
            if not bm:
                continue
            spreads.append(bm["spread"]); n_levels.append(bm["n_bid_levels"] + bm["n_ask_levels"])
            imbalances.append(bm["book_imbalance"]); depth5c.append(bm["notional_depth_within_5c"])
            mids.append(bm["mid"])
            if bm["spread_bps_of_mid"] is not None:
                spr_bps.append(bm["spread_bps_of_mid"])
            mvals.append(bm["mid"])
        if len(mvals) == 2:
            coherence_book.append(mvals[0] + mvals[1])
        if toks:
            bm0 = book_metrics((toks[0] or {}).get("book"))
            if bm0:
                per_market_rows.append({"question": rec.get("question"),
                                        "spread": round(bm0["spread"], 4),
                                        "mid": round(bm0["mid"], 4),
                                        "depth5c_usd": round(bm0["notional_depth_within_5c"], 0),
                                        "vol24": fnum(rec.get("volume24hr"))})
    return {
        "n_books": len(books), "n_token_books": len(spreads),
        "spread_abs": summ(spreads), "spread_bps_of_mid": summ(spr_bps),
        "book_levels_per_token": summ([float(x) for x in n_levels]),
        "book_imbalance": summ(imbalances),
        "notional_depth_within_5c_usd": summ(depth5c),
        "dual_leg_mid_sum": summ(coherence_book),
        "dual_leg_mid_within_1pct": round(100 * sum(1 for c in coherence_book if abs(c - 1) <= 0.01) / max(1, len(coherence_book)), 2),
        "top_liquid_sample": sorted(per_market_rows, key=lambda r: (r["depth5c_usd"] or 0), reverse=True)[:15],
    }


def analyze_volatility(books: List[dict]) -> Dict[str, Any]:
    realised = []
    ranges = []
    for rec in books:
        h = rec.get("price_history_1d")
        if not isinstance(h, list) or len(h) < 5:
            continue
        ps = [fnum(pt.get("p")) for pt in h if fnum(pt.get("p")) is not None]
        if len(ps) < 5:
            continue
        rets = [ps[i] - ps[i - 1] for i in range(1, len(ps))]  # additive (price is a probability)
        if rets:
            realised.append(float(np.std(rets)))
            ranges.append(max(ps) - min(ps))
    return {"intraday_step_stdev": summ(realised), "intraday_range": summ(ranges),
            "n_series": len(realised)}


def make_charts(universe: Dict[str, Any], micro: Dict[str, Any], markets: List[dict], books: List[dict]) -> List[str]:
    made = []
    # 1. Implied-probability distribution
    yes = []
    for m in markets:
        pr = jloads(m.get("outcomePrices"))
        if isinstance(pr, list) and pr:
            v = fnum(pr[0])
            if v is not None:
                yes.append(v)
    fig, ax = plt.subplots(figsize=(6, 3.4))
    ax.hist(yes, bins=25, range=(0, 1), color="#2563eb", alpha=0.85)
    ax.set_title(f"Implied YES-probability distribution (n={len(yes)} markets)")
    ax.set_xlabel("YES price (implied probability)"); ax.set_ylabel("markets")
    fig.tight_layout(); p = os.path.join(ASSETS, "prob_distribution.png"); fig.savefig(p); plt.close(fig); made.append(p)

    # 2. Spread distribution (bps)
    spr = []
    for rec in books:
        for t in rec.get("tokens") or []:
            bm = book_metrics(t.get("book"))
            if bm and bm["spread_bps_of_mid"] is not None:
                spr.append(min(bm["spread_bps_of_mid"], 5000))
    fig, ax = plt.subplots(figsize=(6, 3.4))
    ax.hist(spr, bins=40, color="#059669", alpha=0.85)
    ax.set_title(f"Top-of-book spread (bps of mid), n={len(spr)} tokens")
    ax.set_xlabel("spread (bps of mid)"); ax.set_ylabel("outcome tokens")
    fig.tight_layout(); p = os.path.join(ASSETS, "spread_distribution.png"); fig.savefig(p); plt.close(fig); made.append(p)

    # 3. Volume vs liquidity scatter (log-log)
    vv, ll = [], []
    for m in markets:
        v, l = fnum(m.get("volume24hr")), fnum(m.get("liquidityNum"))
        if v and l and v > 0 and l > 0:
            vv.append(v); ll.append(l)
    fig, ax = plt.subplots(figsize=(6, 3.6))
    ax.scatter(ll, vv, s=8, alpha=0.4, color="#7c3aed")
    ax.set_xscale("log"); ax.set_yscale("log")
    ax.set_title(f"24h volume vs resting liquidity (n={len(vv)})")
    ax.set_xlabel("liquidity (USD, log)"); ax.set_ylabel("24h volume (USD, log)")
    fig.tight_layout(); p = os.path.join(ASSETS, "volume_vs_liquidity.png"); fig.savefig(p); plt.close(fig); made.append(p)

    # 4. Dual-leg coherence (YES+NO)
    coh = universe["dual_leg_sum"]
    sums = []
    for m in markets:
        pr = jloads(m.get("outcomePrices"))
        if isinstance(pr, list) and len(pr) == 2:
            a, b = fnum(pr[0]), fnum(pr[1])
            if a is not None and b is not None:
                sums.append(a + b)
    fig, ax = plt.subplots(figsize=(6, 3.4))
    ax.hist(sums, bins=40, range=(0.9, 1.1), color="#dc2626", alpha=0.8)
    ax.axvline(1.0, color="black", lw=1, ls="--")
    ax.set_title("No-arbitrage check: YES + NO price sum")
    ax.set_xlabel("YES + NO"); ax.set_ylabel("markets")
    fig.tight_layout(); p = os.path.join(ASSETS, "dual_leg_coherence.png"); fig.savefig(p); plt.close(fig); made.append(p)
    return made


def main() -> int:
    markets = load("markets.json")
    books = load("books.json")
    manifest = load("MANIFEST.json")

    universe = analyze_universe(markets)
    micro = analyze_microstructure(books)
    vol = analyze_volatility(books)
    charts = make_charts(universe, micro, markets, books)

    stats = {"manifest": manifest, "universe": universe,
             "microstructure": micro, "volatility": vol,
             "charts": [os.path.basename(c) for c in charts]}
    with open(os.path.join(DATA, "stats.json"), "w") as f:
        json.dump(stats, f, indent=2)

    print("=== UNIVERSE ===")
    print("markets:", universe["n_markets"], "| negRisk %:", universe["negRisk_pct"])
    print("vol24 median/mean/sum:", round(universe["volume24hr"]["median"],1),
          round(universe["volume24hr"]["mean"],1), round(universe["volume24hr"]["sum"],0))
    print("liquidity median:", round(universe["liquidity"]["median"],1))
    print("tick hist:", universe["tick_size_hist"])
    print("dual-leg within 1%:", universe["dual_leg_within_1pct"], "%")
    print("=== MICROSTRUCTURE ===")
    print("token books:", micro["n_token_books"])
    print("spread abs median:", round(micro["spread_abs"]["median"],4),
          "| bps median:", round(micro["spread_bps_of_mid"]["median"],1))
    print("levels/token median:", micro["book_levels_per_token"]["median"])
    print("depth<=5c median USD:", round(micro["notional_depth_within_5c_usd"]["median"],0))
    print("book dual-leg within 1%:", micro["dual_leg_mid_within_1pct"], "%")
    print("=== VOLATILITY ===")
    print("series:", vol["n_series"], "| intraday range median:", round(vol["intraday_range"]["median"],4))
    print("charts:", [os.path.basename(c) for c in charts])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
