-- ============================================================
-- 019_kyc_address.sql — Address capture for Enhanced KYC tier
-- ------------------------------------------------------------
-- The Enhanced verification level (per the KYC flow: Email → Phone → ID →
-- Selfie → Address) requires a residential address. These columns hang off the
-- existing kyc_documents submission so the whole identity packet lives in one
-- reviewable row. All nullable + additive, so the change is backward compatible
-- (existing inserts and the current submit path keep working unchanged).
-- ============================================================

ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS address_line1       TEXT,
  ADD COLUMN IF NOT EXISTS address_city        TEXT,
  ADD COLUMN IF NOT EXISTS address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS address_country     CHAR(2);

COMMENT ON COLUMN public.kyc_documents.address_line1 IS 'Enhanced-tier residential address (street line).';
COMMENT ON COLUMN public.kyc_documents.address_city IS 'Enhanced-tier residential city/town.';
COMMENT ON COLUMN public.kyc_documents.address_postal_code IS 'Enhanced-tier postal / ZIP code (optional in EA markets).';
COMMENT ON COLUMN public.kyc_documents.address_country IS 'Enhanced-tier address country (ISO 3166-1 alpha-2).';
