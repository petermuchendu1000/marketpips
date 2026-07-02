-- ============================================================
-- MarketPips - Migration 013: Admin creators & marketers (Phase E)
-- ============================================================
-- Depends on 001 (profiles, wallets, transactions, markets, referrals,
-- transaction_type enum), 008 (roles), 009 (RBAC: has_capability /
-- is_superadmin / audit_log), 011/012 (admin RPC + audit conventions).
--
-- Implements docs/08-ADMIN.md 4.3 (Creators) + 4.4 (Marketers) + 6.4
-- (data model): creator tiers & consoles, marketer consoles, commission
-- plans, promo campaigns, and the payout-run engine.
--
-- KEY DESIGN DECISION (money-flow honesty)
--   Creator rewards are ALREADY credited to the creator's USD wallet the
--   instant a bet is placed (see migration 004 place_bet + `creator_reward`
--   transactions). Re-paying them in a payout run would double-pay. Therefore:
--     * CREATOR payout runs are STATEMENTS (settlement = 'statement_only').
--       Compute aggregates the already-credited `creator_reward` transactions
--       in the period; disburse only reconciles/marks them (no money moves).
--     * MARKETER commissions genuinely ACCRUE (nothing is credited at signup /
--       bet time). Compute derives an amount from the marketer's commission
--       plan + attribution; disburse actually credits the marketer's USD wallet
--       and writes a `referral_bonus` transaction (settlement = 'credited').
--   We deliberately REUSE existing transaction_type values (`creator_reward`,
--   `referral_bonus`) rather than ALTER TYPE, keeping money-flow reporting
--   consistent and this migration transaction-safe.
--
-- Security model (mirrors 011/012)
--   * Every mutation goes through a SECURITY DEFINER RPC that (1) self-checks
--     the capability via has_capability() (defence in depth over route/page
--     guards + RLS), and (2) writes an audit_log row.
--   * RLS: SELECT gated by has_capability() (+ self-read for own profile /
--     items). No INSERT/UPDATE/DELETE policies -> writes are RPC/service-role
--     only, except a narrow self-apply INSERT on role_applications.
-- ============================================================

