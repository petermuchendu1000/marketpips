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

## Next steps to reach full parity
1. `market_options.image_url` migration (additive).
2. `lib/media/ingest.ts` + a cron/backfill route: run the waterfall, `sharp`
   normalise, upload to Storage, persist URLs (Brandfetch first for companies).
3. Wire the create-wizard to auto-suggest a logo from a typed company domain.
