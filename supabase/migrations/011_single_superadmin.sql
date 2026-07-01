-- ============================================================
-- MarketPips - Migration 011: enforce EXACTLY ONE superadmin
-- ============================================================
-- Depends on 008 (roles) + 009 (RBAC + superadmin triggers) + 010 (user RPCs).
--
-- Business rule: the system has a single owner/break-glass identity. Combined
-- with the immutability invariants from 009 (a superadmin can never be demoted
-- or removed), this migration guarantees there is at most ONE superadmin at any
-- time — enforced at the database level so it holds against the service-role
-- key and raw SQL, not just application code.
--
-- Enforcement layers:
--   1. Partial UNIQUE index  -> the hard guarantee (blocks a 2nd superadmin row).
--   2. Role-change trigger    -> a friendly error before the index fires.
--   3. admin_set_user_role RPC -> rejects promoting anyone to superadmin.
--   4. App guardrails (rbac.ts) -> never offers "superadmin" as a grantable role.
--
-- NOTE: if a database somehow already contains >1 superadmin, the index build
-- below will fail; resolve the duplicates first (there should never be more
-- than one by design).
-- ============================================================

-- 1. Hard guarantee: at most one row may have role = 'superadmin'.
CREATE UNIQUE INDEX IF NOT EXISTS one_superadmin_only
  ON public.profiles ((role))
  WHERE role = 'superadmin';

-- 2. Friendly guard inside the existing role-change trigger. We REPLACE the
--    function from 009 and add an explicit "second superadmin" check while
--    preserving every prior invariant (immutability + staff-grant control).
CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_superadmin UUID;
BEGIN
  -- (a) A superadmin is immutable: cannot be demoted, suspended, or closed.
  IF OLD.role = 'superadmin' AND NOT public._superadmin_override_on() THEN
    IF NEW.role <> 'superadmin' THEN
      RAISE EXCEPTION 'A superadmin cannot be demoted (owner/break-glass role is immutable).'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.account_status <> 'active' THEN
      RAISE EXCEPTION 'A superadmin account cannot be suspended or closed.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- (b) Exactly one superadmin: block promoting a second user to superadmin.
  IF NEW.role = 'superadmin' AND OLD.role <> 'superadmin'
     AND NOT public._superadmin_override_on() THEN
    SELECT id INTO v_existing_superadmin
    FROM public.profiles
    WHERE role = 'superadmin' AND id <> NEW.id
    LIMIT 1;
    IF v_existing_superadmin IS NOT NULL THEN
      RAISE EXCEPTION 'The system allows exactly one superadmin; one already exists.'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  -- (c) Granting/altering staff or superadmin roles is superadmin-only
  --     (only enforced for real user sessions; trusted server paths rely on
  --     the application guard).
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() IS NOT NULL THEN
    IF NEW.role = ANY (public.staff_roles()) AND NOT public._actor_is_superadmin() THEN
      RAISE EXCEPTION 'Only a superadmin can grant staff roles (attempted to set role=%).', NEW.role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.role = ANY (public.staff_roles()) AND NOT public._actor_is_superadmin() THEN
      RAISE EXCEPTION 'Only a superadmin can change a staff member''s role.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: explicitly refuse to promote anyone to superadmin (nicer error than
--    the raw index/trigger violation, and documents intent). REPLACES the 010
--    definition, keeping all other guardrails intact.
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

  -- The single superadmin is fixed at bootstrap and can never be reassigned.
  IF p_new_role = 'superadmin' THEN
    RAISE EXCEPTION 'The system allows exactly one superadmin; it is set at bootstrap and cannot be reassigned.'
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
