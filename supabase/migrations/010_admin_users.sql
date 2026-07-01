-- ============================================================
-- MarketPips - Migration 010: Admin user management (Phase B)
-- ============================================================
-- Depends on 008 (roles) + 009 (RBAC helpers, superadmin triggers).
--
-- Adds the data + atomic, capability-checked RPCs behind the /admin/users and
-- /admin/kyc consoles. All mutating operator actions go through SECURITY DEFINER
-- functions so we get COLUMN-LEVEL control (which RLS alone cannot express) plus
-- consistent audit logging. The superadmin-protection triggers from 009 still
-- fire on the underlying UPDATE/DELETE, giving defence in depth.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Internal notes on users (operator-only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_user_notes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES public.profiles(id),
  note       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_user_notes_user ON public.admin_user_notes(user_id, created_at DESC);

ALTER TABLE public.admin_user_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff with users:read can read notes" ON public.admin_user_notes;
CREATE POLICY "Staff with users:read can read notes" ON public.admin_user_notes
  FOR SELECT USING (public.has_capability('users:read'));

DROP POLICY IF EXISTS "Service role manages notes" ON public.admin_user_notes;
CREATE POLICY "Service role manages notes" ON public.admin_user_notes
  FOR ALL USING (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- 2. Impersonation sessions (time-boxed, fully audited)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id       UUID NOT NULL REFERENCES public.profiles(id),
  target_user_id UUID NOT NULL REFERENCES public.profiles(id),
  reason         TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ,
  ip_address     INET,
  user_agent     TEXT
);
CREATE INDEX IF NOT EXISTS idx_impersonation_admin ON public.impersonation_sessions(admin_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_target ON public.impersonation_sessions(target_user_id, started_at DESC);

ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Impersonation visible to impersonate-capable staff" ON public.impersonation_sessions;
CREATE POLICY "Impersonation visible to impersonate-capable staff" ON public.impersonation_sessions
  FOR SELECT USING (public.has_capability('users:impersonate') OR public.has_capability('audit:read'));

DROP POLICY IF EXISTS "Service role manages impersonation" ON public.impersonation_sessions;
CREATE POLICY "Service role manages impersonation" ON public.impersonation_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- 3. RPC: set account status (suspend / reactivate / close)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  p_user_id UUID,
  p_status  account_status,
  p_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
BEGIN
  IF NOT public.has_capability('users:suspend') THEN
    RAISE EXCEPTION 'Insufficient permissions (users:suspend required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;

  -- Superadmin is immutable (belt-and-suspenders; trigger also blocks).
  IF v_target.role = 'superadmin' THEN
    RAISE EXCEPTION 'A superadmin account cannot be suspended or closed.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Changing a staff member's status is superadmin-only.
  IF v_target.role = ANY (public.staff_roles()) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin can change a staff member''s account status.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.profiles SET account_status = p_status, updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(), 'user.account_status', 'profile', p_user_id,
    jsonb_build_object('account_status', v_target.account_status),
    jsonb_build_object('account_status', p_status, 'reason', p_reason)
  );

  RETURN jsonb_build_object('success', TRUE, 'user_id', p_user_id, 'account_status', p_status);
END;
$$;

-- ------------------------------------------------------------
-- 4. RPC: set user role (with full grant guardrails)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id  UUID,
  p_new_role user_role
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.profiles%ROWTYPE;
  v_is_staff_target BOOLEAN;
  v_is_staff_new    BOOLEAN;
BEGIN
  IF NOT public.has_capability('users:role_grant') THEN
    RAISE EXCEPTION 'Insufficient permissions (users:role_grant required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;

  IF v_target.role = 'superadmin' THEN
    RAISE EXCEPTION 'A superadmin is immutable and cannot be re-roled.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_target.role = p_new_role THEN
    RAISE EXCEPTION 'No-op: user already has role %', p_new_role;
  END IF;

  v_is_staff_target := v_target.role = ANY (public.staff_roles());
  v_is_staff_new    := p_new_role   = ANY (public.staff_roles());

  -- Granting OR revoking a staff role (incl. superadmin) is superadmin-only.
  IF (v_is_staff_new OR v_is_staff_target) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin can grant or revoke staff roles.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.profiles SET role = p_new_role, updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(), 'user.role_grant', 'profile', p_user_id,
    jsonb_build_object('role', v_target.role),
    jsonb_build_object('role', p_new_role)
  );

  RETURN jsonb_build_object('success', TRUE, 'user_id', p_user_id, 'role', p_new_role);
