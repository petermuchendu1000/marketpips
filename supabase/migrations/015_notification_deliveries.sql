-- ============================================================
-- Migration 015 — Notifications delivery pipeline (Module 9)
-- ============================================================
-- Adds a durable OUTBOX for external notification delivery (SMS/email) on top
-- of the existing in-app `notifications` table. Design:
--   * A trigger fans every new in-app notification out into per-channel
--     `notification_deliveries` rows, based on a configurable per-type channel
--     policy AND the recipient's preferences + contact availability.
--   * A cron worker claims pending deliveries (FOR UPDATE SKIP LOCKED),
--     dispatches via the providers, and reports success/failure with
--     exponential backoff — so provider outages never block the request path
--     and transient failures are retried.
--
-- Depends on: 001 (profiles, notifications, notification_type, auth.users),
--             009 (has_capability).
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).

-- ------------------------------------------------------------
-- 1. Per-type channel policy (configurable defaults)
-- ------------------------------------------------------------
-- Which external channels a given notification type should attempt by default.
-- Admins can tune this later (settings:write). User preferences and contact
-- availability are still enforced on top of these defaults by the trigger.
CREATE TABLE IF NOT EXISTS public.notification_channel_defaults (
  type       notification_type PRIMARY KEY,
  email      BOOLEAN NOT NULL DEFAULT FALSE,
  sms        BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed sensible defaults (transactional/important -> email(+sms); informational
-- -> in-app only to control SMS cost). Upsert so re-runs converge.
INSERT INTO public.notification_channel_defaults (type, email, sms) VALUES
  ('deposit_completed',    TRUE,  TRUE),
  ('withdrawal_completed', TRUE,  TRUE),
  ('withdrawal_failed',    TRUE,  TRUE),
  ('kyc_approved',         TRUE,  TRUE),
  ('kyc_rejected',         TRUE,  TRUE),
  ('bet_won',              TRUE,  FALSE),
  ('referral_bonus',       TRUE,  FALSE),
  ('market_resolved',      TRUE,  FALSE),
  ('system_announcement',  TRUE,  FALSE),
  ('market_closing_soon',  FALSE, FALSE),
  ('price_alert',          FALSE, FALSE),
  ('bet_filled',           FALSE, FALSE),
  ('bet_lost',             FALSE, FALSE),
  ('market_created',       FALSE, FALSE)
ON CONFLICT (type) DO UPDATE
  SET email = EXCLUDED.email, sms = EXCLUDED.sms, updated_at = NOW();

-- ------------------------------------------------------------
-- 2. Delivery outbox
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id     UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('email','sms','push')),
  destination         TEXT NOT NULL,                -- email address or E.164 phone captured at enqueue
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sending','sent','failed','skipped')),
  attempts            INT  NOT NULL DEFAULT 0,
  max_attempts        INT  NOT NULL DEFAULT 5,
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error          TEXT,
  provider_message_id TEXT,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One delivery per (notification, channel) — makes enqueue idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_deliveries_nc
  ON public.notification_deliveries (notification_id, channel);
