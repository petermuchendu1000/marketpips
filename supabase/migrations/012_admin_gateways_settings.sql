-- ============================================================
-- MarketPips - Migration 012: Admin gateways & settings (Phase D) ⭐
-- ============================================================
-- Depends on 008 (roles), 009 (RBAC: has_capability / is_superadmin /
-- audit policies), 001 (pgcrypto, payment_provider / currency_code enums,
-- exchange_rates, audit_log, profiles).
--
-- Closes the headline gap in docs/08-ADMIN.md §4.7: payment gateway
-- credentials were env-only, requiring a redeploy for every paybill / key /
-- callback change. This migration moves gateway configuration into a
-- DB-backed, ENCRYPTED, per-provider & per-country model editable from the UI,
-- plus a typed platform_settings store and FX management.
--
-- Security model
--   * Non-secret config (shortcode/paybill, base_url, callbacks, limits) lives
--     in payment_gateways.config (JSONB) and is readable by `gateways:read`.
--   * Secret material (consumer_secret, passkey, security_credential, PINs,
--     API keys) is stored ENCRYPTED (pgcrypto pgp_sym_encrypt) in a dedicated
--     gateway_secrets table that has RLS enabled and NO select policy — it is
--     never selectable by anon/authenticated sessions. Only the service role
--     (which bypasses RLS) or the superadmin-only get-secret RPC can decrypt.
--   * All mutations go through SECURITY DEFINER RPCs that (1) self-check the
--     capability (defence in depth over route/page guards + RLS), and
--     (2) write an audit_log row — secret VALUES are never logged.
--   * `gateways:secrets` (set/rotate/read secrets) is superadmin-only
--     (god-mode short-circuit in has_capability); `gateways:write`
--     (admin) edits non-secret fields only.
--
-- Encryption key: read from the GUC `app.gateway_encryption_key`
--   (set in production via `ALTER DATABASE <db> SET app.gateway_encryption_key
--   = '<64+ char random>'`). Falls back to a dev constant so migrations and
--   local dev work; production MUST set the GUC. The key lives outside the DB
--   dump surface (a GUC, not a table), consistent with §7.3.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Encryption key accessor
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gateway_enc_key()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.gateway_encryption_key', true), ''),
    'marketpips-dev-gateway-key-change-me-in-production'
  );
$$;
COMMENT ON FUNCTION public._gateway_enc_key() IS
  'Symmetric key for gateway secret encryption. Set app.gateway_encryption_key GUC in production.';

-- ------------------------------------------------------------
-- 1. payment_gateways — non-secret, per-provider/country/env config
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider      payment_provider NOT NULL,
  country_code  CHAR(2),                          -- NULL = global default
  currency      currency_code,
  label         TEXT NOT NULL,
  environment   TEXT NOT NULL DEFAULT 'sandbox'
                  CHECK (environment IN ('sandbox', 'production')),
  is_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  priority      INT NOT NULL DEFAULT 100,         -- failover ordering (asc)
  config        JSONB NOT NULL DEFAULT '{}',      -- non-secret fields only
  secret_ref    JSONB NOT NULL DEFAULT '{}',      -- metadata: {key: {last4, updated_at}}
  min_amount    NUMERIC(20,6),
  max_amount    NUMERIC(20,6),
  created_by    UUID REFERENCES public.profiles(id),
  updated_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, country_code, environment)
);

CREATE INDEX IF NOT EXISTS idx_payment_gateways_lookup
  ON public.payment_gateways (provider, country_code, environment, is_enabled, priority);

