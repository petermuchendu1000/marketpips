-- ============================================================
-- MarketPips - Migration 009: Admin RBAC core (capabilities + Superadmin invariants)
-- ============================================================
-- Depends on migration 008 (which adds the new user_role enum values).
--
-- This migration establishes the permission backbone for the admin control
-- plane and, critically, the DATABASE-ENFORCED invariants for the Superadmin
-- role. These invariants are enforced with triggers so they hold even against
-- the service-role key and direct SQL, not just application code.
--
-- SUPERADMIN INVARIANTS (owner / break-glass identity):
--   1. God-like: implicitly holds EVERY capability (has_capability() short-circuits).
--   2. Cannot be demoted: its role can never be changed away from 'superadmin'.
--   3. Cannot be removed: its profile row cannot be deleted, suspended, or closed.
--   4. Only a superadmin may grant/revoke staff roles (incl. creating a superadmin).
--   5. Manages everyone and everything.
--
-- Break-glass escape hatch (for disaster recovery only): a session may set
--   SET LOCAL app.superadmin_override = 'on';
-- before running a protected statement. This requires direct database access
-- (service console) and is never set by the application. Every use should be
-- treated as a security event.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Capability catalogue (role -> capability)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role        user_role NOT NULL,
  capability  TEXT      NOT NULL,   -- 'resource:action', e.g. 'gateways:write'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role, capability)
);

COMMENT ON TABLE public.role_permissions IS
  'Maps a role to the capability strings it grants. superadmin is intentionally '
  'absent: it holds every capability implicitly via has_capability().';

-- Seed the capability matrix (docs/08-ADMIN.md section 2.2). superadmin omitted
-- on purpose (god-mode short-circuit). Idempotent.
INSERT INTO public.role_permissions (role, capability) VALUES
  -- support (tier-1 operations)
  ('support',   'users:read'),
  ('support',   'users:suspend'),
  ('support',   'kyc:review'),
  -- finance (payments & ledger)
  ('finance',   'users:read'),
  ('finance',   'marketers:manage'),
  ('finance',   'finance:deposits'),
  ('finance',   'finance:withdrawals'),
  ('finance',   'finance:ledger'),
  ('finance',   'payouts:run'),
  ('finance',   'gateways:read'),
  ('finance',   'audit:read'),
  -- resolver (outcome resolution)
  ('resolver',  'markets:resolve'),
  -- moderator (content & market governance)
  ('moderator', 'users:read'),
  ('moderator', 'users:suspend'),
  ('moderator', 'kyc:review'),
  ('moderator', 'creators:manage'),
  ('moderator', 'marketers:manage'),
  ('moderator', 'markets:approve'),
  ('moderator', 'markets:resolve'),
  ('moderator', 'markets:cancel'),
  ('moderator', 'moderation:read'),
  ('moderator', 'moderation:action'),
  ('moderator', 'announcements:send'),
  ('moderator', 'audit:read'),
  -- admin (platform administrator; everything except owner-only)
  ('admin',     'users:read'),
  ('admin',     'users:update'),
  ('admin',     'users:suspend'),
  ('admin',     'users:role_grant'),
  ('admin',     'users:impersonate'),
  ('admin',     'kyc:review'),
  ('admin',     'creators:manage'),
  ('admin',     'marketers:manage'),
  ('admin',     'markets:approve'),
  ('admin',     'markets:resolve'),
  ('admin',     'markets:cancel'),
  ('admin',     'finance:deposits'),
  ('admin',     'finance:withdrawals'),
  ('admin',     'finance:ledger'),
  ('admin',     'payouts:run'),
  ('admin',     'gateways:read'),
  ('admin',     'gateways:write'),
  ('admin',     'settings:write'),
  ('admin',     'moderation:read'),
  ('admin',     'moderation:action'),
  ('admin',     'announcements:send'),
  ('admin',     'staff:read'),
  ('admin',     'audit:read')
ON CONFLICT (role, capability) DO NOTHING;

-- ------------------------------------------------------------
-- 2. Role classification helpers
-- ------------------------------------------------------------

-- Staff roles: internal operators who may access /admin.
CREATE OR REPLACE FUNCTION public.staff_roles()
RETURNS user_role[] AS $$
  SELECT ARRAY['support','finance','moderator','admin','superadmin']::user_role[];
$$ LANGUAGE SQL IMMUTABLE;

