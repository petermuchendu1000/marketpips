-- 022_option_entity_media.sql
-- ------------------------------------------------------------
-- Per-option (candidate/entity) imagery for multiple_choice markets — the
-- company logos / people photos Kalshi & Polymarket render on every option.
--
-- Additive + reversible. Rendering never depends on these being populated: a
-- NULL image_url falls back to the deterministic monogram (EntityAvatar), so
-- there are no blank/broken tiles and no data backfill is required to ship.
--
-- Strategy (see docs/design/ENTITY-IMAGERY.md + POLYMARKET-KALSHI-PARITY.md):
-- resolve once → normalise → store to Supabase Storage → persist the CDN URL
-- here. `entity_kind`/`entity_ref` let the ingestion job dedupe by entity and
-- pick the right resolver (person → Wikipedia, company → Brandfetch, …).

ALTER TABLE public.market_options
  ADD COLUMN IF NOT EXISTS image_url   TEXT,
  ADD COLUMN IF NOT EXISTS entity_kind TEXT,
  ADD COLUMN IF NOT EXISTS entity_ref  TEXT;

-- Constrain entity_kind to the resolver set (NULL allowed = unclassified).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'market_options_entity_kind_chk'
  ) THEN
    ALTER TABLE public.market_options
      ADD CONSTRAINT market_options_entity_kind_chk
      CHECK (entity_kind IS NULL OR entity_kind IN
        ('person','company','crypto','place','team','other'));
  END IF;
END $$;

-- Cover-image entity metadata on the market itself (mirrors the option fields),
-- so a binary market's header avatar can also be resolved by the same pipeline.
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS cover_entity_kind TEXT,
  ADD COLUMN IF NOT EXISTS cover_entity_ref  TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'markets_cover_entity_kind_chk'
  ) THEN
    ALTER TABLE public.markets
      ADD CONSTRAINT markets_cover_entity_kind_chk
      CHECK (cover_entity_kind IS NULL OR cover_entity_kind IN
        ('person','company','crypto','place','team','other'));
  END IF;
END $$;

-- Dedup/backfill helper: find options sharing an entity so the resolver fetches
-- each real-world entity exactly once.
CREATE INDEX IF NOT EXISTS market_options_entity_idx
  ON public.market_options(entity_kind, entity_ref)
  WHERE entity_ref IS NOT NULL;

COMMENT ON COLUMN public.market_options.image_url   IS 'Stored CDN image (Supabase Storage). NULL → monogram fallback.';
COMMENT ON COLUMN public.market_options.entity_kind IS 'Resolver hint: person|company|crypto|place|team|other.';
COMMENT ON COLUMN public.market_options.entity_ref  IS 'Entity key: domain (company) | wiki title (person) | symbol (crypto).';