-- ------------------------------------------------------------
-- 2. gateway_secrets — ENCRYPTED secret store (never selectable via RLS)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gateway_secrets (
  gateway_id  UUID NOT NULL REFERENCES public.payment_gateways(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,                      -- e.g. 'consumer_secret', 'passkey'
  ciphertext  BYTEA NOT NULL,                     -- pgp_sym_encrypt(value, key)
  last4       TEXT,                               -- masked hint for the UI
  updated_by  UUID REFERENCES public.profiles(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gateway_id, key)
);

-- ------------------------------------------------------------
-- 3. gateway_health — connection-test results
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gateway_health (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gateway_id  UUID REFERENCES public.payment_gateways(id) ON DELETE CASCADE,
  ok          BOOLEAN NOT NULL,
  latency_ms  INT,
  detail      TEXT,
  checked_by  UUID REFERENCES public.profiles(id),
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gateway_health_gateway
  ON public.gateway_health (gateway_id, checked_at DESC);

-- ------------------------------------------------------------
-- 4. platform_settings — typed key/value config (fees/limits/flags/branding)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,     -- readable by non-staff app code
  updated_by  UUID REFERENCES public.profiles(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 5. RLS
-- ------------------------------------------------------------
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateway_secrets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateway_health   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- payment_gateways: readable by gateways:read; writes only via RPC/service role.
DROP POLICY IF EXISTS "Gateways readable by capability" ON public.payment_gateways;
CREATE POLICY "Gateways readable by capability" ON public.payment_gateways
  FOR SELECT USING (public.has_capability('gateways:read'));

-- gateway_secrets: NO select/insert/update/delete policy on purpose.
-- Only the service role (bypasses RLS) and SECURITY DEFINER RPCs touch it.

-- gateway_health: readable by gateways:read.
DROP POLICY IF EXISTS "Gateway health readable by capability" ON public.gateway_health;
CREATE POLICY "Gateway health readable by capability" ON public.gateway_health
  FOR SELECT USING (public.has_capability('gateways:read'));

-- platform_settings: public rows readable by anyone; the rest by settings:write.
DROP POLICY IF EXISTS "Settings readable" ON public.platform_settings;
CREATE POLICY "Settings readable" ON public.platform_settings
  FOR SELECT USING (is_public OR public.has_capability('settings:write'));

-- ------------------------------------------------------------
-- 6. Gateway RPCs (SECURITY DEFINER, capability-checked, audited)
-- ------------------------------------------------------------

-- 6a. Upsert non-secret gateway config. gateways:write.
CREATE OR REPLACE FUNCTION public.admin_upsert_gateway(
  p_id           UUID,
  p_provider     payment_provider,
  p_country_code TEXT,
  p_currency     currency_code,
  p_label        TEXT,
  p_environment  TEXT,
  p_priority     INT,
  p_config       JSONB,
  p_min_amount   NUMERIC,
  p_max_amount   NUMERIC
)
RETURNS public.payment_gateways
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.payment_gateways%ROWTYPE;
  v_row public.payment_gateways%ROWTYPE;
  v_cc  CHAR(2);
BEGIN
  IF NOT public.has_capability('gateways:write') THEN
    RAISE EXCEPTION 'Insufficient permissions (gateways:write required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_label IS NULL OR length(trim(p_label)) < 1 THEN
    RAISE EXCEPTION 'A gateway label is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_environment NOT IN ('sandbox', 'production') THEN
    RAISE EXCEPTION 'environment must be sandbox or production' USING ERRCODE = 'check_violation';
  END IF;

  v_cc := NULLIF(upper(trim(coalesce(p_country_code, ''))), '');

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.payment_gateways WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gateway not found' USING ERRCODE = 'no_data_found'; END IF;

    UPDATE public.payment_gateways
       SET provider     = p_provider,
           country_code = v_cc,
           currency     = p_currency,
           label        = p_label,
           environment  = p_environment,
           priority     = COALESCE(p_priority, priority),
           config       = COALESCE(p_config, '{}'::jsonb),
           min_amount   = p_min_amount,
           max_amount   = p_max_amount,
           updated_by   = auth.uid(),
           updated_at   = NOW()
     WHERE id = p_id
     RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.payment_gateways
      (provider, country_code, currency, label, environment, priority,
       config, min_amount, max_amount, created_by, updated_by)
    VALUES
      (p_provider, v_cc, p_currency, p_label, p_environment, COALESCE(p_priority, 100),
       COALESCE(p_config, '{}'::jsonb), p_min_amount, p_max_amount, auth.uid(), auth.uid())
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(),
    CASE WHEN p_id IS NULL THEN 'gateway.create' ELSE 'gateway.update' END,
    'payment_gateway', v_row.id,
    CASE WHEN p_id IS NULL THEN NULL ELSE jsonb_build_object(
      'label', v_old.label, 'environment', v_old.environment,
      'priority', v_old.priority, 'config', v_old.config,
      'min_amount', v_old.min_amount, 'max_amount', v_old.max_amount) END,
    jsonb_build_object(
      'provider', v_row.provider, 'country_code', v_row.country_code,
      'currency', v_row.currency, 'label', v_row.label,
      'environment', v_row.environment, 'priority', v_row.priority,
      'config', v_row.config, 'min_amount', v_row.min_amount, 'max_amount', v_row.max_amount)
  );

  RETURN v_row;
END;
$$;

-- 6b. Enable / disable a gateway. gateways:write.
CREATE OR REPLACE FUNCTION public.admin_set_gateway_enabled(
  p_id      UUID,
  p_enabled BOOLEAN
)
RETURNS public.payment_gateways
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.payment_gateways%ROWTYPE;
  v_row public.payment_gateways%ROWTYPE;
BEGIN
  IF NOT public.has_capability('gateways:write') THEN
    RAISE EXCEPTION 'Insufficient permissions (gateways:write required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_old FROM public.payment_gateways WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gateway not found' USING ERRCODE = 'no_data_found'; END IF;

  UPDATE public.payment_gateways
     SET is_enabled = p_enabled, updated_by = auth.uid(), updated_at = NOW()
   WHERE id = p_id
   RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'gateway.set_enabled', 'payment_gateway', p_id,
          jsonb_build_object('is_enabled', v_old.is_enabled),
          jsonb_build_object('is_enabled', p_enabled));
  RETURN v_row;
END;
$$;

-- 6c. Delete a gateway (cascades secrets/health). gateways:write.
CREATE OR REPLACE FUNCTION public.admin_delete_gateway(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.payment_gateways%ROWTYPE;
BEGIN
  IF NOT public.has_capability('gateways:write') THEN
    RAISE EXCEPTION 'Insufficient permissions (gateways:write required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_old FROM public.payment_gateways WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gateway not found' USING ERRCODE = 'no_data_found'; END IF;

  DELETE FROM public.payment_gateways WHERE id = p_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'gateway.delete', 'payment_gateway', p_id,
          jsonb_build_object('provider', v_old.provider, 'label', v_old.label,
                             'environment', v_old.environment), NULL);
  RETURN jsonb_build_object('success', TRUE, 'id', p_id);
END;
$$;

-- 6d. Set / rotate an encrypted secret. gateways:secrets (superadmin-only).
CREATE OR REPLACE FUNCTION public.admin_rotate_gateway_secret(
  p_gateway_id UUID,
  p_key        TEXT,
  p_value      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last4 TEXT;
BEGIN
  IF NOT public.has_capability('gateways:secrets') THEN
    RAISE EXCEPTION 'Insufficient permissions (gateways:secrets required — superadmin only)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_value IS NULL OR length(p_value) = 0 THEN
    RAISE EXCEPTION 'A non-empty secret value is required' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.payment_gateways WHERE id = p_gateway_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gateway not found' USING ERRCODE = 'no_data_found'; END IF;

  v_last4 := right(p_value, 4);

  INSERT INTO public.gateway_secrets (gateway_id, key, ciphertext, last4, updated_by, updated_at)
  VALUES (p_gateway_id, p_key,
          pgp_sym_encrypt(p_value, public._gateway_enc_key()), v_last4, auth.uid(), NOW())
  ON CONFLICT (gateway_id, key) DO UPDATE
    SET ciphertext = EXCLUDED.ciphertext,
        last4      = EXCLUDED.last4,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW();

  -- Track which secrets are set (metadata only — never the value) on the parent.
  UPDATE public.payment_gateways
     SET secret_ref = COALESCE(secret_ref, '{}'::jsonb) || jsonb_build_object(
           p_key, jsonb_build_object('last4', v_last4, 'updated_at', NOW())),
         updated_at = NOW()
   WHERE id = p_gateway_id;

  -- Audit the ROTATION event, never the secret material.
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'gateway.rotate_secret', 'payment_gateway', p_gateway_id,
          NULL, jsonb_build_object('key', p_key, 'last4', v_last4));

  RETURN jsonb_build_object('success', TRUE, 'key', p_key, 'last4', v_last4);
END;
$$;

-- 6e. Clear a secret. gateways:secrets.
CREATE OR REPLACE FUNCTION public.admin_clear_gateway_secret(
  p_gateway_id UUID,
  p_key        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_capability('gateways:secrets') THEN
    RAISE EXCEPTION 'Insufficient permissions (gateways:secrets required — superadmin only)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM public.gateway_secrets WHERE gateway_id = p_gateway_id AND key = p_key;
  UPDATE public.payment_gateways
     SET secret_ref = (COALESCE(secret_ref, '{}'::jsonb) - p_key), updated_at = NOW()
   WHERE id = p_gateway_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'gateway.clear_secret', 'payment_gateway', p_gateway_id,
          jsonb_build_object('key', p_key), NULL);
  RETURN jsonb_build_object('success', TRUE, 'key', p_key);
END;
$$;

-- 6f. Decrypt a secret. Superadmin (gateways:secrets) OR service role only.
-- Used server-side by the config resolver at payment-call time; NEVER exposed
-- to the browser.
CREATE OR REPLACE FUNCTION public.admin_get_gateway_secret(
  p_gateway_id UUID,
  p_key        TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cipher BYTEA;
BEGIN
  IF NOT (public.has_capability('gateways:secrets') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Insufficient permissions to read gateway secrets'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT ciphertext INTO v_cipher
    FROM public.gateway_secrets WHERE gateway_id = p_gateway_id AND key = p_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(v_cipher, public._gateway_enc_key());
END;
$$;

-- 6g. Record a connection-test result. gateways:read.
CREATE OR REPLACE FUNCTION public.admin_record_gateway_health(
  p_gateway_id UUID,
  p_ok         BOOLEAN,
  p_latency_ms INT,
  p_detail     TEXT
)
RETURNS public.gateway_health
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.gateway_health%ROWTYPE;
BEGIN
  IF NOT public.has_capability('gateways:read') THEN
    RAISE EXCEPTION 'Insufficient permissions (gateways:read required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.gateway_health (gateway_id, ok, latency_ms, detail, checked_by)
  VALUES (p_gateway_id, p_ok, p_latency_ms, p_detail, auth.uid())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ------------------------------------------------------------
-- 7. Settings & FX RPCs
-- ------------------------------------------------------------

-- 7a. Upsert a platform setting. settings:write.
CREATE OR REPLACE FUNCTION public.admin_upsert_setting(
  p_key       TEXT,
  p_value     JSONB,
  p_is_public BOOLEAN DEFAULT FALSE
)
RETURNS public.platform_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.platform_settings%ROWTYPE;
  v_row public.platform_settings%ROWTYPE;
BEGIN
  IF NOT public.has_capability('settings:write') THEN
    RAISE EXCEPTION 'Insufficient permissions (settings:write required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_key IS NULL OR length(trim(p_key)) < 1 THEN
    RAISE EXCEPTION 'A setting key is required' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_old FROM public.platform_settings WHERE key = p_key;

  INSERT INTO public.platform_settings (key, value, is_public, updated_by, updated_at)
  VALUES (p_key, p_value, COALESCE(p_is_public, FALSE), auth.uid(), NOW())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        is_public = EXCLUDED.is_public,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'setting.upsert', 'platform_setting', NULL,
          CASE WHEN v_old.key IS NULL THEN NULL ELSE jsonb_build_object('key', v_old.key, 'value', v_old.value) END,
          jsonb_build_object('key', p_key, 'value', p_value, 'is_public', COALESCE(p_is_public, FALSE)));
  RETURN v_row;
END;
$$;

-- 7b. Upsert an exchange rate. settings:write.
CREATE OR REPLACE FUNCTION public.admin_upsert_exchange_rate(
  p_from   currency_code,
  p_to     currency_code,
  p_rate   NUMERIC,
  p_source TEXT DEFAULT 'manual'
)
RETURNS public.exchange_rates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.exchange_rates%ROWTYPE;
  v_row public.exchange_rates%ROWTYPE;
BEGIN
  IF NOT public.has_capability('settings:write') THEN
    RAISE EXCEPTION 'Insufficient permissions (settings:write required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_rate IS NULL OR p_rate <= 0 THEN
    RAISE EXCEPTION 'Rate must be a positive number' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_old FROM public.exchange_rates
    WHERE from_currency = p_from AND to_currency = p_to;

  INSERT INTO public.exchange_rates (from_currency, to_currency, rate, source, fetched_at)
  VALUES (p_from, p_to, p_rate, COALESCE(p_source, 'manual'), NOW())
  ON CONFLICT (from_currency, to_currency) DO UPDATE
    SET rate = EXCLUDED.rate, source = EXCLUDED.source, fetched_at = NOW()
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'fx.upsert_rate', 'exchange_rate', NULL,
          CASE WHEN v_old.id IS NULL THEN NULL ELSE jsonb_build_object(
            'from', v_old.from_currency, 'to', v_old.to_currency, 'rate', v_old.rate) END,
          jsonb_build_object('from', p_from, 'to', p_to, 'rate', p_rate, 'source', COALESCE(p_source, 'manual')));
  RETURN v_row;
END;
$$;

-- ------------------------------------------------------------
-- 8. Grants (RPCs are invoked from the operator's user session)
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.admin_upsert_gateway(UUID, payment_provider, TEXT, currency_code, TEXT, TEXT, INT, JSONB, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_gateway_enabled(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_gateway(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rotate_gateway_secret(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_gateway_secret(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_gateway_secret(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_gateway_health(UUID, BOOLEAN, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_setting(TEXT, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_exchange_rate(currency_code, currency_code, NUMERIC, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 9. Seed default platform settings (idempotent)
-- ------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, is_public) VALUES
  ('fees.platform_pct',        '2.0',   FALSE),
  ('fees.creator_reward_pct',  '0.25',  FALSE),
  ('fees.marketer_commission_pct', '1.0', FALSE),
  ('fees.min_bet_usd',         '0.5',   TRUE),
  ('limits.deposit_min_usd',   '1',     TRUE),
  ('limits.deposit_max_usd',   '5000',  TRUE),
  ('limits.withdraw_min_usd',  '2',     TRUE),
  ('limits.withdraw_max_usd',  '3000',  TRUE),
  ('limits.daily_withdraw_max_usd', '5000', FALSE),
  ('limits.max_open_markets_per_creator', '10', FALSE),
  ('flags.market_creation_enabled', 'true',  TRUE),
  ('flags.withdrawals_enabled',     'true',  TRUE),
  ('flags.deposits_enabled',        'true',  TRUE),
  ('flags.leaderboard_enabled',     'true',  TRUE),
  ('maintenance.enabled',           'false', TRUE),
  ('maintenance.message',           '""',    TRUE),
  ('branding.support_email',        '"support@marketpips.co.ke"', TRUE),
  ('branding.terms_url',            '"/legal/terms"',   TRUE),
  ('branding.privacy_url',          '"/legal/privacy"', TRUE)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- End migration 012
-- ============================================================
