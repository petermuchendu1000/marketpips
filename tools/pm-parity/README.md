# PM parity extraction harness

Dev-only harness that captures **hard data** from live Polymarket market pages
to drive our market-detail parity work (see `docs/design/PM-PARITY-SPEC.md`).

```
python3 tools/pm-parity/extract.py <event-url> <label> <desktop|mobile>
```

Outputs (git-ignored, reference only): clean screenshots (overlays dismissed),
a flat DOM dump with per-element geometry + curated `getComputedStyle`, and
`:root` custom properties. We distill measurements into the committed spec sheet;
raw PM captures are never committed.
