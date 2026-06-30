-- ============================================================
-- MarketPips - Migration 003: fix signup metadata mapping
-- ============================================================
-- The web register form sends user metadata keys:
--   display_name, country_code, preferred_currency, referral_code_used
-- The original handle_new_user() read `full_name` / `referral_code` and
-- ignored country/currency, so the chosen values were silently dropped.
-- This migration aligns the trigger with the app, sets country + currency
-- safely, ensures a wallet exists for the preferred currency, and accepts
-- either referral key. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $function$
DECLARE
  meta              JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_display_name    TEXT;
  v_country         TEXT;
  v_currency_pref   currency_code := 'KES';
  v_referral_code   TEXT;
  v_referrer_id     UUID;
  default_currencies currency_code[] := ARRAY['KES','UGX','TZS','RWF']::currency_code[];
  wallet_currencies  currency_code[];
  v_currency        currency_code;
BEGIN
  -- Display name: explicit display_name, else full_name, else email
  v_display_name := COALESCE(
    NULLIF(meta->>'display_name', ''),
    NULLIF(meta->>'full_name', ''),
    NEW.email
  );

  -- Country: 2-letter ISO, uppercased, default KE
  v_country := UPPER(COALESCE(NULLIF(meta->>'country_code', ''), 'KE'));
  IF length(v_country) <> 2 THEN
    v_country := 'KE';
  END IF;

  -- Preferred currency: validate against enum, fallback KES
  BEGIN
    v_currency_pref := (NULLIF(meta->>'preferred_currency', ''))::currency_code;
  EXCEPTION WHEN others THEN
    v_currency_pref := 'KES';
  END;
  IF v_currency_pref IS NULL THEN
    v_currency_pref := 'KES';
  END IF;

  -- Referral code: accept either metadata key
  v_referral_code := COALESCE(
    NULLIF(meta->>'referral_code_used', ''),
    NULLIF(meta->>'referral_code', '')
  );
  IF v_referral_code IS NOT NULL THEN
    SELECT id INTO v_referrer_id FROM public.profiles WHERE referral_code = v_referral_code;
  END IF;

  -- Create profile with country + preferred currency
  INSERT INTO public.profiles (id, display_name, avatar_url, country_code, preferred_currency, referred_by)
  VALUES (
    NEW.id,
    v_display_name,
    meta->>'avatar_url',
    v_country,
    v_currency_pref,
    v_referrer_id
  );

  -- Ensure the preferred currency has a wallet (union with defaults)
  wallet_currencies := default_currencies;
  IF NOT (v_currency_pref = ANY(wallet_currencies)) THEN
    wallet_currencies := wallet_currencies || v_currency_pref;
  END IF;

  FOREACH v_currency IN ARRAY wallet_currencies LOOP
    INSERT INTO public.wallets (user_id, currency)
    VALUES (NEW.id, v_currency)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Referral bookkeeping
  IF v_referrer_id IS NOT NULL THEN
    UPDATE public.profiles SET referral_count = referral_count + 1 WHERE id = v_referrer_id;
    INSERT INTO public.referrals (referrer_id, referred_id, referral_code)
    VALUES (v_referrer_id, NEW.id, v_referral_code);
  END IF;

  RETURN NEW;
END;
$function$;
