# Polymarket Ground-Truth Research Toolkit

Reproducible harness that pulls **live, public** Polymarket data and computes the
quantitative statistics that back every number in
[`/docs/research/polymarket`](../../docs/research/polymarket/README.md).

All four Polymarket APIs used here are public and require **no authentication**:

| API   | Base URL                              | Used for                                   |
|-------|---------------------------------------|--------------------------------------------|
| Gamma | `https://gamma-api.polymarket.com`    | events, markets, discovery metadata        |
| CLOB  | `https://clob.polymarket.com`         | order books, midpoints, spreads, history   |
| Data  | `https://data-api.polymarket.com`     | holders / open-interest distribution       |
| Bridge| `https://bridge.polymarket.com`       | deposits/withdrawals (documented, not polled) |

## Usage

```bash
pip install -r requirements.txt

# 1. Collect a point-in-time snapshot (writes data/*.json + MANIFEST.json)
python collect.py --markets 600 --events 200 --books 140 --outdir data

# 2. Compute statistics + charts (writes data/stats.json + docs assets)
python analyze.py
```

## Provenance & reproducibility

* `data/MANIFEST.json` records the collection window, endpoints, params, and counts.
* `data/*.json.gz` are the **compressed raw snapshots** — the immutable ground truth.
* `data/stats.json` is the derived statistics file; **every figure in the docs is
  traceable to a key in this file**.
* Snapshots are point-in-time. Prices/liquidity drift; re-run `collect.py` to refresh,
  then `analyze.py` to regenerate. The analysis is deterministic given a snapshot.

## Files

| File            | Purpose                                             |
|-----------------|-----------------------------------------------------|
| `collect.py`    | Paginated, rate-limited, retrying collector         |
| `analyze.py`    | Universe + microstructure + volatility statistics   |
| `data/*.json.gz`| Raw snapshots (gunzip to inspect)                   |
| `data/stats.json`| Machine-readable results (source of doc numbers)   |