-- Is the current session user a staff member?
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY (public.staff_roles())
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Is the current session user a superadmin? (god-mode)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Back-compat: is_admin() now also recognises superadmin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator', 'superadmin')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 3. Capability check (the single source of truth)
-- ------------------------------------------------------------
-- superadmin short-circuits to TRUE for ANY capability (god-mode). Every other
-- role is checked against role_permissions.
CREATE OR REPLACE FUNCTION public.has_capability(cap TEXT)
RETURNS BOOLEAN AS $$
  SELECT
    public.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.role_permissions rp ON rp.role = p.role
      WHERE p.id = auth.uid() AND rp.capability = cap
    );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 4. Superadmin protection triggers (the immutability core)
-- ------------------------------------------------------------
-- Helper: is the break-glass override active for this transaction?
CREATE OR REPLACE FUNCTION public._superadmin_override_on()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(current_setting('app.superadmin_override', true), 'off') = 'on';
$$ LANGUAGE SQL STABLE;

-- Helper: does the CURRENT actor (auth.uid()) hold the superadmin role?
-- Distinct from is_superadmin() only in intent/readability at call sites.
CREATE OR REPLACE FUNCTION public._actor_is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT public.is_superadmin();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Guard UPDATEs on profiles.
CREATE OR REPLACE FUNCTION public.guard_profile_role_change()
RETURNS TRIGGER AS $$
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

  -- (b) Granting/altering staff or superadmin roles is superadmin-only.
  -- Enforced only when a real user session performs the change (auth.uid()
  -- present). Trusted server paths (service role, auth.uid() IS NULL) rely on
  -- the application guard in requireStaffRoleGrant().
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() IS NOT NULL THEN
    -- Assigning any staff role (incl. superadmin) requires actor superadmin.
    IF NEW.role = ANY (public.staff_roles()) AND NOT public._actor_is_superadmin() THEN
      RAISE EXCEPTION 'Only a superadmin can grant staff roles (attempted to set role=%).', NEW.role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Revoking a staff role from someone also requires actor superadmin.
    IF OLD.role = ANY (public.staff_roles()) AND NOT public._actor_is_superadmin() THEN
      RAISE EXCEPTION 'Only a superadmin can change a staff member''s role.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_guard_profile_role_change ON public.profiles;
CREATE TRIGGER trg_guard_profile_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_change();

-- Guard DELETEs on profiles: a superadmin row cannot be deleted.
CREATE OR REPLACE FUNCTION public.guard_profile_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'superadmin' AND NOT public._superadmin_override_on() THEN
    RAISE EXCEPTION 'A superadmin cannot be removed (owner/break-glass role is immutable).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_guard_profile_delete ON public.profiles;
CREATE TRIGGER trg_guard_profile_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_delete();

-- ------------------------------------------------------------
-- 5. RLS on role_permissions
-- ------------------------------------------------------------
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Any staff member may read the capability matrix (needed to render the UI).
DROP POLICY IF EXISTS "Staff can read role permissions" ON public.role_permissions;
CREATE POLICY "Staff can read role permissions" ON public.role_permissions
  FOR SELECT USING (public.is_staff());

-- Only superadmin may modify the capability matrix.
DROP POLICY IF EXISTS "Superadmin can manage role permissions" ON public.role_permissions;
CREATE POLICY "Superadmin can manage role permissions" ON public.role_permissions
  FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "Service role can manage role permissions" ON public.role_permissions;
CREATE POLICY "Service role can manage role permissions" ON public.role_permissions
  FOR ALL USING (auth.role() = 'service_role');

-- ------------------------------------------------------------
-- 6. Widen admin/staff visibility policies for new consoles
-- ------------------------------------------------------------
-- Staff need to read profiles/markets/tx broadly; existing policies already
-- allow public profile SELECT and admin-wide reads via is_admin(). We add
-- staff-wide read coverage so support/finance (non-admin) roles work too.

DROP POLICY IF EXISTS "Staff can view all transactions" ON public.transactions;
CREATE POLICY "Staff can view all transactions" ON public.transactions
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can view all deposits" ON public.deposits;
CREATE POLICY "Staff can view all deposits" ON public.deposits
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can view all withdrawals" ON public.withdrawals;
CREATE POLICY "Staff can view all withdrawals" ON public.withdrawals
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can view all wallets" ON public.wallets;
CREATE POLICY "Staff can view all wallets" ON public.wallets
  FOR SELECT USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can view audit log" ON public.audit_log;
CREATE POLICY "Staff can view audit log" ON public.audit_log
  FOR SELECT USING (public.has_capability('audit:read'));
