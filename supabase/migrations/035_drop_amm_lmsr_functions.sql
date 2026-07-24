-- 035_drop_amm_lmsr_functions.sql
--
-- Retire the legacy AMM/LMSR engine at the database layer. The platform is now
-- CLOB-only: every market is pricing_engine='clob', the order ticket + API
-- (#22, #23) route exclusively through clob_place_order, and migration 034 had
-- already guarded these RPCs against order-book markets. With no caller left
-- (verified: no other function or trigger references them), we drop them.
--
-- Idempotent (IF EXISTS) and dependency-checked. This is the "contract" half of
-- the expand/contract retirement of the AMM path.

-- migration:allow-destructive  (dropping retired AMM/LMSR routines; no callers)
DROP FUNCTION IF EXISTS public.place_bet(uuid, uuid, order_side, numeric, currency_code, order_type, numeric, text);
-- migration:allow-destructive
DROP FUNCTION IF EXISTS public.place_bet_option(uuid, uuid, uuid, numeric, currency_code, text);
-- migration:allow-destructive
DROP FUNCTION IF EXISTS public.place_bet_option_binary(uuid, uuid, uuid, order_side, numeric, currency_code, text);
-- migration:allow-destructive
DROP FUNCTION IF EXISTS public.lmsr_cost_to_buy(numeric, numeric, numeric, numeric, numeric);
-- migration:allow-destructive
DROP FUNCTION IF EXISTS public.lmsr_price(numeric, numeric, numeric);
-- migration:allow-destructive
DROP FUNCTION IF EXISTS public.lmsr_price_multi(numeric[], numeric);
