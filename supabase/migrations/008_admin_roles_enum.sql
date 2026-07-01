-- ============================================================
-- MarketPips - Migration 008: extend user_role enum for the admin control plane
-- ============================================================
-- Adds the operator/staff roles that the admin module (Module 11) needs.
--
-- IMPORTANT: This migration ONLY adds enum values. It is deliberately kept
-- separate from 009 (which USES these values) because PostgreSQL cannot use a
-- newly added enum value in the same transaction that added it. Supabase runs
-- each migration file in its own transaction, so splitting guarantees 009 can
-- reference 'superadmin', 'creator', etc. safely.
--
-- Existing values: 'user', 'admin', 'moderator', 'resolver'
-- New values:
--   creator    - user-facing elevated role; authors markets, earns creator_reward
--   marketer   - user-facing elevated role; affiliate/growth operator
--   support    - staff; tier-1 operations (read users/tx, KYC review)
--   finance    - staff; payments & ledger operator
--   superadmin - owner / break-glass; god-like, immutable (see migration 009)
-- ============================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'creator';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'marketer';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'support';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superadmin';