-- ------------------------------------------------------------
-- 1. creator_tiers - configurable reward tiers & privileges
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_tiers (
  key             TEXT PRIMARY KEY,               -- 'bronze' | 'silver' | 'gold' | custom
  label           TEXT NOT NULL,
  reward_pct      NUMERIC(6,4) NOT NULL DEFAULT 0.0025,  -- fraction of volume (0.25%)
  max_open_markets INT NOT NULL DEFAULT 5,         -- concurrent open-market cap
  auto_publish    BOOLEAN NOT NULL DEFAULT FALSE,  -- skip market review queue
  sort_order      INT NOT NULL DEFAULT 100,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. creator_profiles - one row per approved creator (spec 6.4 + additions)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_profiles (
  user_id          UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier             TEXT NOT NULL DEFAULT 'bronze' REFERENCES public.creator_tiers(key),
  reward_pct       NUMERIC(6,4),                   -- NULL = inherit tier
  auto_publish     BOOLEAN NOT NULL DEFAULT FALSE,
  max_open_markets INT,                            -- NULL = inherit tier
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','revoked')),
  suspended_reason TEXT,
  application_id   UUID,
  approved_by      UUID REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 3. commission_plans - reusable marketer commission templates
-- ------------------------------------------------------------
-- plan JSONB shape:
--   { "model": "cpa|revshare|hybrid",
--     "cpa_usd": 2.0,          -- paid per activated referred user
--     "revshare_pct": 10.0,    -- percent of platform fees from referred users
--     "hold_days": 7 }         -- eligibility hold after period end
CREATE TABLE IF NOT EXISTS public.commission_plans (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  plan        JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 4. marketer_profiles - one row per approved marketer (spec 6.4 + additions)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketer_profiles (
  user_id         UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tracking_code   TEXT UNIQUE NOT NULL,
  plan_key        TEXT REFERENCES public.commission_plans(key),  -- NULL = inline only
  commission_plan JSONB NOT NULL DEFAULT '{}',   -- inline overrides / snapshot
  hold_days       INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','revoked')),
  suspended_reason TEXT,
  application_id  UUID,
  approved_by     UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 5. role_applications - user -> creator|marketer application queue
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_applications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('creator','marketer')),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  message      TEXT,
  review_notes TEXT,
  reviewed_by  UUID REFERENCES public.profiles(id),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- one open application per user per kind
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_app_open
  ON public.role_applications (user_id, kind) WHERE status = 'pending';

-- ------------------------------------------------------------
-- 6. campaigns - marketer promo codes (deposit bonus / fee discount)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code             TEXT UNIQUE NOT NULL,
  label            TEXT NOT NULL,
  marketer_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('deposit_bonus','fee_discount')),
  value_pct        NUMERIC(6,3) NOT NULL DEFAULT 0,   -- bonus/discount percent
  max_value_usd    NUMERIC(20,6),                     -- per-redemption cap (NULL = uncapped)
  budget_usd       NUMERIC(20,6),                     -- total spend cap (NULL = uncapped)
  spent_usd        NUMERIC(20,6) NOT NULL DEFAULT 0,
  max_redemptions  INT,                               -- total cap (NULL = unlimited)
  redemption_count INT NOT NULL DEFAULT 0,
  per_user_limit   INT NOT NULL DEFAULT 1,
  starts_at        TIMESTAMPTZ,
  ends_at          TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','paused','ended')),
  created_by       UUID REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_marketer ON public.campaigns (marketer_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status   ON public.campaigns (status);

-- ------------------------------------------------------------
-- 7. campaign_redemptions - individual redemption ledger
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_redemptions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id  UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_usd   NUMERIC(20,6) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaign_redemptions_campaign
  ON public.campaign_redemptions (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_redemptions_user
  ON public.campaign_redemptions (user_id);

-- ------------------------------------------------------------
-- 8. payout_runs (spec 6.4 + richer state machine)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_runs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind         TEXT NOT NULL CHECK (kind IN ('creator','marketer')),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','computed','approved','disbursed','cancelled','failed')),
  total_usd    NUMERIC(20,6) NOT NULL DEFAULT 0,
  notes        TEXT,
  created_by   UUID REFERENCES public.profiles(id),
  computed_at  TIMESTAMPTZ,
  approved_by  UUID REFERENCES public.profiles(id),
  approved_at  TIMESTAMPTZ,
  disbursed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_payout_runs_kind_status
  ON public.payout_runs (kind, status, created_at DESC);

-- ------------------------------------------------------------
-- 9. payout_items (spec 6.4 + settlement mode & lifecycle)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id      UUID NOT NULL REFERENCES public.payout_runs(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id),
  amount_usd  NUMERIC(20,6) NOT NULL,
  settlement  TEXT NOT NULL DEFAULT 'credited'
                CHECK (settlement IN ('credited','statement_only')),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','held','failed','clawed_back')),
  eligible_at TIMESTAMPTZ,             -- hold gate (NULL = immediately eligible)
  tx_count    INT NOT NULL DEFAULT 0,  -- source transactions aggregated (creator stmts)
  transaction_id UUID REFERENCES public.transactions(id),  -- credit txn (marketer)
  detail      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payout_items_run  ON public.payout_items (run_id);
CREATE INDEX IF NOT EXISTS idx_payout_items_user ON public.payout_items (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_item_run_user
  ON public.payout_items (run_id, user_id);

-- ------------------------------------------------------------
-- 10. Run total recompute trigger (single source of truth for total_usd)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._recompute_payout_run_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_run UUID := COALESCE(NEW.run_id, OLD.run_id);
BEGIN
  UPDATE public.payout_runs r
     SET total_usd = COALESCE((
       SELECT SUM(amount_usd) FROM public.payout_items
        WHERE run_id = v_run AND status NOT IN ('failed','clawed_back')
     ), 0)
   WHERE r.id = v_run;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_payout_total ON public.payout_items;
CREATE TRIGGER trg_recompute_payout_total
  AFTER INSERT OR UPDATE OR DELETE ON public.payout_items
  FOR EACH ROW EXECUTE FUNCTION public._recompute_payout_run_total();

-- ------------------------------------------------------------
-- 11. Commission math helper (IMMUTABLE, mirrored by TS lib/admin/marketers.ts)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.marketer_commission_usd(
  p_plan          JSONB,
  p_activations   INT,
  p_revenue_base  NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND(
    CASE WHEN COALESCE(p_plan->>'model','hybrid') IN ('cpa','hybrid')
         THEN COALESCE((p_plan->>'cpa_usd')::numeric, 0) * GREATEST(COALESCE(p_activations,0),0)
         ELSE 0 END
    +
    CASE WHEN COALESCE(p_plan->>'model','hybrid') IN ('revshare','hybrid')
         THEN GREATEST(COALESCE(p_revenue_base,0),0)
              * COALESCE((p_plan->>'revshare_pct')::numeric, 0) / 100.0
         ELSE 0 END
  , 6);
$$;
COMMENT ON FUNCTION public.marketer_commission_usd(JSONB, INT, NUMERIC) IS
  'Pure commission math: cpa_usd*activations + revenue_base*revshare_pct/100, model-gated. Mirrored in TypeScript.';

-- ------------------------------------------------------------
-- 12. RLS
-- ------------------------------------------------------------
ALTER TABLE public.creator_tiers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketer_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_applications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_items         ENABLE ROW LEVEL SECURITY;

-- creator_tiers: public catalog (affects creator UX everywhere).
DROP POLICY IF EXISTS "Creator tiers readable" ON public.creator_tiers;
CREATE POLICY "Creator tiers readable" ON public.creator_tiers
  FOR SELECT USING (TRUE);

-- creator_profiles: managers + self.
DROP POLICY IF EXISTS "Creator profiles readable" ON public.creator_profiles;
CREATE POLICY "Creator profiles readable" ON public.creator_profiles
  FOR SELECT USING (public.has_capability('creators:manage') OR user_id = auth.uid());

-- commission_plans: managers only (commercial terms).
DROP POLICY IF EXISTS "Commission plans readable" ON public.commission_plans;
CREATE POLICY "Commission plans readable" ON public.commission_plans
  FOR SELECT USING (public.has_capability('marketers:manage'));

-- marketer_profiles: managers + self.
DROP POLICY IF EXISTS "Marketer profiles readable" ON public.marketer_profiles;
CREATE POLICY "Marketer profiles readable" ON public.marketer_profiles
  FOR SELECT USING (public.has_capability('marketers:manage') OR user_id = auth.uid());

-- role_applications: managers + self read; self may apply (pending only).
DROP POLICY IF EXISTS "Applications readable" ON public.role_applications;
CREATE POLICY "Applications readable" ON public.role_applications
  FOR SELECT USING (
    public.has_capability('creators:manage')
    OR public.has_capability('marketers:manage')
    OR user_id = auth.uid()
  );
DROP POLICY IF EXISTS "Applications self-apply" ON public.role_applications;
CREATE POLICY "Applications self-apply" ON public.role_applications
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND status = 'pending' AND kind IN ('creator','marketer')
  );

-- campaigns: managers see all; active campaigns are publicly discoverable.
DROP POLICY IF EXISTS "Campaigns readable" ON public.campaigns;
CREATE POLICY "Campaigns readable" ON public.campaigns
  FOR SELECT USING (public.has_capability('marketers:manage') OR status = 'active');

-- campaign_redemptions: managers + self.
DROP POLICY IF EXISTS "Campaign redemptions readable" ON public.campaign_redemptions;
CREATE POLICY "Campaign redemptions readable" ON public.campaign_redemptions
  FOR SELECT USING (public.has_capability('marketers:manage') OR user_id = auth.uid());

-- payout_runs: payouts:run only.
DROP POLICY IF EXISTS "Payout runs readable" ON public.payout_runs;
CREATE POLICY "Payout runs readable" ON public.payout_runs
  FOR SELECT USING (public.has_capability('payouts:run'));

-- payout_items: managers + the beneficiary (statements).
DROP POLICY IF EXISTS "Payout items readable" ON public.payout_items;
CREATE POLICY "Payout items readable" ON public.payout_items
  FOR SELECT USING (public.has_capability('payouts:run') OR user_id = auth.uid());

-- ============================================================
-- 13. CREATOR RPCs (capability: creators:manage) - all audited
-- ============================================================

-- Upsert a creator tier (create or edit reward/limits/privileges).
CREATE OR REPLACE FUNCTION public.admin_upsert_creator_tier(
  p_key              TEXT,
  p_label            TEXT,
  p_reward_pct       NUMERIC,
  p_max_open_markets INT,
  p_auto_publish     BOOLEAN,
  p_sort_order       INT,
  p_is_active        BOOLEAN
)
RETURNS public.creator_tiers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.creator_tiers%ROWTYPE;
  v_row public.creator_tiers%ROWTYPE;
BEGIN
  IF NOT public.has_capability('creators:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (creators:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_key IS NULL OR length(trim(p_key)) < 1 THEN
    RAISE EXCEPTION 'A tier key is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_reward_pct IS NULL OR p_reward_pct < 0 OR p_reward_pct > 1 THEN
    RAISE EXCEPTION 'reward_pct must be a fraction between 0 and 1' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_old FROM public.creator_tiers WHERE key = p_key;

  INSERT INTO public.creator_tiers
    (key, label, reward_pct, max_open_markets, auto_publish, sort_order, is_active, updated_at)
  VALUES
    (lower(trim(p_key)), p_label, p_reward_pct, COALESCE(p_max_open_markets, 5),
     COALESCE(p_auto_publish, FALSE), COALESCE(p_sort_order, 100), COALESCE(p_is_active, TRUE), NOW())
  ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    reward_pct = EXCLUDED.reward_pct,
    max_open_markets = EXCLUDED.max_open_markets,
    auto_publish = EXCLUDED.auto_publish,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    updated_at = NOW()
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(),
    CASE WHEN v_old.key IS NULL THEN 'creator_tier.create' ELSE 'creator_tier.update' END,
    'creator_tier', NULL,
    CASE WHEN v_old.key IS NULL THEN NULL ELSE to_jsonb(v_old) END,
    to_jsonb(v_row)
  );
  RETURN v_row;
END;
$$;

-- Approve a user -> creator (promote role, create profile, resolve application).
CREATE OR REPLACE FUNCTION public.admin_approve_creator(
  p_user_id UUID,
  p_tier    TEXT DEFAULT 'bronze',
  p_notes   TEXT DEFAULT NULL
)
RETURNS public.creator_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  user_role;
  v_tier  public.creator_tiers%ROWTYPE;
  v_row   public.creator_profiles%ROWTYPE;
  v_app   UUID;
BEGIN
  IF NOT public.has_capability('creators:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (creators:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE = 'no_data_found'; END IF;

  SELECT * INTO v_tier FROM public.creator_tiers WHERE key = COALESCE(p_tier, 'bronze') AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive tier: %', p_tier USING ERRCODE = 'check_violation'; END IF;

  -- Never demote staff/superadmin; only promote plain users to creator.
  IF v_role = 'user' THEN
    UPDATE public.profiles SET role = 'creator', updated_at = NOW() WHERE id = p_user_id;
  END IF;

  UPDATE public.role_applications
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = NOW(),
         review_notes = COALESCE(p_notes, review_notes)
   WHERE user_id = p_user_id AND kind = 'creator' AND status = 'pending'
   RETURNING id INTO v_app;

  INSERT INTO public.creator_profiles
    (user_id, tier, auto_publish, status, application_id, approved_by, created_at, updated_at)
  VALUES
    (p_user_id, v_tier.key, v_tier.auto_publish, 'active', v_app, auth.uid(), NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    status = 'active',
    suspended_reason = NULL,
    approved_by = auth.uid(),
    updated_at = NOW()
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'creator.approve', 'profile', p_user_id,
          jsonb_build_object('tier', v_tier.key, 'notes', p_notes));
  RETURN v_row;
END;
$$;

-- Update a creator's tier/overrides/privileges.
CREATE OR REPLACE FUNCTION public.admin_update_creator(
  p_user_id          UUID,
  p_tier             TEXT,
  p_reward_pct       NUMERIC,
  p_auto_publish     BOOLEAN,
  p_max_open_markets INT
)
RETURNS public.creator_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.creator_profiles%ROWTYPE;
  v_row public.creator_profiles%ROWTYPE;
BEGIN
  IF NOT public.has_capability('creators:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (creators:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_old FROM public.creator_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Creator profile not found' USING ERRCODE = 'no_data_found'; END IF;

  IF p_tier IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.creator_tiers WHERE key = p_tier) THEN
    RAISE EXCEPTION 'Unknown tier: %', p_tier USING ERRCODE = 'check_violation';
  END IF;
  IF p_reward_pct IS NOT NULL AND (p_reward_pct < 0 OR p_reward_pct > 1) THEN
    RAISE EXCEPTION 'reward_pct must be a fraction between 0 and 1' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.creator_profiles SET
    tier = COALESCE(p_tier, tier),
    reward_pct = p_reward_pct,
    auto_publish = COALESCE(p_auto_publish, auto_publish),
    max_open_markets = p_max_open_markets,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'creator.update', 'profile', p_user_id, to_jsonb(v_old), to_jsonb(v_row));
  RETURN v_row;
END;
$$;

-- Suspend / reactivate / revoke a creator (revoke demotes role back to user).
CREATE OR REPLACE FUNCTION public.admin_set_creator_status(
  p_user_id UUID,
  p_status  TEXT,
  p_reason  TEXT DEFAULT NULL
)
RETURNS public.creator_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.creator_profiles%ROWTYPE;
  v_row public.creator_profiles%ROWTYPE;
BEGIN
  IF NOT public.has_capability('creators:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (creators:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('active','suspended','revoked') THEN
    RAISE EXCEPTION 'status must be active|suspended|revoked' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_old FROM public.creator_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Creator profile not found' USING ERRCODE = 'no_data_found'; END IF;

  UPDATE public.creator_profiles SET
    status = p_status,
    suspended_reason = CASE WHEN p_status = 'active' THEN NULL ELSE p_reason END,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_row;

  -- Revoking privileges demotes a plain creator back to user (never touches staff).
  IF p_status = 'revoked' THEN
    UPDATE public.profiles SET role = 'user', updated_at = NOW()
     WHERE id = p_user_id AND role = 'creator';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'creator.set_status', 'profile', p_user_id,
          jsonb_build_object('status', v_old.status),
          jsonb_build_object('status', p_status, 'reason', p_reason));
  RETURN v_row;
END;
$$;

-- Reject a creator|marketer application (capability depends on kind).
CREATE OR REPLACE FUNCTION public.admin_reject_application(
  p_application_id UUID,
  p_reason         TEXT DEFAULT NULL
)
RETURNS public.role_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.role_applications%ROWTYPE;
  v_row public.role_applications%ROWTYPE;
BEGIN
  SELECT * INTO v_app FROM public.role_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found' USING ERRCODE = 'no_data_found'; END IF;

  IF v_app.kind = 'creator' AND NOT public.has_capability('creators:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (creators:manage required)' USING ERRCODE = 'insufficient_privilege';
  ELSIF v_app.kind = 'marketer' AND NOT public.has_capability('marketers:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (marketers:manage required)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'Application is not pending' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.role_applications SET
    status = 'rejected', reviewed_by = auth.uid(), reviewed_at = NOW(), review_notes = p_reason
  WHERE id = p_application_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'application.reject', 'role_application', p_application_id,
          jsonb_build_object('status', 'pending', 'kind', v_app.kind),
          jsonb_build_object('status', 'rejected', 'reason', p_reason));
  RETURN v_row;
END;
$$;

-- ============================================================
-- 14. MARKETER RPCs (capability: marketers:manage) - all audited
-- ============================================================

-- Generate a short unique tracking code (retries on collision).
CREATE OR REPLACE FUNCTION public._gen_tracking_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_try  INT := 0;
BEGIN
  LOOP
    v_code := 'MP' || upper(encode(gen_random_bytes(4), 'hex'));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.marketer_profiles WHERE tracking_code = v_code);
    v_try := v_try + 1;
    IF v_try > 10 THEN RAISE EXCEPTION 'Could not allocate a unique tracking code'; END IF;
  END LOOP;
  RETURN v_code;
END;
$$;

-- Upsert a reusable commission plan template.
CREATE OR REPLACE FUNCTION public.admin_upsert_commission_plan(
  p_key       TEXT,
  p_label     TEXT,
  p_plan      JSONB,
  p_is_active BOOLEAN
)
RETURNS public.commission_plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.commission_plans%ROWTYPE;
  v_row public.commission_plans%ROWTYPE;
  v_model TEXT;
BEGIN
  IF NOT public.has_capability('marketers:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (marketers:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_key IS NULL OR length(trim(p_key)) < 1 THEN
    RAISE EXCEPTION 'A plan key is required' USING ERRCODE = 'check_violation';
  END IF;
  v_model := COALESCE(p_plan->>'model', 'hybrid');
  IF v_model NOT IN ('cpa','revshare','hybrid') THEN
    RAISE EXCEPTION 'plan.model must be cpa|revshare|hybrid' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_old FROM public.commission_plans WHERE key = p_key;

  INSERT INTO public.commission_plans (key, label, plan, is_active, updated_at)
  VALUES (lower(trim(p_key)), p_label, COALESCE(p_plan, '{}'::jsonb), COALESCE(p_is_active, TRUE), NOW())
  ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label, plan = EXCLUDED.plan, is_active = EXCLUDED.is_active, updated_at = NOW()
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(),
          CASE WHEN v_old.key IS NULL THEN 'commission_plan.create' ELSE 'commission_plan.update' END,
          'commission_plan', NULL,
          CASE WHEN v_old.key IS NULL THEN NULL ELSE to_jsonb(v_old) END, to_jsonb(v_row));
  RETURN v_row;
END;
$$;

-- Approve a user -> marketer (promote, allocate tracking code, snapshot plan).
CREATE OR REPLACE FUNCTION public.admin_approve_marketer(
  p_user_id   UUID,
  p_plan_key  TEXT DEFAULT NULL,
  p_plan      JSONB DEFAULT NULL,
  p_hold_days INT DEFAULT 0,
  p_notes     TEXT DEFAULT NULL
)
RETURNS public.marketer_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  user_role;
  v_plan  JSONB;
  v_row   public.marketer_profiles%ROWTYPE;
  v_app   UUID;
  v_code  TEXT;
BEGIN
  IF NOT public.has_capability('marketers:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (marketers:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE = 'no_data_found'; END IF;

  -- Resolve the plan snapshot: inline override wins, else template, else default.
  IF p_plan IS NOT NULL AND p_plan <> '{}'::jsonb THEN
    v_plan := p_plan;
  ELSIF p_plan_key IS NOT NULL THEN
    SELECT plan INTO v_plan FROM public.commission_plans WHERE key = p_plan_key AND is_active;
    IF v_plan IS NULL THEN RAISE EXCEPTION 'Unknown or inactive plan: %', p_plan_key USING ERRCODE = 'check_violation'; END IF;
  ELSE
    v_plan := '{"model":"cpa","cpa_usd":0,"revshare_pct":0}'::jsonb;
  END IF;

  IF v_role = 'user' THEN
    UPDATE public.profiles SET role = 'marketer', updated_at = NOW() WHERE id = p_user_id;
  END IF;

  UPDATE public.role_applications
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = NOW(),
         review_notes = COALESCE(p_notes, review_notes)
   WHERE user_id = p_user_id AND kind = 'marketer' AND status = 'pending'
   RETURNING id INTO v_app;

  SELECT tracking_code INTO v_code FROM public.marketer_profiles WHERE user_id = p_user_id;
  IF v_code IS NULL THEN v_code := public._gen_tracking_code(); END IF;

  INSERT INTO public.marketer_profiles
    (user_id, tracking_code, plan_key, commission_plan, hold_days, status,
     application_id, approved_by, created_at, updated_at)
  VALUES
    (p_user_id, v_code, p_plan_key, v_plan, GREATEST(COALESCE(p_hold_days,0),0), 'active',
     v_app, auth.uid(), NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    plan_key = EXCLUDED.plan_key,
    commission_plan = EXCLUDED.commission_plan,
    hold_days = EXCLUDED.hold_days,
    status = 'active',
    suspended_reason = NULL,
    approved_by = auth.uid(),
    updated_at = NOW()
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'marketer.approve', 'profile', p_user_id,
          jsonb_build_object('tracking_code', v_row.tracking_code, 'plan_key', p_plan_key, 'notes', p_notes));
  RETURN v_row;
END;
$$;

-- Update a marketer's plan / hold period.
CREATE OR REPLACE FUNCTION public.admin_update_marketer_plan(
  p_user_id   UUID,
  p_plan_key  TEXT,
  p_plan      JSONB,
  p_hold_days INT
)
RETURNS public.marketer_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.marketer_profiles%ROWTYPE;
  v_row public.marketer_profiles%ROWTYPE;
  v_plan JSONB;
BEGIN
  IF NOT public.has_capability('marketers:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (marketers:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_old FROM public.marketer_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketer profile not found' USING ERRCODE = 'no_data_found'; END IF;

  IF p_plan IS NOT NULL AND p_plan <> '{}'::jsonb THEN
    v_plan := p_plan;
  ELSIF p_plan_key IS NOT NULL THEN
    SELECT plan INTO v_plan FROM public.commission_plans WHERE key = p_plan_key AND is_active;
    IF v_plan IS NULL THEN RAISE EXCEPTION 'Unknown or inactive plan: %', p_plan_key USING ERRCODE = 'check_violation'; END IF;
  ELSE
    v_plan := v_old.commission_plan;
  END IF;

  UPDATE public.marketer_profiles SET
    plan_key = COALESCE(p_plan_key, plan_key),
    commission_plan = v_plan,
    hold_days = COALESCE(p_hold_days, hold_days),
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'marketer.update_plan', 'profile', p_user_id, to_jsonb(v_old), to_jsonb(v_row));
  RETURN v_row;
END;
$$;

-- Suspend / reactivate / revoke a marketer (revoke demotes role back to user).
CREATE OR REPLACE FUNCTION public.admin_set_marketer_status(
  p_user_id UUID,
  p_status  TEXT,
  p_reason  TEXT DEFAULT NULL
)
RETURNS public.marketer_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.marketer_profiles%ROWTYPE;
  v_row public.marketer_profiles%ROWTYPE;
BEGIN
  IF NOT public.has_capability('marketers:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (marketers:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('active','suspended','revoked') THEN
    RAISE EXCEPTION 'status must be active|suspended|revoked' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_old FROM public.marketer_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketer profile not found' USING ERRCODE = 'no_data_found'; END IF;

  UPDATE public.marketer_profiles SET
    status = p_status,
    suspended_reason = CASE WHEN p_status = 'active' THEN NULL ELSE p_reason END,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_row;

  IF p_status = 'revoked' THEN
    UPDATE public.profiles SET role = 'user', updated_at = NOW()
     WHERE id = p_user_id AND role = 'marketer';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'marketer.set_status', 'profile', p_user_id,
          jsonb_build_object('status', v_old.status),
          jsonb_build_object('status', p_status, 'reason', p_reason));
  RETURN v_row;
END;
$$;

-- Regenerate a marketer's tracking code (e.g. leaked/abused code).
CREATE OR REPLACE FUNCTION public.admin_regenerate_tracking_code(p_user_id UUID)
RETURNS public.marketer_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old TEXT;
  v_row public.marketer_profiles%ROWTYPE;
BEGIN
  IF NOT public.has_capability('marketers:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (marketers:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT tracking_code INTO v_old FROM public.marketer_profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketer profile not found' USING ERRCODE = 'no_data_found'; END IF;

  UPDATE public.marketer_profiles SET tracking_code = public._gen_tracking_code(), updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'marketer.regen_code', 'profile', p_user_id,
          jsonb_build_object('tracking_code', v_old),
          jsonb_build_object('tracking_code', v_row.tracking_code));
  RETURN v_row;
END;
$$;

-- ============================================================
-- 15. CAMPAIGN RPCs (capability: marketers:manage) - all audited
-- ============================================================

-- Upsert a promo campaign.
CREATE OR REPLACE FUNCTION public.admin_upsert_campaign(
  p_id              UUID,
  p_code            TEXT,
  p_label           TEXT,
  p_marketer_id     UUID,
  p_kind            TEXT,
  p_value_pct       NUMERIC,
  p_max_value_usd   NUMERIC,
  p_budget_usd      NUMERIC,
  p_max_redemptions INT,
  p_per_user_limit  INT,
  p_starts_at       TIMESTAMPTZ,
  p_ends_at         TIMESTAMPTZ
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.campaigns%ROWTYPE;
  v_row public.campaigns%ROWTYPE;
BEGIN
  IF NOT public.has_capability('marketers:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (marketers:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_code IS NULL OR length(trim(p_code)) < 2 THEN
    RAISE EXCEPTION 'A campaign code is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_kind NOT IN ('deposit_bonus','fee_discount') THEN
    RAISE EXCEPTION 'kind must be deposit_bonus|fee_discount' USING ERRCODE = 'check_violation';
  END IF;
  IF p_value_pct IS NULL OR p_value_pct < 0 OR p_value_pct > 100 THEN
    RAISE EXCEPTION 'value_pct must be between 0 and 100' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at < p_starts_at THEN
    RAISE EXCEPTION 'ends_at must be after starts_at' USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.campaigns WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'no_data_found'; END IF;
    UPDATE public.campaigns SET
      code = upper(trim(p_code)), label = p_label, marketer_id = p_marketer_id, kind = p_kind,
      value_pct = p_value_pct, max_value_usd = p_max_value_usd, budget_usd = p_budget_usd,
      max_redemptions = p_max_redemptions, per_user_limit = COALESCE(p_per_user_limit, 1),
      starts_at = p_starts_at, ends_at = p_ends_at, updated_at = NOW()
    WHERE id = p_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.campaigns
      (code, label, marketer_id, kind, value_pct, max_value_usd, budget_usd,
       max_redemptions, per_user_limit, starts_at, ends_at, created_by)
    VALUES
      (upper(trim(p_code)), p_label, p_marketer_id, p_kind, p_value_pct, p_max_value_usd, p_budget_usd,
       p_max_redemptions, COALESCE(p_per_user_limit, 1), p_starts_at, p_ends_at, auth.uid())
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(),
          CASE WHEN p_id IS NULL THEN 'campaign.create' ELSE 'campaign.update' END,
          'campaign', v_row.id,
          CASE WHEN p_id IS NULL THEN NULL ELSE to_jsonb(v_old) END, to_jsonb(v_row));
  RETURN v_row;
END;
$$;

-- Pause / resume / end a campaign.
CREATE OR REPLACE FUNCTION public.admin_set_campaign_status(
  p_id     UUID,
  p_status TEXT
)
RETURNS public.campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.campaigns%ROWTYPE;
  v_row public.campaigns%ROWTYPE;
BEGIN
  IF NOT public.has_capability('marketers:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions (marketers:manage required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('active','paused','ended') THEN
    RAISE EXCEPTION 'status must be active|paused|ended' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_old FROM public.campaigns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'no_data_found'; END IF;

  UPDATE public.campaigns SET status = p_status, updated_at = NOW() WHERE id = p_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'campaign.set_status', 'campaign', p_id,
          jsonb_build_object('status', v_old.status), jsonb_build_object('status', p_status));
  RETURN v_row;
END;
$$;

-- ============================================================
-- 16. PAYOUT-RUN ENGINE (capability: payouts:run) - state machine, audited
--   draft -> computed -> approved -> disbursed
--                 \-> cancelled (before disburse)
--   item clawback only on a disbursed run's paid items.
-- ============================================================

-- Create an empty payout run for a period.
CREATE OR REPLACE FUNCTION public.admin_create_payout_run(
  p_kind         TEXT,
  p_period_start DATE,
  p_period_end   DATE,
  p_notes        TEXT DEFAULT NULL
)
RETURNS public.payout_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payout_runs%ROWTYPE;
BEGIN
  IF NOT public.has_capability('payouts:run') THEN
    RAISE EXCEPTION 'Insufficient permissions (payouts:run required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_kind NOT IN ('creator','marketer') THEN
    RAISE EXCEPTION 'kind must be creator|marketer' USING ERRCODE = 'check_violation';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'A valid period (start <= end) is required' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.payout_runs (kind, period_start, period_end, status, notes, created_by)
  VALUES (p_kind, p_period_start, p_period_end, 'draft', p_notes, auth.uid())
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'payout_run.create', 'payout_run', v_row.id, to_jsonb(v_row));
  RETURN v_row;
END;
$$;

-- Compute (or recompute) items for a draft/computed run.
CREATE OR REPLACE FUNCTION public.admin_compute_payout_run(p_run_id UUID)
RETURNS public.payout_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run    public.payout_runs%ROWTYPE;
  v_m      RECORD;
  v_activ  INT;
  v_rev    NUMERIC;
  v_amount NUMERIC;
  v_sum    NUMERIC;
  v_cnt    INT;
  v_c      RECORD;
BEGIN
  IF NOT public.has_capability('payouts:run') THEN
    RAISE EXCEPTION 'Insufficient permissions (payouts:run required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout run not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_run.status NOT IN ('draft','computed') THEN
    RAISE EXCEPTION 'Only draft/computed runs can be computed (current: %)', v_run.status
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.payout_items WHERE run_id = p_run_id;

  IF v_run.kind = 'creator' THEN
    -- STATEMENT: aggregate already-credited creator_reward transactions in period.
    FOR v_c IN
      SELECT t.user_id,
             SUM(t.amount_usd)::numeric AS total_usd,
             COUNT(*)::int AS n
      FROM public.transactions t
      WHERE t.type = 'creator_reward' AND t.status = 'completed'
        AND t.created_at::date BETWEEN v_run.period_start AND v_run.period_end
      GROUP BY t.user_id
      HAVING SUM(t.amount_usd) > 0
    LOOP
      INSERT INTO public.payout_items
        (run_id, user_id, amount_usd, settlement, status, eligible_at, tx_count, detail)
      VALUES
        (p_run_id, v_c.user_id, ROUND(v_c.total_usd, 6), 'statement_only', 'pending', NULL, v_c.n,
         jsonb_build_object('kind','creator','period_start',v_run.period_start,'period_end',v_run.period_end));
    END LOOP;
  ELSE
    -- ACCRUAL: compute marketer commissions from attribution + plan.
    FOR v_m IN SELECT * FROM public.marketer_profiles WHERE status = 'active' LOOP
      SELECT COUNT(*) INTO v_activ FROM (
        SELECT p.id, MIN(t.created_at) AS first_dep
        FROM public.profiles p
        JOIN public.transactions t
          ON t.user_id = p.id AND t.type = 'deposit' AND t.status = 'completed'
        WHERE p.referred_by = v_m.user_id
        GROUP BY p.id
      ) s
      WHERE s.first_dep::date BETWEEN v_run.period_start AND v_run.period_end;

      SELECT COALESCE(SUM(t.fee_amount * t.exchange_rate_to_usd), 0) INTO v_rev
      FROM public.transactions t
      JOIN public.profiles p ON p.id = t.user_id
      WHERE p.referred_by = v_m.user_id
        AND t.type = 'bet_placed' AND t.status = 'completed'
        AND t.created_at::date BETWEEN v_run.period_start AND v_run.period_end;

      v_amount := public.marketer_commission_usd(v_m.commission_plan, v_activ, v_rev);
      IF v_amount > 0 THEN
        INSERT INTO public.payout_items
          (run_id, user_id, amount_usd, settlement, status, eligible_at, tx_count, detail)
        VALUES
          (p_run_id, v_m.user_id, v_amount, 'credited', 'pending',
           (v_run.period_end + (v_m.hold_days || ' days')::interval)::timestamptz, 0,
           jsonb_build_object('kind','marketer','activations',v_activ,'revenue_base',ROUND(v_rev,6),
                              'plan',v_m.commission_plan,'hold_days',v_m.hold_days));
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(SUM(amount_usd),0), COUNT(*) INTO v_sum, v_cnt FROM public.payout_items WHERE run_id = p_run_id;

  UPDATE public.payout_runs SET status = 'computed', computed_at = NOW() WHERE id = p_run_id
  RETURNING * INTO v_run;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'payout_run.compute', 'payout_run', p_run_id,
          jsonb_build_object('items', v_cnt, 'total_usd', v_sum));
  RETURN v_run;
END;
$$;

-- Approve a computed run (locks it for disbursement).
CREATE OR REPLACE FUNCTION public.admin_approve_payout_run(p_run_id UUID)
RETURNS public.payout_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.payout_runs%ROWTYPE;
BEGIN
  IF NOT public.has_capability('payouts:run') THEN
    RAISE EXCEPTION 'Insufficient permissions (payouts:run required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout run not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_run.status <> 'computed' THEN
    RAISE EXCEPTION 'Only computed runs can be approved (current: %)', v_run.status USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payout_items WHERE run_id = p_run_id) THEN
    RAISE EXCEPTION 'Cannot approve an empty run' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.payout_runs SET status = 'approved', approved_by = auth.uid(), approved_at = NOW()
  WHERE id = p_run_id RETURNING * INTO v_run;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'payout_run.approve', 'payout_run', p_run_id,
          jsonb_build_object('total_usd', v_run.total_usd));
  RETURN v_run;
END;
$$;

-- Disburse an approved run: credit marketer wallets, mark creator statements paid,
-- hold items whose eligibility date has not yet passed.
CREATE OR REPLACE FUNCTION public.admin_disburse_payout_run(p_run_id UUID)
RETURNS public.payout_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run   public.payout_runs%ROWTYPE;
  v_it    RECORD;
  v_wid   UUID;
  v_bal   NUMERIC;
  v_txn   UUID;
  v_paid  INT := 0;
  v_held  INT := 0;
BEGIN
  IF NOT public.has_capability('payouts:run') THEN
    RAISE EXCEPTION 'Insufficient permissions (payouts:run required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout run not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_run.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved runs can be disbursed (current: %)', v_run.status USING ERRCODE = 'check_violation';
  END IF;

  FOR v_it IN SELECT * FROM public.payout_items WHERE run_id = p_run_id AND status = 'pending' FOR UPDATE LOOP
    IF v_it.settlement = 'statement_only' THEN
      -- Creator: money already credited at bet time; this only reconciles.
      UPDATE public.payout_items SET status = 'paid' WHERE id = v_it.id;
      v_paid := v_paid + 1;
    ELSE
      -- Marketer: respect hold gate.
      IF v_it.eligible_at IS NOT NULL AND v_it.eligible_at > NOW() THEN
        UPDATE public.payout_items SET status = 'held' WHERE id = v_it.id;
        v_held := v_held + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.wallets (user_id, currency) VALUES (v_it.user_id, 'USD')
      ON CONFLICT (user_id, currency) DO NOTHING;
      SELECT id, available_balance INTO v_wid, v_bal
      FROM public.wallets WHERE user_id = v_it.user_id AND currency = 'USD' FOR UPDATE;

      UPDATE public.wallets SET available_balance = available_balance + v_it.amount_usd,
             total_won = total_won + v_it.amount_usd, updated_at = NOW()
      WHERE id = v_wid;

      INSERT INTO public.transactions (
        user_id, wallet_id, type, status, amount, currency, amount_usd, exchange_rate_to_usd,
        balance_before, balance_after, description, idempotency_key
      ) VALUES (
        v_it.user_id, v_wid, 'referral_bonus', 'completed', v_it.amount_usd, 'USD', v_it.amount_usd, 1,
        v_bal, v_bal + v_it.amount_usd,
        FORMAT('Marketer commission payout (%s to %s)', v_run.period_start, v_run.period_end),
        'payout_item:' || v_it.id::text
      ) RETURNING id INTO v_txn;

      UPDATE public.payout_items SET status = 'paid', transaction_id = v_txn WHERE id = v_it.id;
      v_paid := v_paid + 1;
    END IF;
  END LOOP;

  UPDATE public.payout_runs SET status = 'disbursed', disbursed_at = NOW() WHERE id = p_run_id
  RETURNING * INTO v_run;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'payout_run.disburse', 'payout_run', p_run_id,
          jsonb_build_object('paid', v_paid, 'held', v_held, 'total_usd', v_run.total_usd));
  RETURN v_run;
END;
$$;

-- Cancel a run before disbursement (drops its items).
CREATE OR REPLACE FUNCTION public.admin_cancel_payout_run(
  p_run_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.payout_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.payout_runs%ROWTYPE;
BEGIN
  IF NOT public.has_capability('payouts:run') THEN
    RAISE EXCEPTION 'Insufficient permissions (payouts:run required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout run not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_run.status = 'disbursed' THEN
    RAISE EXCEPTION 'A disbursed run cannot be cancelled' USING ERRCODE = 'check_violation';
  END IF;
  IF v_run.status = 'cancelled' THEN
    RAISE EXCEPTION 'Run is already cancelled' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.payout_items WHERE run_id = p_run_id;
  UPDATE public.payout_runs SET status = 'cancelled', notes = COALESCE(p_reason, notes) WHERE id = p_run_id
  RETURNING * INTO v_run;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'payout_run.cancel', 'payout_run', p_run_id,
          jsonb_build_object('reason', p_reason));
  RETURN v_run;
END;
$$;

-- Clawback a single paid item (chargeback/refund/fraud).
CREATE OR REPLACE FUNCTION public.admin_clawback_payout_item(
  p_item_id UUID,
  p_reason  TEXT
)
RETURNS public.payout_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_it  public.payout_items%ROWTYPE;
  v_run public.payout_runs%ROWTYPE;
  v_wid UUID;
  v_bal NUMERIC;
  v_txn UUID;
BEGIN
  IF NOT public.has_capability('payouts:run') THEN
    RAISE EXCEPTION 'Insufficient permissions (payouts:run required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A clawback reason is required' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_it FROM public.payout_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout item not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_it.status <> 'paid' THEN
    RAISE EXCEPTION 'Only paid items can be clawed back (current: %)', v_it.status USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_run FROM public.payout_runs WHERE id = v_it.run_id;

  IF v_it.settlement = 'credited' THEN
    -- Reverse the wallet credit; require sufficient available balance.
    SELECT id, available_balance INTO v_wid, v_bal
    FROM public.wallets WHERE user_id = v_it.user_id AND currency = 'USD' FOR UPDATE;
    IF v_wid IS NULL THEN RAISE EXCEPTION 'Beneficiary USD wallet not found' USING ERRCODE = 'no_data_found'; END IF;
    IF v_bal < v_it.amount_usd THEN
      RAISE EXCEPTION 'Insufficient available balance to clawback (have %, need %)', v_bal, v_it.amount_usd
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.wallets SET available_balance = available_balance - v_it.amount_usd, updated_at = NOW()
    WHERE id = v_wid;

    INSERT INTO public.transactions (
      user_id, wallet_id, type, status, amount, currency, amount_usd, exchange_rate_to_usd,
      balance_before, balance_after, description, idempotency_key
    ) VALUES (
      v_it.user_id, v_wid, 'referral_bonus', 'completed', -v_it.amount_usd, 'USD', -v_it.amount_usd, 1,
      v_bal, v_bal - v_it.amount_usd,
      FORMAT('Commission clawback: %s', p_reason),
      'payout_clawback:' || v_it.id::text
    ) RETURNING id INTO v_txn;
  END IF;

  UPDATE public.payout_items
     SET status = 'clawed_back',
         detail = detail || jsonb_build_object('clawback_reason', p_reason, 'clawed_back_at', NOW())
   WHERE id = p_item_id
  RETURNING * INTO v_it;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'payout_item.clawback', 'payout_item', p_item_id,
          jsonb_build_object('status','paid','amount_usd',v_it.amount_usd,'settlement',v_it.settlement),
          jsonb_build_object('status','clawed_back','reason',p_reason));
  RETURN v_it;
END;
$$;

-- ============================================================
-- 17. GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.marketer_commission_usd(JSONB, INT, NUMERIC) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_creator_tier(TEXT, TEXT, NUMERIC, INT, BOOLEAN, INT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_creator(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_creator(UUID, TEXT, NUMERIC, BOOLEAN, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_creator_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_application(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_commission_plan(TEXT, TEXT, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_marketer(UUID, TEXT, JSONB, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_marketer_plan(UUID, TEXT, JSONB, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_marketer_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_regenerate_tracking_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_campaign(UUID, TEXT, TEXT, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, INT, INT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_campaign_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_payout_run(TEXT, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_compute_payout_run(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_payout_run(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_disburse_payout_run(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_payout_run(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clawback_payout_item(UUID, TEXT) TO authenticated;

-- ============================================================
-- 18. SEEDS (idempotent)
-- ============================================================
INSERT INTO public.creator_tiers (key, label, reward_pct, max_open_markets, auto_publish, sort_order) VALUES
  ('bronze', 'Bronze', 0.0025, 5,  FALSE, 10),
  ('silver', 'Silver', 0.0035, 15, FALSE, 20),
  ('gold',   'Gold',   0.0050, 50, TRUE,  30)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.commission_plans (key, label, plan) VALUES
  ('standard_cpa',      'Standard CPA',      '{"model":"cpa","cpa_usd":2.0,"revshare_pct":0,"hold_days":7}'),
  ('standard_revshare', 'Standard Rev-share','{"model":"revshare","cpa_usd":0,"revshare_pct":10.0,"hold_days":7}'),
  ('hybrid_growth',     'Hybrid Growth',     '{"model":"hybrid","cpa_usd":1.0,"revshare_pct":5.0,"hold_days":7}')
ON CONFLICT (key) DO NOTHING;