-- The worker's hot path: pending rows due now, oldest first.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_due
  ON public.notification_deliveries (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user
  ON public.notification_deliveries (user_id, created_at DESC);

-- ------------------------------------------------------------
-- 3. Enqueue trigger — fan a new notification out to channels
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_notification_deliveries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email      TEXT;
  v_phone      TEXT;
  v_email_pref BOOLEAN;
  v_sms_pref   BOOLEAN;
  v_def_email  BOOLEAN := FALSE;
  v_def_sms    BOOLEAN := FALSE;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.user_id;
  SELECT phone_number, email_notifications, sms_notifications
    INTO v_phone, v_email_pref, v_sms_pref
    FROM public.profiles WHERE id = NEW.user_id;
  SELECT email, sms INTO v_def_email, v_def_sms
    FROM public.notification_channel_defaults WHERE type = NEW.type;

  -- Email delivery: policy on + user opted in (default on) + address present.
  IF COALESCE(v_def_email, FALSE) AND COALESCE(v_email_pref, TRUE) AND v_email IS NOT NULL THEN
    INSERT INTO public.notification_deliveries (notification_id, user_id, channel, destination)
    VALUES (NEW.id, NEW.user_id, 'email', v_email)
    ON CONFLICT (notification_id, channel) DO NOTHING;
  END IF;

  -- SMS delivery: policy on + user opted in (default on) + phone present.
  IF COALESCE(v_def_sms, FALSE) AND COALESCE(v_sms_pref, TRUE) AND v_phone IS NOT NULL THEN
    INSERT INTO public.notification_deliveries (notification_id, user_id, channel, destination)
    VALUES (NEW.id, NEW.user_id, 'sms', v_phone)
    ON CONFLICT (notification_id, channel) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_notification_deliveries ON public.notifications;
CREATE TRIGGER trg_enqueue_notification_deliveries
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_deliveries();

-- ------------------------------------------------------------
-- 4. Worker RPCs (service-role only)
-- ------------------------------------------------------------
-- Atomically claim a batch of due deliveries: marks them 'sending', increments
-- attempts, and returns the payload the worker needs. SKIP LOCKED lets multiple
-- workers run safely in parallel.
CREATE OR REPLACE FUNCTION public.claim_notification_deliveries(
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id              UUID,
  notification_id UUID,
  user_id         UUID,
  channel         TEXT,
  destination     TEXT,
  attempts        INT,
  max_attempts    INT,
  title           TEXT,
  body            TEXT,
  data            JSONB,
  type            TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT d.id
    FROM public.notification_deliveries d
    WHERE d.status = 'pending'
      AND d.next_attempt_at <= NOW()
      AND d.attempts < d.max_attempts
    ORDER BY d.next_attempt_at
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  )
  UPDATE public.notification_deliveries d
  SET status = 'sending', attempts = d.attempts + 1, updated_at = NOW()
  FROM picked, public.notifications n
  WHERE d.id = picked.id AND n.id = d.notification_id
  RETURNING d.id, d.notification_id, d.user_id, d.channel, d.destination,
            d.attempts, d.max_attempts, n.title, n.body, n.data, n.type::TEXT;
END;
$$;

-- Report the outcome of a delivery attempt. On failure, retries with the given
-- backoff until max_attempts, then marks 'failed'.
CREATE OR REPLACE FUNCTION public.complete_notification_delivery(
  p_id                  UUID,
  p_success             BOOLEAN,
  p_provider_message_id TEXT DEFAULT NULL,
  p_error               TEXT DEFAULT NULL,
  p_backoff_seconds     INT  DEFAULT 300
)
RETURNS public.notification_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.notification_deliveries;
BEGIN
  UPDATE public.notification_deliveries d
  SET status = CASE
        WHEN p_success THEN 'sent'
        WHEN d.attempts >= d.max_attempts THEN 'failed'
        ELSE 'pending'
      END,
      sent_at = CASE WHEN p_success THEN NOW() ELSE d.sent_at END,
      provider_message_id = COALESCE(p_provider_message_id, d.provider_message_id),
      last_error = CASE WHEN p_success THEN NULL ELSE p_error END,
      next_attempt_at = CASE
        WHEN p_success OR d.attempts >= d.max_attempts THEN d.next_attempt_at
        ELSE NOW() + make_interval(secs => GREATEST(COALESCE(p_backoff_seconds, 300), 1))
      END,
      updated_at = NOW()
  WHERE d.id = p_id
  RETURNING d.* INTO v_row;
  RETURN v_row;
END;
$$;

-- ------------------------------------------------------------
-- 5. RLS
-- ------------------------------------------------------------
ALTER TABLE public.notification_deliveries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_channel_defaults ENABLE ROW LEVEL SECURITY;

-- Users may read their own delivery rows (for a future "delivery status" UI);
-- inserts/updates happen only via the trigger and service-role worker.
DROP POLICY IF EXISTS "Own deliveries readable" ON public.notification_deliveries;
CREATE POLICY "Own deliveries readable" ON public.notification_deliveries
  FOR SELECT USING (user_id = auth.uid());

-- Channel defaults: anyone signed in may read; only settings:write may change.
DROP POLICY IF EXISTS "Channel defaults readable" ON public.notification_channel_defaults;
CREATE POLICY "Channel defaults readable" ON public.notification_channel_defaults
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Channel defaults writable" ON public.notification_channel_defaults;
CREATE POLICY "Channel defaults writable" ON public.notification_channel_defaults
  FOR ALL USING (public.has_capability('settings:write'))
  WITH CHECK (public.has_capability('settings:write'));

-- ------------------------------------------------------------
-- 6. Grants — worker RPCs are service-role only
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.claim_notification_deliveries(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_notification_delivery(UUID, BOOLEAN, TEXT, TEXT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.claim_notification_deliveries(INT) TO service_role;
GRANT  EXECUTE ON FUNCTION public.complete_notification_delivery(UUID, BOOLEAN, TEXT, TEXT, INT) TO service_role;

-- ============================================================
-- End migration 015
-- ============================================================
