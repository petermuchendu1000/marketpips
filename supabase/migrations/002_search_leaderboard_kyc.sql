-- ============================================================
-- MarketPips - Migration 002
-- Adds: KYC storage bucket policies, search indexes, additional
--       profile stats triggers, admin KYC review workflow
-- ============================================================

-- ============================================================
-- FULL-TEXT SEARCH VIEW
-- ============================================================
CREATE OR REPLACE VIEW public.market_search AS
SELECT
  m.id,
  m.slug,
  m.title,
  m.description,
  m.category,
  m.status,
  m.yes_price,
  m.no_price,
  m.total_volume_usd,
  m.unique_bettors,
  m.closes_at,
  m.is_featured,
  m.is_trending,
  m.tags,
  m.cover_image_url,
  m.created_at,
  to_tsvector('english', m.title || ' ' || m.description || ' ' || array_to_string(m.tags, ' ')) AS search_vector
FROM public.markets m
WHERE m.status IN ('active', 'closed', 'resolved');

-- ============================================================
-- PROFILE STATS UPDATER
-- Trigger to keep profile stats in sync after order fills
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_profile_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'bet_won' AND NEW.status = 'completed' THEN
    UPDATE public.profiles SET
      total_wins = total_wins + 1,
      profit_loss_usd = profit_loss_usd + NEW.amount_usd,
      win_rate = CASE
        WHEN total_bets > 0 THEN (total_wins + 1)::DECIMAL / total_bets
        ELSE 0
      END,
      updated_at = NOW()
    WHERE id = NEW.user_id;
  ELSIF NEW.type = 'bet_placed' AND NEW.status = 'completed' THEN
    UPDATE public.profiles SET
      total_bets = total_bets + 1,
      total_volume_usd = total_volume_usd + NEW.amount_usd,
      profit_loss_usd = profit_loss_usd - NEW.amount_usd,
      updated_at = NOW()
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_profile_stats_on_transaction
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION public.update_profile_stats();

-- ============================================================
-- UNIQUE_BETTORS UPDATER on markets
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_unique_bettors()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.markets SET
    unique_bettors = (
      SELECT COUNT(DISTINCT user_id)
      FROM public.orders
      WHERE market_id = NEW.market_id AND status = 'filled'
    ),
    updated_at = NOW()
  WHERE id = NEW.market_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_unique_bettors_after_order
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_unique_bettors();

-- ============================================================
-- KYC ADMIN REVIEW FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_review_kyc(
  p_doc_id UUID,
  p_status kyc_status,
  p_reviewer_id UUID,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_doc public.kyc_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM public.kyc_documents
  WHERE id = p_doc_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'KYC document not found';
  END IF;

  UPDATE public.kyc_documents SET
    status = p_status,
    reviewed_by = p_reviewer_id,
    reviewed_at = NOW(),
    rejection_reason = p_rejection_reason,
    updated_at = NOW()
  WHERE id = p_doc_id;

  -- Update profile KYC status
  UPDATE public.profiles SET
    kyc_status = p_status,
    kyc_completed_at = CASE WHEN p_status = 'verified' THEN NOW() ELSE kyc_completed_at END,
    updated_at = NOW()
  WHERE id = v_doc.user_id;

  -- Notification
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_doc.user_id,
    CASE WHEN p_status = 'verified' THEN 'kyc_approved' ELSE 'kyc_rejected' END,
    CASE WHEN p_status = 'verified' THEN '✅ Identity Verified' ELSE '⛔ KYC Rejected' END,
    CASE WHEN p_status = 'verified'
      THEN 'Your identity has been verified. You now have full platform access.'
      ELSE COALESCE('Rejection reason: ' || p_rejection_reason, 'Your KYC was rejected. Please resubmit.')
    END,
    jsonb_build_object(
      'kyc_doc_id', p_doc_id,
      'status', p_status,
      'rejection_reason', p_rejection_reason
    )
  );

  -- Audit log
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  VALUES (
    p_reviewer_id,
    'kyc_review',
    'kyc_documents',
    p_doc_id,
    jsonb_build_object('status', p_status, 'reason', p_rejection_reason)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_doc.user_id,
    'status', p_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- LEADERBOARD MATERIALIZED VIEW (refresh every hour via cron)
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.leaderboard AS
SELECT
  p.id,
  p.display_name,
  p.username,
  p.avatar_url,
  p.total_bets,
  p.total_wins,
  p.win_rate,
  p.profit_loss_usd,
  p.total_volume_usd,
  RANK() OVER (ORDER BY p.total_volume_usd DESC) AS volume_rank,
  RANK() OVER (ORDER BY p.win_rate DESC) AS winrate_rank,
  RANK() OVER (ORDER BY p.profit_loss_usd DESC) AS pnl_rank
FROM public.profiles p
WHERE p.account_status = 'active'
  AND p.total_bets > 0
ORDER BY p.total_volume_usd DESC
LIMIT 100;

CREATE UNIQUE INDEX ON public.leaderboard(id);

-- Function to refresh leaderboard
CREATE OR REPLACE FUNCTION public.refresh_leaderboard()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SUPABASE STORAGE BUCKET POLICIES (run after bucket creation)
-- ============================================================

-- KYC documents: only owner + admin can read
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  FALSE,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'market-covers',
  'market-covers',
  TRUE,
  2097152,  -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- KYC storage policies
CREATE POLICY "Users can upload own KYC docs" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'kyc-documents'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can read own KYC docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kyc-documents'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins can read all KYC docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kyc-documents'
    AND public.is_admin()
  );

-- Market cover images: anyone can read, authenticated can upload
CREATE POLICY "Anyone can view market covers" ON storage.objects
  FOR SELECT USING (bucket_id = 'market-covers');

CREATE POLICY "Authenticated users can upload market covers" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'market-covers'
    AND auth.uid() IS NOT NULL
  );

-- ============================================================
-- CRON JOB SETUP (pg_cron extension — requires Supabase Pro)
-- Uncomment and run on Pro plan:
-- ============================================================
-- SELECT cron.schedule('refresh-leaderboard', '0 * * * *', $$SELECT public.refresh_leaderboard()$$);
-- SELECT cron.schedule('close-expired-markets', '*/5 * * * *', $$
--   UPDATE public.markets SET status = 'closed' WHERE status = 'active' AND closes_at < NOW()
-- $$);
