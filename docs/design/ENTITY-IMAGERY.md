# Entity Imagery — market & outcome avatars (logos / people / crypto)

Kalshi and Polymarket give every market/outcome a visual identity (company
logos, people photos, token marks). This is our efficient, optimized take.

## Guiding principle
**Resolve once, store once, serve from CDN — never hotlink at render.**
Rendering never depends on a third party being up; a missing/broken image is
always covered by a deterministic monogram, so there are no blank tiles, no
broken-image icons, and no layout shift.

## Three layers

### 1. Monogram fallback — the ship-now baseline (zero cost)
`lib/media/entity-image.ts` → `monogram(name)` returns initials + a brand colour
derived from an FNV-1a hash of the name (stable, case/space-insensitive, AA
contrast band). No network, no storage, no schema change. This alone removes
every empty/broken avatar across cards, the order ticket and option pills.

### 2. Real imagery, resolved once (upgrade path)
A resolver waterfall, cheap → rich, run at **market-create** or via a **backfill
job** (never at render):
1. Admin-provided URL (explicit, highest priority).
2. **Company** → Brandfetch (connected integration) by domain → Clearbit /
   logo.dev → Google S2 favicon (`faviconUrl()`), lowest confidence.
3. **Person** → Wikipedia/Wikimedia REST thumbnail (`wikimediaThumb()`).
4. **Crypto** → token-list / CoinGecko logo.
5. Else → monogram (layer 1).

The chosen source is **downloaded, normalised with `sharp` to a square WebP
(128 + 256), and uploaded to a Supabase Storage bucket** (public, immutable,
`Cache-Control: public, max-age=31536000, immutable`, hash in the filename).
The resulting public URL is persisted to `markets.cover_image_url` and (once the
column is added) `market_options.image_url`. Entities are **deduped by key**
(domain/slug) so each company is fetched exactly once.

> Schema note: `market_options` has no image column yet — a small additive
> migration (`image_url text`) unlocks per-option logos. Until then options use
> the monogram, which already looks on-brand.

### 3. Optimized rendering — `components/ui/entity-avatar.tsx`
One `<EntityAvatar name imageUrl size shape />` primitive used everywhere
(cards, detail header, order-ticket header, option pills):
- Stored/explicit image → lazy, async `<img>` (small squares don't benefit from
  the Next optimizer, and a plain tag is robust to any stored host).
- `onError` or missing URL → monogram. No CLS (fixed square), no broken images.
- Large hero/cover images continue to use `next/image` (see `market-header`).

`next.config.js` `images.remotePatterns` allows the layer-2 ingestion source
hosts (google favicon, brandfetch, clearbit, logo.dev, wikimedia) so `next/image`
can optimize them where we do choose to render hosted images directly.

## Why this is efficient
- **No render-time third-party calls** and **no per-request image work**.
- **Tiny payloads**: normalised small WebP, immutable long-cache, CDN-served.
- **Dedup**: one fetch per entity, not per market/card.
- **Graceful**: monogram guarantees a good result at zero cost for the long
  tail of markets that will never have a curated image.

## Status (2026-07)
- ✅ **Layer 1 & 3 shipped** — monogram fallback + `EntityAvatar` everywhere.
- ✅ **Layer 2 shipped (option imagery)** — migration `022_option_entity_media.sql`
  adds `market_options.image_url / entity_kind / entity_ref` (+ market cover
  entity fields). `scripts/backfill_entity_media.py` runs the resolver waterfall
  (person→Wikipedia, company→DuckDuckGo/Google favicon/Wikipedia logo,
  place→flagcdn), normalises to a square 256px WebP, uploads to the public
  `entity-media` Supabase Storage bucket (immutable, content-hashed), and
  persists the CDN URL. First backfill populated **32 of 107** live options
  (all 12 politicians resolvable, the social/finance apps, and 3 country flags);
  abstract options (issues, slogans, "None of the above", numeric ranges,
  counties) stay on the monogram by design. `Outcome.imageUrl` now threads the
  stored URL into the order ticket + option pills.

## Next steps to reach full parity
1. Front-runner avatar on discovery **cards** (thread `image_url` through the
   `leading_option` RPC payload → `CardLeadingOption`).
2. Create-wizard: per-option avatar preview + "Auto-suggest from name/domain" +
   manual URL/upload override; call the resolver at market-create time.
3. Promote the Python backfill to an admin-triggered `app/api/admin/media/backfill`
   route + nightly cron for new markets; add Brandfetch (connected) as the
   highest-confidence company source ahead of favicon services.
