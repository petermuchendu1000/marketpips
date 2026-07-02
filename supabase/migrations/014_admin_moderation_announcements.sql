-- ============================================================
-- MarketPips - Migration 014: Admin moderation, announcements & audit (Phase F)
-- ============================================================
-- Depends on 001 (profiles, markets, comments, notifications, audit_log,
-- notification_type), 007 (market_search view + search_markets RPC),
-- 008 (roles), 009 (RBAC: has_capability / is_staff / is_superadmin / audit_log
-- read policy), 011/012/013 (admin RPC + audit conventions).
--
-- Implements docs/08-ADMIN.md 4.6 (Moderation) + 4.7 (Announcements) + 4.8
-- (Audit & security) — the final phase (F) of the admin control plane.
--
-- KEY DESIGN DECISIONS
--   * Moderation take-down is enforced at the DATA layer, not just the UI:
--       - markets:  a new `is_hidden` flag. The public markets SELECT policy,
--                   the `market_search` view AND the SECURITY DEFINER
--                   `search_markets` RPC all exclude hidden markets, so a
--                   taken-down market disappears from every read path while
--                   staying visible to its creator + moderators for review.
--                   (We deliberately DO NOT cancel the market — cancelling
--                   refunds bets; hiding is reversible and money-neutral.)
--       - comments: reuse the existing `is_deleted` soft-delete flag.
--       - profiles: reuse `account_status` ('suspended'). Staff/superadmin
--                   profiles are NEVER moderatable (immutability invariant).
--   * Reports: any authenticated user may file a report (self-INSERT, RLS);
--     a partial UNIQUE index stops a user spamming duplicate OPEN reports for
--     the same entity. Moderators read/triage via `moderation:read`.
--   * Announcements: composed as drafts, then `admin_send_announcement` fans
--     out IN-APP notifications (type `system_announcement`) to a segmented
--     audience (country / role / account-status). `sms` / `email` channels are
--     recorded on the row for the Module 9 (Notifications) dispatcher — the
--     deferred tail — so nothing is lost. Send is IDEMPOTENT (status guard).
--   * Audit: audit_log + its `audit:read` RLS policy already exist (001/009).
--     No new table — the audit console reads it directly (RLS-enforced) and a
--     server route streams a CSV export. Every mutation below writes audit_log.
--
-- Security model (mirrors 011/012/013)
--   * Every mutation goes through a SECURITY DEFINER RPC that (1) self-checks
--     the capability via has_capability() (defence in depth over route/page
--     guards + RLS), and (2) writes an audit_log row.
--   * RLS: SELECT gated by has_capability() (+ self-read for own reports).
--     Writes are RPC/service-role only, except a narrow self-file INSERT on
--     content_reports.
-- ============================================================

-- ------------------------------------------------------------
-- 1. markets: moderation take-down flag (reversible, money-neutral)
-- ------------------------------------------------------------
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS is_hidden     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by     UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- Partial index: cheap lookup of the (rare) hidden set for the moderation console.
CREATE INDEX IF NOT EXISTS idx_markets_hidden
  ON public.markets (hidden_at DESC) WHERE is_hidden;