END;
$$;

-- ------------------------------------------------------------
-- 5. RPC: adjust wallet balance (atomic, audited, writes a transaction)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_user_id  UUID,
  p_currency currency_code,
  p_amount   NUMERIC,               -- signed: positive = credit, negative = debit
  p_reason   TEXT,
  p_type     transaction_type DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_rate   NUMERIC;
  v_before NUMERIC;
  v_after  NUMERIC;
  v_type   transaction_type;
BEGIN
  IF NOT public.has_capability('users:update') THEN
    RAISE EXCEPTION 'Insufficient permissions (users:update required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_amount = 0 THEN RAISE EXCEPTION 'Adjustment amount must be non-zero'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required for a balance adjustment';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets
  WHERE user_id = p_user_id AND currency = p_currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found for % / %', p_user_id, p_currency; END IF;

  v_before := v_wallet.available_balance;
  v_after  := v_before + p_amount;
  IF v_after < 0 THEN
    RAISE EXCEPTION 'Adjustment would make balance negative (have %, delta %)', v_before, p_amount;
  END IF;

  -- FX to USD for the transaction record.
  IF p_currency = 'USD' THEN
    v_rate := 1;
  ELSE
    SELECT rate INTO v_rate FROM public.exchange_rates
    WHERE from_currency = p_currency AND to_currency = 'USD'
    ORDER BY fetched_at DESC NULLS LAST LIMIT 1;
  END IF;
  IF v_rate IS NULL THEN RAISE EXCEPTION 'No USD exchange rate for %', p_currency; END IF;

  v_type := COALESCE(p_type, CASE WHEN p_amount >= 0 THEN 'bonus' ELSE 'fee' END);

  UPDATE public.wallets SET available_balance = v_after, updated_at = NOW()
  WHERE id = v_wallet.id;

  INSERT INTO public.transactions (
    user_id, wallet_id, type, status, amount, currency, amount_usd,
    exchange_rate_to_usd, balance_before, balance_after, description, notes, completed_at
  ) VALUES (
    p_user_id, v_wallet.id, v_type, 'completed', p_amount, p_currency, p_amount * v_rate,
    v_rate, v_before, v_after, 'Admin balance adjustment', p_reason, NOW()
  );

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    auth.uid(), 'user.balance_adjust', 'wallet', v_wallet.id,
    jsonb_build_object('available_balance', v_before),
    jsonb_build_object('available_balance', v_after, 'delta', p_amount, 'currency', p_currency, 'reason', p_reason)
  );

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_user_id, 'system_announcement',
    CASE WHEN p_amount >= 0 THEN 'Balance credited' ELSE 'Balance adjusted' END,
    format('Your %s balance was adjusted by %s.', p_currency, p_amount),
    jsonb_build_object('delta', p_amount, 'currency', p_currency)
  );

  RETURN jsonb_build_object('success', TRUE, 'wallet_id', v_wallet.id,
    'balance_before', v_before, 'balance_after', v_after);
END;
$$;

-- ------------------------------------------------------------
-- 6. RPC: add an internal note on a user
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_add_user_note(
  p_user_id UUID,
  p_note    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.has_capability('users:read') THEN
    RAISE EXCEPTION 'Insufficient permissions (users:read required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'Note cannot be empty';
  END IF;

  INSERT INTO public.admin_user_notes (user_id, author_id, note)
  VALUES (p_user_id, auth.uid(), p_note)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'user.note_add', 'profile', p_user_id, jsonb_build_object('note_id', v_id));

  RETURN jsonb_build_object('success', TRUE, 'note_id', v_id);
END;
$$;

-- ------------------------------------------------------------
-- 7. Let non-admin KYC reviewers (e.g. support) read KYC docs
-- ------------------------------------------------------------
-- The 001 policy only allows is_admin(); support has kyc:review but is not
-- is_admin(), so add a capability-based read policy on the table + storage.
DROP POLICY IF EXISTS "KYC reviewers can read KYC docs" ON public.kyc_documents;
CREATE POLICY "KYC reviewers can read KYC docs" ON public.kyc_documents
  FOR SELECT USING (public.has_capability('kyc:review'));

DROP POLICY IF EXISTS "KYC reviewers can read KYC files" ON storage.objects;
CREATE POLICY "KYC reviewers can read KYC files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kyc-documents' AND public.has_capability('kyc:review')
  );