-- ------------------------------------------------------------
-- 2. content_reports - user-filed reports triaged by moderators
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('market','comment','profile')),
  entity_id       UUID NOT NULL,
  reporter_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason          TEXT NOT NULL CHECK (reason IN
                    ('spam','abuse','harassment','fraud','illegal','misinformation','other')),
  details         TEXT CHECK (details IS NULL OR LENGTH(details) <= 2000),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','reviewing','actioned','dismissed')),
  resolution      TEXT,           -- 'taken_down' | 'restored' | 'warned' | 'no_action' | free text
  resolution_note TEXT,
  handled_by      UUID REFERENCES public.profiles(id),
  handled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status  ON public.content_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reports_entity  ON public.content_reports (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter ON public.content_reports (reporter_id);
-- One OPEN/REVIEWING report per (reporter, entity): stops duplicate-report spam.
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_reports_open
  ON public.content_reports (reporter_id, entity_type, entity_id)
  WHERE status IN ('open','reviewing');

-- ------------------------------------------------------------
-- 3. announcements - composed broadcasts, segmented & audited
-- ------------------------------------------------------------
-- audience JSONB shape (all keys optional; empty/absent = no filter on that key):
--   { "countries": ["KE","UG"],      -- ISO alpha-2; matches profiles.country_code
--     "roles":     ["user","creator"],-- matches profiles.role
--     "statuses":  ["active"] }        -- matches profiles.account_status (default ['active'])
CREATE TABLE IF NOT EXISTS public.announcements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL CHECK (LENGTH(title) BETWEEN 1 AND 200),
  body            TEXT NOT NULL CHECK (LENGTH(body) BETWEEN 1 AND 5000),
  channels        TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
  audience        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','sending','sent','cancelled')),
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  recipient_count INT NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_status ON public.announcements (status, created_at DESC);

-- ============================================================
-- 4. Refresh public read paths so hidden markets disappear everywhere
-- ============================================================

-- 4a. Public markets SELECT policy — exclude hidden from the public, keep them
--     visible to the market's creator, admins, and moderators (review/restore).
DROP POLICY IF EXISTS "Active markets are publicly viewable" ON public.markets;
CREATE POLICY "Active markets are publicly viewable" ON public.markets
  FOR SELECT USING (
    (status IN ('active', 'closed', 'resolved') AND is_hidden = FALSE)
    OR auth.uid() = creator_id
    OR public.is_admin()
    OR public.has_capability('moderation:read')
  );

-- 4b. market_search convenience view — mirror 007, add the hidden filter.
CREATE OR REPLACE VIEW public.market_search AS
SELECT
  m.id, m.slug, m.title, m.description, m.category, m.status,
  m.yes_price, m.no_price, m.total_volume_usd, m.unique_bettors,
  m.closes_at, m.is_featured, m.is_trending, m.tags, m.cover_image_url,
  m.created_at, m.search_vector
FROM public.markets m
WHERE m.status IN ('active', 'closed', 'resolved')
  AND m.is_hidden = FALSE;

-- 4c. search_markets() RPC — identical to 007 plus `AND m.is_hidden = FALSE`
--     in the base CTE so taken-down markets never surface in search.
CREATE OR REPLACE FUNCTION public.search_markets(
  p_query    text DEFAULT '',
  p_category text DEFAULT NULL,
  p_status   text DEFAULT 'active',    -- 'active' | 'closed' | 'resolved' | 'all'
  p_sort     text DEFAULT 'relevance', -- relevance | volume | newest | closing | bettors
  p_limit    int  DEFAULT 20,
  p_offset   int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET pg_trgm.word_similarity_threshold = 0.3
AS $$
DECLARE
  v_limit    int  := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset   int  := GREATEST(COALESCE(p_offset, 0), 0);
  v_query    text := btrim(COALESCE(p_query, ''));
  v_sort     text := lower(COALESCE(p_sort, 'relevance'));
  v_ts       tsquery;
  v_cat      market_category;
  v_statuses market_status[];
  v_total    bigint := 0;
  v_data     jsonb  := '[]'::jsonb;
BEGIN
  IF v_sort NOT IN ('relevance', 'volume', 'newest', 'closing', 'bettors') THEN
    v_sort := 'relevance';
  END IF;

  -- Restrict to publicly-visible statuses only.
  v_statuses := CASE lower(COALESCE(p_status, 'active'))
    WHEN 'all'      THEN ARRAY['active','closed','resolved']::market_status[]
    WHEN 'closed'   THEN ARRAY['closed']::market_status[]
    WHEN 'resolved' THEN ARRAY['resolved']::market_status[]
    ELSE ARRAY['active']::market_status[]
  END;

  IF p_category IS NOT NULL AND lower(p_category) NOT IN ('', 'all') THEN
    BEGIN
      v_cat := p_category::market_category;
    EXCEPTION WHEN others THEN
      v_cat := NULL;  -- unknown category -> no category filter
    END;
  END IF;

  IF v_query <> '' THEN
    v_ts := websearch_to_tsquery('english', v_query);
  END IF;

  WITH base AS (
    SELECT
      m.id, m.slug, m.title, m.description, m.category, m.status,
      m.yes_price, m.no_price, m.total_volume_usd, m.unique_bettors,
      m.total_bets, m.closes_at, m.resolved_outcome, m.is_featured,
      m.is_trending, m.tags, m.cover_image_url, m.created_at,
      CASE
        WHEN v_ts IS NULL THEN 0::real
        ELSE ts_rank_cd(m.search_vector, v_ts)
             + word_similarity(v_query, m.title) * 0.4
      END AS relevance
    FROM public.markets m
    WHERE m.status = ANY (v_statuses)
      AND m.is_hidden = FALSE
      AND (v_cat IS NULL OR m.category = v_cat)
      AND (
        v_ts IS NULL
        OR m.search_vector @@ v_ts
        OR (length(v_query) >= 3 AND v_query <% m.title)  -- word-trigram fuzzy fallback (typo tolerant)
      )
  ),
  windowed AS (
    SELECT
      b.*,
      count(*) OVER () AS total_count,
      row_number() OVER (
        ORDER BY
          (CASE WHEN v_sort = 'relevance' THEN b.relevance END) DESC NULLS LAST,
          (CASE WHEN v_sort = 'volume'    THEN b.total_volume_usd END) DESC NULLS LAST,
          (CASE WHEN v_sort = 'newest'    THEN extract(epoch FROM b.created_at) END) DESC NULLS LAST,
          (CASE WHEN v_sort = 'bettors'   THEN b.unique_bettors::numeric END) DESC NULLS LAST,
          (CASE WHEN v_sort = 'closing'   THEN extract(epoch FROM b.closes_at) END) ASC NULLS LAST,
          b.total_volume_usd DESC, b.created_at DESC, b.id
      ) AS rn
    FROM base b
  )
  SELECT
    COALESCE(
      jsonb_agg((to_jsonb(w) - 'rn' - 'total_count') ORDER BY w.rn)
        FILTER (WHERE w.rn > v_offset AND w.rn <= v_offset + v_limit),
      '[]'::jsonb
    ),
    COALESCE(max(w.total_count), 0)
  INTO v_data, v_total
  FROM windowed w;

  RETURN jsonb_build_object(
    'data',   v_data,
    'total',  v_total,
    'limit',  v_limit,
    'offset', v_offset,
    'sort',   v_sort,
    'query',  v_query
  );
END;
$$;

-- ============================================================
-- 5. Audience segmentation helpers (announcements)
-- ============================================================
-- Resolve an audience spec to the set of matching profile ids. SECURITY DEFINER
-- so the send RPC can enumerate recipients regardless of the caller's RLS scope;
-- callers reach it only through the audited announcements RPCs.
CREATE OR REPLACE FUNCTION public.announcement_recipients(p_audience JSONB)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH spec AS (
    SELECT
      CASE WHEN jsonb_typeof(p_audience->'countries') = 'array'
                AND jsonb_array_length(p_audience->'countries') > 0
           THEN ARRAY(SELECT upper(jsonb_array_elements_text(p_audience->'countries'))) END AS countries,
      CASE WHEN jsonb_typeof(p_audience->'roles') = 'array'
                AND jsonb_array_length(p_audience->'roles') > 0
           THEN ARRAY(SELECT jsonb_array_elements_text(p_audience->'roles')) END AS roles,
      CASE WHEN jsonb_typeof(p_audience->'statuses') = 'array'
                AND jsonb_array_length(p_audience->'statuses') > 0
           THEN ARRAY(SELECT jsonb_array_elements_text(p_audience->'statuses'))
           ELSE ARRAY['active'] END AS statuses
  )
  SELECT p.id
  FROM public.profiles p, spec s
  WHERE (s.countries IS NULL OR p.country_code = ANY (s.countries))
    AND (s.roles     IS NULL OR p.role::text    = ANY (s.roles))
    AND (p.account_status::text = ANY (s.statuses));
$$;

CREATE OR REPLACE FUNCTION public.announcement_audience_count(p_audience JSONB)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint FROM public.announcement_recipients(p_audience);
$$;

-- ============================================================
-- 6. MODERATION RPCs (capability: moderation:action) - all audited
-- ============================================================

-- Take down / restore a piece of content. Enforcement per entity type:
--   market  -> is_hidden flag (reversible, money-neutral)
--   comment -> is_deleted soft-delete
--   profile -> account_status suspended|active (staff/superadmin immutable)
CREATE OR REPLACE FUNCTION public.admin_moderate_content(
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_action      TEXT,           -- 'take_down' | 'restore'
  p_reason      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role user_role;
  v_old JSONB;
  v_new JSONB;
BEGIN
  IF NOT public.has_capability('moderation:action') THEN
    RAISE EXCEPTION 'Insufficient permissions (moderation:action required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_entity_type NOT IN ('market','comment','profile') THEN
    RAISE EXCEPTION 'entity_type must be market|comment|profile' USING ERRCODE = 'check_violation';
  END IF;
  IF p_action NOT IN ('take_down','restore') THEN
    RAISE EXCEPTION 'action must be take_down|restore' USING ERRCODE = 'check_violation';
  END IF;

  IF p_entity_type = 'market' THEN
    SELECT jsonb_build_object('is_hidden', is_hidden) INTO v_old
      FROM public.markets WHERE id = p_entity_id FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Market not found' USING ERRCODE = 'no_data_found'; END IF;
    UPDATE public.markets SET
      is_hidden     = (p_action = 'take_down'),
      hidden_at     = CASE WHEN p_action = 'take_down' THEN NOW() ELSE NULL END,
      hidden_by     = CASE WHEN p_action = 'take_down' THEN auth.uid() ELSE NULL END,
      hidden_reason = CASE WHEN p_action = 'take_down' THEN p_reason ELSE NULL END,
      updated_at    = NOW()
    WHERE id = p_entity_id;
    v_new := jsonb_build_object('is_hidden', p_action = 'take_down');

  ELSIF p_entity_type = 'comment' THEN
    SELECT jsonb_build_object('is_deleted', is_deleted) INTO v_old
      FROM public.comments WHERE id = p_entity_id FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Comment not found' USING ERRCODE = 'no_data_found'; END IF;
    UPDATE public.comments SET
      is_deleted = (p_action = 'take_down'),
      updated_at = NOW()
    WHERE id = p_entity_id;
    v_new := jsonb_build_object('is_deleted', p_action = 'take_down');

  ELSE -- profile
    SELECT role, jsonb_build_object('account_status', account_status)
      INTO v_target_role, v_old
      FROM public.profiles WHERE id = p_entity_id FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'no_data_found'; END IF;
    -- Never moderate a staff/superadmin account (immutability invariant).
    IF v_target_role IN ('support','finance','moderator','admin','superadmin') THEN
      RAISE EXCEPTION 'Staff accounts cannot be moderated here' USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE public.profiles SET
      account_status = CASE WHEN p_action = 'take_down' THEN 'suspended'::account_status
                            ELSE 'active'::account_status END,
      updated_at = NOW()
    WHERE id = p_entity_id;
    v_new := jsonb_build_object('account_status',
              CASE WHEN p_action = 'take_down' THEN 'suspended' ELSE 'active' END);
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(),
          CASE WHEN p_action = 'take_down' THEN 'moderation.take_down' ELSE 'moderation.restore' END,
          p_entity_type, p_entity_id, v_old,
          v_new || jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id,
                            'action', p_action, 'before', v_old, 'after', v_new);
END;
$$;

-- Triage/resolve a report (open -> reviewing | actioned | dismissed).
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id  UUID,
  p_status     TEXT,             -- 'reviewing' | 'actioned' | 'dismissed'
  p_resolution TEXT DEFAULT NULL,
  p_note       TEXT DEFAULT NULL
)
RETURNS public.content_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.content_reports%ROWTYPE;
  v_row public.content_reports%ROWTYPE;
BEGIN
  IF NOT public.has_capability('moderation:action') THEN
    RAISE EXCEPTION 'Insufficient permissions (moderation:action required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('reviewing','actioned','dismissed') THEN
    RAISE EXCEPTION 'status must be reviewing|actioned|dismissed' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_old FROM public.content_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found' USING ERRCODE = 'no_data_found'; END IF;

  UPDATE public.content_reports SET
    status          = p_status,
    resolution      = COALESCE(p_resolution, resolution),
    resolution_note = COALESCE(p_note, resolution_note),
    handled_by      = CASE WHEN p_status IN ('actioned','dismissed') THEN auth.uid() ELSE handled_by END,
    handled_at      = CASE WHEN p_status IN ('actioned','dismissed') THEN NOW() ELSE handled_at END,
    updated_at      = NOW()
  WHERE id = p_report_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'moderation.resolve_report', 'content_report', p_report_id,
          jsonb_build_object('status', v_old.status),
          jsonb_build_object('status', p_status, 'resolution', p_resolution, 'note', p_note));
  RETURN v_row;
END;
$$;

-- ============================================================
-- 7. ANNOUNCEMENT RPCs (capability: announcements:send) - all audited
-- ============================================================

-- Create or update a draft/scheduled announcement.
CREATE OR REPLACE FUNCTION public.admin_upsert_announcement(
  p_id           UUID,            -- NULL to create
  p_title        TEXT,
  p_body         TEXT,
  p_channels     TEXT[] DEFAULT ARRAY['in_app']::TEXT[],
  p_audience     JSONB  DEFAULT '{}'::jsonb,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.announcements%ROWTYPE;
  v_row public.announcements%ROWTYPE;
  v_status TEXT;
  v_channels TEXT[];
BEGIN
  IF NOT public.has_capability('announcements:send') THEN
    RAISE EXCEPTION 'Insufficient permissions (announcements:send required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Sanitise channels to the known set; always keep in_app as the baseline.
  v_channels := ARRAY(
    SELECT DISTINCT c FROM unnest(COALESCE(p_channels, ARRAY['in_app']::TEXT[])) c
    WHERE c IN ('in_app','sms','email')
  );
  IF array_length(v_channels, 1) IS NULL THEN v_channels := ARRAY['in_app']::TEXT[]; END IF;

  v_status := CASE WHEN p_scheduled_at IS NOT NULL AND p_scheduled_at > NOW()
                   THEN 'scheduled' ELSE 'draft' END;

  IF p_id IS NULL THEN
    INSERT INTO public.announcements (title, body, channels, audience, status, scheduled_at, created_by)
    VALUES (p_title, p_body, v_channels, COALESCE(p_audience, '{}'::jsonb), v_status, p_scheduled_at, auth.uid())
    RETURNING * INTO v_row;
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
    VALUES (auth.uid(), 'announcement.create', 'announcement', v_row.id,
            jsonb_build_object('title', p_title, 'channels', v_channels, 'status', v_status));
  ELSE
    SELECT * INTO v_old FROM public.announcements WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'no_data_found'; END IF;
    IF v_old.status IN ('sent','sending') THEN
      RAISE EXCEPTION 'A sent/sending announcement cannot be edited' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.announcements SET
      title = p_title, body = p_body, channels = v_channels,
      audience = COALESCE(p_audience, '{}'::jsonb),
      status = v_status, scheduled_at = p_scheduled_at, updated_at = NOW()
    WHERE id = p_id
    RETURNING * INTO v_row;
    INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (auth.uid(), 'announcement.update', 'announcement', p_id,
            jsonb_build_object('title', v_old.title, 'status', v_old.status),
            jsonb_build_object('title', p_title, 'channels', v_channels, 'status', v_status));
  END IF;
  RETURN v_row;
END;
$$;

-- Send an announcement NOW: fan out in-app notifications to the segmented
-- audience and mark it sent. Idempotent (only draft/scheduled may be sent).
CREATE OR REPLACE FUNCTION public.admin_send_announcement(p_id UUID)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   public.announcements%ROWTYPE;
  v_count INT := 0;
BEGIN
  IF NOT public.has_capability('announcements:send') THEN
    RAISE EXCEPTION 'Insufficient permissions (announcements:send required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM public.announcements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_row.status NOT IN ('draft','scheduled') THEN
    -- Idempotent: already sent/sending/cancelled -> no double delivery.
    RETURN v_row;
  END IF;

  -- In-app delivery: one notification per matching recipient.
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT r, 'system_announcement', v_row.title, v_row.body,
         jsonb_build_object('announcement_id', v_row.id, 'channels', v_row.channels)
  FROM public.announcement_recipients(v_row.audience) r;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.announcements SET
    status = 'sent', sent_at = NOW(), recipient_count = v_count, updated_at = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (auth.uid(), 'announcement.send', 'announcement', p_id,
          jsonb_build_object('recipient_count', v_count, 'channels', v_row.channels));
  RETURN v_row;
END;
$$;

-- Cancel a draft/scheduled announcement.
CREATE OR REPLACE FUNCTION public.admin_set_announcement_status(
  p_id     UUID,
  p_status TEXT             -- currently only 'cancelled'
)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.announcements%ROWTYPE;
  v_row public.announcements%ROWTYPE;
BEGIN
  IF NOT public.has_capability('announcements:send') THEN
    RAISE EXCEPTION 'Insufficient permissions (announcements:send required)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'Only cancellation is supported here' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_old FROM public.announcements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Announcement not found' USING ERRCODE = 'no_data_found'; END IF;
  IF v_old.status IN ('sent','sending') THEN
    RAISE EXCEPTION 'A sent/sending announcement cannot be cancelled' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.announcements SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_id RETURNING * INTO v_row;

  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), 'announcement.cancel', 'announcement', p_id,
          jsonb_build_object('status', v_old.status),
          jsonb_build_object('status', 'cancelled'));
  RETURN v_row;
END;
$$;

-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements   ENABLE ROW LEVEL SECURITY;

-- content_reports: moderators read all; a user reads their own filings.
DROP POLICY IF EXISTS "Reports readable" ON public.content_reports;
CREATE POLICY "Reports readable" ON public.content_reports
  FOR SELECT USING (public.has_capability('moderation:read') OR reporter_id = auth.uid());

-- content_reports: any authenticated user may file a report about content.
DROP POLICY IF EXISTS "Reports self-file" ON public.content_reports;
CREATE POLICY "Reports self-file" ON public.content_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid() AND status = 'open');

-- announcements: only operators with announcements:send may read (drafts are
-- internal; delivery to users happens via notifications, not this table).
DROP POLICY IF EXISTS "Announcements readable" ON public.announcements;
CREATE POLICY "Announcements readable" ON public.announcements
  FOR SELECT USING (public.has_capability('announcements:send'));

-- ============================================================
-- 9. GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.announcement_recipients(JSONB)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.announcement_audience_count(JSONB)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_content(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(UUID, TEXT, TEXT, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_announcement(UUID, TEXT, TEXT, TEXT[], JSONB, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_send_announcement(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_announcement_status(UUID, TEXT) TO authenticated;

-- ============================================================
-- End migration 014
-- ============================================================
