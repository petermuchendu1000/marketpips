-- ============================================================
-- MarketPips - Complete Supabase Schema
-- Migration: 001_initial_schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for text search

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator', 'resolver');
CREATE TYPE kyc_status AS ENUM ('unverified', 'pending', 'verified', 'rejected');
CREATE TYPE account_status AS ENUM ('active', 'suspended', 'closed');

CREATE TYPE market_status AS ENUM (
  'draft',          -- created but not visible
  'pending',        -- submitted, awaiting approval
  'active',         -- live and accepting bets
  'closed',         -- betting closed, awaiting resolution
  'resolved',       -- winner determined
  'disputed',       -- under dispute
  'cancelled'       -- cancelled, all bets refunded
);

CREATE TYPE market_category AS ENUM (
  'politics',
  'sports',
  'economics',
  'crypto',
  'technology',
  'entertainment',
  'weather',
  'governance',
  'elections',
  'business',
  'health',
  'social',
  'other'
);

CREATE TYPE market_resolution_type AS ENUM (
  'binary',         -- YES/NO outcome
  'multiple_choice' -- pick from several options (future)
);

CREATE TYPE order_side AS ENUM ('yes', 'no');
CREATE TYPE order_type AS ENUM ('market', 'limit');
CREATE TYPE order_status AS ENUM ('open', 'filled', 'partially_filled', 'cancelled', 'expired');

CREATE TYPE position_side AS ENUM ('yes', 'no');

CREATE TYPE transaction_type AS ENUM (
  'deposit',
  'withdrawal',
  'bet_placed',
  'bet_won',
  'bet_lost',
  'bet_refunded',
  'fee',
  'bonus',
  'referral_bonus',
  'creator_reward'
);

CREATE TYPE transaction_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');

CREATE TYPE payment_provider AS ENUM (
  'mpesa',          -- Safaricom M-Pesa (Kenya)
  'mtn_momo',       -- MTN Mobile Money (Uganda, Rwanda, Ghana)
  'airtel_money',   -- Airtel Money (Tanzania, Uganda, Kenya, Rwanda)
  'pesapal',        -- Multi-currency East Africa
  'bank_transfer',  -- Direct bank transfer
  'internal'        -- Internal transfers between accounts
);

CREATE TYPE currency_code AS ENUM ('KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'ETB', 'BIF', 'USD');

CREATE TYPE notification_type AS ENUM (
  'market_created',
  'market_resolved',
  'bet_filled',
  'bet_won',
  'bet_lost',
  'deposit_completed',
  'withdrawal_completed',
  'withdrawal_failed',
  'price_alert',
  'market_closing_soon',
  'referral_bonus',
  'kyc_approved',
  'kyc_rejected',
  'system_announcement'
);

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  phone_number TEXT UNIQUE,
  country_code CHAR(2) DEFAULT 'KE', -- ISO 3166-1 alpha-2
  preferred_currency currency_code DEFAULT 'KES',
  role user_role DEFAULT 'user',
  kyc_status kyc_status DEFAULT 'unverified',
  kyc_completed_at TIMESTAMPTZ,
  account_status account_status DEFAULT 'active',

  -- Referral system
  referral_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  referred_by UUID REFERENCES public.profiles(id),
  referral_count INTEGER DEFAULT 0,

  -- Stats (denormalized for performance)
  total_volume_usd DECIMAL(20,6) DEFAULT 0,
  total_bets INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  win_rate DECIMAL(5,4) DEFAULT 0, -- 0.0000 to 1.0000
  profit_loss_usd DECIMAL(20,6) DEFAULT 0,

  -- Notifications
  email_notifications BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT FALSE,

  -- Metadata
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WALLETS (one per user per currency)
-- ============================================================
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  currency currency_code NOT NULL,

  available_balance DECIMAL(20,6) DEFAULT 0 CHECK (available_balance >= 0),
  reserved_balance DECIMAL(20,6) DEFAULT 0 CHECK (reserved_balance >= 0), -- locked in open orders/bets
  total_deposited DECIMAL(20,6) DEFAULT 0,
  total_withdrawn DECIMAL(20,6) DEFAULT 0,
  total_won DECIMAL(20,6) DEFAULT 0,
  total_lost DECIMAL(20,6) DEFAULT 0,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, currency)
);

-- ============================================================
-- MARKETS
-- ============================================================
CREATE TABLE public.markets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category market_category NOT NULL DEFAULT 'other',
  resolution_type market_resolution_type DEFAULT 'binary',

  -- Creator
  creator_id UUID NOT NULL REFERENCES public.profiles(id),
  creator_reward_rate DECIMAL(5,4) DEFAULT 0.0025, -- 0.25% of volume

  -- Status & timing
  status market_status DEFAULT 'draft',
  opens_at TIMESTAMPTZ DEFAULT NOW(),
  closes_at TIMESTAMPTZ NOT NULL,
  resolves_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  -- Resolution
  resolver_id UUID REFERENCES public.profiles(id),
  resolution_source TEXT,           -- URL/reference for resolution
  resolution_criteria TEXT NOT NULL, -- clear criteria for YES
  resolved_outcome order_side,       -- 'yes' or 'no'
  resolution_notes TEXT,

  -- Pricing & liquidity (LMSR/parimutuel hybrid)
  yes_price DECIMAL(8,6) DEFAULT 0.500000 CHECK (yes_price >= 0 AND yes_price <= 1),
  no_price DECIMAL(8,6) DEFAULT 0.500000 CHECK (no_price >= 0 AND no_price <= 1),

  -- Liquidity pool
  liquidity_pool_usd DECIMAL(20,6) DEFAULT 0,
  initial_liquidity_usd DECIMAL(20,6) DEFAULT 100, -- platform seeds this

  -- Volume & activity
  total_volume_usd DECIMAL(20,6) DEFAULT 0,
  yes_volume_usd DECIMAL(20,6) DEFAULT 0,
  no_volume_usd DECIMAL(20,6) DEFAULT 0,
  total_bets INTEGER DEFAULT 0,
  unique_bettors INTEGER DEFAULT 0,

  -- Fees
  platform_fee_rate DECIMAL(5,4) DEFAULT 0.0200, -- 2% default

  -- Visibility & moderation
  is_featured BOOLEAN DEFAULT FALSE,
  is_trending BOOLEAN DEFAULT FALSE,
  featured_order INTEGER,
  tags TEXT[] DEFAULT '{}',
  cover_image_url TEXT,

  -- Geo restrictions (ISO 3166-1 alpha-2 codes)
  allowed_countries TEXT[] DEFAULT '{"KE","TZ","UG","RW","ZM","ET","BI"}',

  -- Metadata
  view_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MARKET OPTIONS (for multiple choice markets, future)
-- ============================================================
CREATE TABLE public.market_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT,
  price DECIMAL(8,6) DEFAULT 0.5,
  volume_usd DECIMAL(20,6) DEFAULT 0,
  is_winner BOOLEAN,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRICE HISTORY (for charts)
-- ============================================================
CREATE TABLE public.price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  yes_price DECIMAL(8,6) NOT NULL,
  no_price DECIMAL(8,6) NOT NULL,
  volume_usd DECIMAL(20,6) DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient chart queries
CREATE INDEX idx_price_history_market_time ON public.price_history(market_id, recorded_at DESC);

-- ============================================================
-- ORDERS (limit orders on the order book)
-- ============================================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES public.markets(id),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),

  side order_side NOT NULL,
  type order_type DEFAULT 'market',
  status order_status DEFAULT 'open',

  -- Amounts in market's native currency (USD equivalent)
  amount_usd DECIMAL(20,6) NOT NULL CHECK (amount_usd > 0),
  filled_usd DECIMAL(20,6) DEFAULT 0,
  remaining_usd DECIMAL(20,6) GENERATED ALWAYS AS (amount_usd - filled_usd) STORED,

  -- Currency paid (local currency)
  currency currency_code NOT NULL,
  amount_local DECIMAL(20,2) NOT NULL CHECK (amount_local > 0),
  exchange_rate_to_usd DECIMAL(20,8) NOT NULL,

  -- Pricing
  limit_price DECIMAL(8,6), -- NULL for market orders
  avg_fill_price DECIMAL(8,6) DEFAULT 0,

  -- Shares (how many shares of YES/NO bought)
  shares DECIMAL(20,6) DEFAULT 0,
  potential_payout_usd DECIMAL(20,6) DEFAULT 0,

  -- Fees
  fee_usd DECIMAL(20,6) DEFAULT 0,
  fee_local DECIMAL(20,2) DEFAULT 0,

  -- Expiry
  expires_at TIMESTAMPTZ,

  -- Tracking
  transaction_id UUID, -- references transactions
  client_order_id TEXT UNIQUE, -- idempotency key from client

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- POSITIONS (aggregated holdings per user per market)
-- ============================================================
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  market_id UUID NOT NULL REFERENCES public.markets(id),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),

  side position_side NOT NULL,
  shares DECIMAL(20,6) DEFAULT 0 CHECK (shares >= 0),

  -- Cost basis
  total_invested_usd DECIMAL(20,6) DEFAULT 0,
  avg_entry_price DECIMAL(8,6) DEFAULT 0,

  -- Current value
  current_value_usd DECIMAL(20,6) DEFAULT 0,
  unrealized_pnl_usd DECIMAL(20,6) DEFAULT 0,

  -- Realized
  realized_pnl_usd DECIMAL(20,6) DEFAULT 0,
  total_payout_usd DECIMAL(20,6) DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  claimed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, market_id, side)
);

-- ============================================================
-- TRANSACTIONS (all money movements)
-- ============================================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),

  type transaction_type NOT NULL,
  status transaction_status DEFAULT 'pending',

  -- Amounts
  amount DECIMAL(20,6) NOT NULL,
  currency currency_code NOT NULL,
  amount_usd DECIMAL(20,6) NOT NULL,
  exchange_rate_to_usd DECIMAL(20,8) NOT NULL,

  -- Fee breakdown
  fee_amount DECIMAL(20,6) DEFAULT 0,
  fee_currency currency_code,
  net_amount DECIMAL(20,6) GENERATED ALWAYS AS (amount - fee_amount) STORED,

  -- Balance snapshot
  balance_before DECIMAL(20,6) NOT NULL,
  balance_after DECIMAL(20,6) NOT NULL,

  -- References
  order_id UUID REFERENCES public.orders(id),
  market_id UUID REFERENCES public.markets(id),
  payment_reference TEXT,       -- external payment ref (M-Pesa code, etc.)
  provider_reference TEXT,      -- provider's transaction ID
  idempotency_key TEXT UNIQUE,  -- prevent duplicate transactions

  -- Payment details
  payment_provider payment_provider,
  payment_phone TEXT,           -- phone used for mobile money
  payment_metadata JSONB DEFAULT '{}', -- raw provider response

  description TEXT,
  notes TEXT,                   -- admin notes

  -- Timestamps
  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEPOSITS (mobile money deposit requests)
-- ============================================================
CREATE TABLE public.deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),
  transaction_id UUID REFERENCES public.transactions(id),

  status transaction_status DEFAULT 'pending',
  provider payment_provider NOT NULL,

  amount DECIMAL(20,2) NOT NULL CHECK (amount > 0),
  currency currency_code NOT NULL,
  phone_number TEXT NOT NULL,

  -- Provider-specific fields
  checkout_request_id TEXT,     -- M-Pesa STK push ID
  merchant_request_id TEXT,     -- M-Pesa merchant ID
  mtn_reference_id TEXT,        -- MTN MoMo reference
  airtel_reference TEXT,        -- Airtel Money reference
  pesapal_order_id TEXT,        -- PesaPal order ID
  provider_receipt TEXT,        -- Confirmation receipt number

  -- Exchange rate at time of deposit
  exchange_rate_to_usd DECIMAL(20,8),

  -- Retry / expiry
  retry_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes'),

  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,

  raw_callback JSONB,           -- store raw provider callback
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WITHDRAWALS
-- ============================================================
CREATE TABLE public.withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),
  transaction_id UUID REFERENCES public.transactions(id),

  status transaction_status DEFAULT 'pending',
  provider payment_provider NOT NULL,

  amount DECIMAL(20,2) NOT NULL CHECK (amount > 0),
  currency currency_code NOT NULL,
  phone_number TEXT NOT NULL,

  -- Provider details
  provider_reference TEXT,
  provider_receipt TEXT,
  raw_response JSONB,

  -- Exchange rate
  exchange_rate_to_usd DECIMAL(20,8),
  fee_amount DECIMAL(20,2) DEFAULT 0,
  net_amount DECIMAL(20,2) GENERATED ALWAYS AS (amount - fee_amount) STORED,

  -- Admin review (for large amounts)
  requires_review BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  initiated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EXCHANGE RATES (cached rates, updated regularly)
-- ============================================================
CREATE TABLE public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_currency currency_code NOT NULL,
  to_currency currency_code NOT NULL DEFAULT 'USD',
  rate DECIMAL(20,8) NOT NULL,
  source TEXT DEFAULT 'openexchangerates',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(from_currency, to_currency)
);

-- Seed initial rates (approximate, will be updated by cron)
INSERT INTO public.exchange_rates (from_currency, to_currency, rate) VALUES
  ('KES', 'USD', 0.00775),   -- 1 KES = ~0.00775 USD (1 USD ~ 129 KES)
  ('UGX', 'USD', 0.000267),  -- 1 UGX = ~0.000267 USD (1 USD ~ 3740 UGX)
  ('TZS', 'USD', 0.000385),  -- 1 TZS = ~0.000385 USD (1 USD ~ 2600 TZS)
  ('RWF', 'USD', 0.000714),  -- 1 RWF = ~0.000714 USD (1 USD ~ 1400 RWF)
  ('ZMW', 'USD', 0.0385),    -- 1 ZMW = ~0.0385 USD (1 USD ~ 26 ZMW)
  ('ETB', 'USD', 0.00714),   -- 1 ETB = ~0.00714 USD (1 USD ~ 140 ETB)
  ('BIF', 'USD', 0.000333),  -- 1 BIF = ~0.000333 USD (1 USD ~ 3000 BIF)
  ('USD', 'USD', 1.0);

-- ============================================================
-- COMMENTS
-- ============================================================
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  parent_id UUID REFERENCES public.comments(id), -- for threading
  content TEXT NOT NULL CHECK (LENGTH(content) >= 2 AND LENGTH(content) <= 2000),
  is_deleted BOOLEAN DEFAULT FALSE,
  like_count INTEGER DEFAULT 0,
  report_count INTEGER DEFAULT 0,
  is_flagged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- KYC DOCUMENTS
-- ============================================================
CREATE TABLE public.kyc_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL, -- 'national_id', 'passport', 'drivers_license'
  document_number TEXT,
  front_image_url TEXT,
  back_image_url TEXT,
  selfie_image_url TEXT,
  country_of_issue CHAR(2),
  expiry_date DATE,
  status kyc_status DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- REFERRALS
-- ============================================================
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id),
  referred_id UUID NOT NULL REFERENCES public.profiles(id),
  referral_code TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending | qualified | paid
  bonus_amount DECIMAL(20,6) DEFAULT 0,
  bonus_currency currency_code,
  bonus_paid_at TIMESTAMPTZ,
  qualified_at TIMESTAMPTZ,    -- when referred user first deposits
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referred_id)           -- can only be referred once
);

-- ============================================================
-- MARKET ACTIVITY FEED (for market page)
-- ============================================================
CREATE TABLE public.market_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  action TEXT NOT NULL, -- 'bet_yes', 'bet_no', 'comment', 'share'
  amount_usd DECIMAL(20,6),
  side order_side,
  price DECIMAL(8,6),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_market_activity_market ON public.market_activity(market_id, created_at DESC);

-- ============================================================
-- AUDIT LOG (admin)
-- ============================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Profiles
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_phone ON public.profiles(phone_number);
CREATE INDEX idx_profiles_referral_code ON public.profiles(referral_code);

-- Markets
CREATE INDEX idx_markets_status ON public.markets(status);
CREATE INDEX idx_markets_category ON public.markets(category);
CREATE INDEX idx_markets_creator ON public.markets(creator_id);
CREATE INDEX idx_markets_closes_at ON public.markets(closes_at);
CREATE INDEX idx_markets_slug ON public.markets(slug);
CREATE INDEX idx_markets_featured ON public.markets(is_featured, featured_order) WHERE is_featured = TRUE;
CREATE INDEX idx_markets_trending ON public.markets(is_trending, total_volume_usd DESC) WHERE is_trending = TRUE;
CREATE INDEX idx_markets_tags ON public.markets USING GIN(tags);
CREATE INDEX idx_markets_title_search ON public.markets USING GIN(to_tsvector('english', title || ' ' || description));

-- Orders
CREATE INDEX idx_orders_market ON public.orders(market_id);
CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_market_side_price ON public.orders(market_id, side, limit_price) WHERE status = 'open';

-- Positions
CREATE INDEX idx_positions_user ON public.positions(user_id);
CREATE INDEX idx_positions_market ON public.positions(market_id);
CREATE INDEX idx_positions_active ON public.positions(user_id, is_active) WHERE is_active = TRUE;

-- Transactions
CREATE INDEX idx_transactions_user ON public.transactions(user_id);
CREATE INDEX idx_transactions_wallet ON public.transactions(wallet_id);
CREATE INDEX idx_transactions_type ON public.transactions(type);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_payment_ref ON public.transactions(payment_reference);

-- Deposits
CREATE INDEX idx_deposits_user ON public.deposits(user_id);
CREATE INDEX idx_deposits_status ON public.deposits(status);
CREATE INDEX idx_deposits_checkout_id ON public.deposits(checkout_request_id);

-- Wallets
CREATE INDEX idx_wallets_user ON public.wallets(user_id);

-- Comments
CREATE INDEX idx_comments_market ON public.comments(market_id, created_at DESC);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_markets_updated_at BEFORE UPDATE ON public.markets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deposits_updated_at BEFORE UPDATE ON public.deposits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_withdrawals_updated_at BEFORE UPDATE ON public.withdrawals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_kyc_documents_updated_at BEFORE UPDATE ON public.kyc_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_referral_code TEXT;
  v_referrer_id UUID;
  default_currencies currency_code[] := ARRAY['KES'::currency_code, 'UGX'::currency_code, 'TZS'::currency_code, 'RWF'::currency_code];
  v_currency currency_code;
BEGIN
  -- Detect referral code from metadata
  v_referral_code := NEW.raw_user_meta_data->>'referral_code';

  -- Find referrer
  IF v_referral_code IS NOT NULL THEN
    SELECT id INTO v_referrer_id FROM public.profiles WHERE referral_code = v_referral_code;
  END IF;

  -- Create profile
  INSERT INTO public.profiles (id, display_name, avatar_url, referred_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    v_referrer_id
  );

  -- Create wallets for all supported currencies
  FOREACH v_currency IN ARRAY default_currencies LOOP
    INSERT INTO public.wallets (user_id, currency)
    VALUES (NEW.id, v_currency);
  END LOOP;

  -- Update referrer count
  IF v_referrer_id IS NOT NULL THEN
    UPDATE public.profiles SET referral_count = referral_count + 1 WHERE id = v_referrer_id;
    INSERT INTO public.referrals (referrer_id, referred_id, referral_code)
    VALUES (v_referrer_id, NEW.id, v_referral_code);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- LMSR price calculation function
-- b = liquidity parameter (controls price sensitivity)
-- q_yes = total yes shares outstanding
-- q_no = total no shares outstanding
CREATE OR REPLACE FUNCTION public.lmsr_price(
  q_yes DECIMAL,
  q_no DECIMAL,
  b DECIMAL DEFAULT 100
)
RETURNS TABLE(yes_price DECIMAL, no_price DECIMAL, cost_function DECIMAL) AS $$
DECLARE
  cost DECIMAL;
  yes_p DECIMAL;
  no_p DECIMAL;
BEGIN
  -- LMSR cost function: b * ln(e^(q_yes/b) + e^(q_no/b))
  cost := b * LN(EXP(q_yes / b) + EXP(q_no / b));

  -- Price = e^(q_i/b) / sum(e^(q_j/b))
  yes_p := EXP(q_yes / b) / (EXP(q_yes / b) + EXP(q_no / b));
  no_p := EXP(q_no / b) / (EXP(q_yes / b) + EXP(q_no / b));

  RETURN QUERY SELECT
    ROUND(yes_p::DECIMAL, 6),
    ROUND(no_p::DECIMAL, 6),
    ROUND(cost::DECIMAL, 6);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate cost to buy shares using LMSR
CREATE OR REPLACE FUNCTION public.lmsr_cost_to_buy(
  current_q_yes DECIMAL,
  current_q_no DECIMAL,
  delta_q_yes DECIMAL,   -- shares to buy on YES (0 if buying NO)
  delta_q_no DECIMAL,    -- shares to buy on NO (0 if buying YES)
  b DECIMAL DEFAULT 100
)
RETURNS DECIMAL AS $$
DECLARE
  cost_before DECIMAL;
  cost_after DECIMAL;
BEGIN
  cost_before := b * LN(EXP(current_q_yes / b) + EXP(current_q_no / b));
  cost_after := b * LN(EXP((current_q_yes + delta_q_yes) / b) + EXP((current_q_no + delta_q_no) / b));
  RETURN cost_after - cost_before;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Place a bet (atomic, prevents race conditions)
CREATE OR REPLACE FUNCTION public.place_bet(
  p_user_id UUID,
  p_market_id UUID,
  p_side order_side,
  p_amount_local DECIMAL,
  p_currency currency_code,
  p_order_type order_type DEFAULT 'market',
  p_limit_price DECIMAL DEFAULT NULL,
  p_client_order_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_market public.markets%ROWTYPE;
  v_exchange_rate DECIMAL;
  v_amount_usd DECIMAL;
  v_fee_usd DECIMAL;
  v_net_usd DECIMAL;
  v_shares DECIMAL;
  v_new_yes_price DECIMAL;
  v_new_no_price DECIMAL;
  v_order_id UUID;
  v_position public.positions%ROWTYPE;
  v_lmsr_b DECIMAL;
  v_q_yes DECIMAL;
  v_q_no DECIMAL;
  v_cost_usd DECIMAL;
  v_transaction_id UUID;
BEGIN
  -- Lock market row
  SELECT * INTO v_market FROM public.markets
  WHERE id = p_market_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found or not active' USING ERRCODE = 'P0001';
  END IF;

  IF v_market.closes_at < NOW() THEN
    RAISE EXCEPTION 'Market is closed for betting' USING ERRCODE = 'P0002';
  END IF;

  -- Get exchange rate
  SELECT rate INTO v_exchange_rate FROM public.exchange_rates
  WHERE from_currency = p_currency AND to_currency = 'USD';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unsupported currency: %', p_currency USING ERRCODE = 'P0003';
  END IF;

  -- Convert to USD
  v_amount_usd := p_amount_local * v_exchange_rate;

  -- Check minimum bet
  IF v_amount_usd < 0.10 THEN
    RAISE EXCEPTION 'Minimum bet is 0.10 USD equivalent' USING ERRCODE = 'P0004';
  END IF;

  -- Calculate fee
  v_fee_usd := v_amount_usd * v_market.platform_fee_rate;
  v_net_usd := v_amount_usd - v_fee_usd;

  -- Get user wallet (lock for update)
  SELECT * INTO v_wallet FROM public.wallets
  WHERE user_id = p_user_id AND currency = p_currency
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'P0005';
  END IF;

  -- Check balance
  IF v_wallet.available_balance < p_amount_local THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Required: %',
      v_wallet.available_balance, p_amount_local USING ERRCODE = 'P0006';
  END IF;

  -- LMSR pricing
  v_lmsr_b := GREATEST(v_market.liquidity_pool_usd / 2, 50); -- b parameter from liquidity
  v_q_yes := v_market.yes_volume_usd; -- simplified: use volume as proxy for shares
  v_q_no := v_market.no_volume_usd;

  -- Calculate shares received using LMSR
  IF p_side = 'yes' THEN
    -- shares bought ≈ net_usd / current_yes_price (simplified)
    v_shares := v_net_usd / GREATEST(v_market.yes_price, 0.01);
    v_q_yes := v_q_yes + v_net_usd;
  ELSE
    v_shares := v_net_usd / GREATEST(v_market.no_price, 0.01);
    v_q_no := v_q_no + v_net_usd;
  END IF;

  -- Recalculate prices
  SELECT yes_price, no_price INTO v_new_yes_price, v_new_no_price
  FROM public.lmsr_price(v_q_yes, v_q_no, v_lmsr_b);

  -- Deduct from wallet
  UPDATE public.wallets SET
    available_balance = available_balance - p_amount_local,
    reserved_balance = reserved_balance + p_amount_local,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  -- Create order
  INSERT INTO public.orders (
    market_id, user_id, wallet_id,
    side, type, status,
    amount_usd, currency, amount_local, exchange_rate_to_usd,
    limit_price, avg_fill_price,
    shares, potential_payout_usd,
    fee_usd, fee_local, filled_usd,
    client_order_id
  ) VALUES (
    p_market_id, p_user_id, v_wallet.id,
    p_side, p_order_type, 'filled',
    v_amount_usd, p_currency, p_amount_local, v_exchange_rate,
    p_limit_price, CASE WHEN p_side = 'yes' THEN v_market.yes_price ELSE v_market.no_price END,
    v_shares, v_shares * 1.0, -- potential payout = shares * $1 if wins
    v_fee_usd, v_fee_usd / v_exchange_rate, v_amount_usd,
    p_client_order_id
  ) RETURNING id INTO v_order_id;

  -- Update or create position
  INSERT INTO public.positions (
    user_id, market_id, wallet_id,
    side, shares, total_invested_usd, avg_entry_price, current_value_usd
  ) VALUES (
    p_user_id, p_market_id, v_wallet.id,
    p_side, v_shares, v_net_usd,
    CASE WHEN p_side = 'yes' THEN v_market.yes_price ELSE v_market.no_price END,
    v_shares * CASE WHEN p_side = 'yes' THEN v_new_yes_price ELSE v_new_no_price END
  )
  ON CONFLICT (user_id, market_id, side) DO UPDATE SET
    shares = positions.shares + v_shares,
    total_invested_usd = positions.total_invested_usd + v_net_usd,
    avg_entry_price = (positions.total_invested_usd + v_net_usd) / (positions.shares + v_shares),
    current_value_usd = (positions.shares + v_shares) * CASE WHEN p_side = 'yes' THEN v_new_yes_price ELSE v_new_no_price END,
    is_active = TRUE,
    updated_at = NOW();

  -- Create transaction record
  INSERT INTO public.transactions (
    user_id, wallet_id, type, status,
    amount, currency, amount_usd, exchange_rate_to_usd,
    fee_amount, fee_currency,
    balance_before, balance_after,
    order_id, market_id,
    description, idempotency_key
  ) VALUES (
    p_user_id, v_wallet.id, 'bet_placed', 'completed',
    p_amount_local, p_currency, v_amount_usd, v_exchange_rate,
    v_fee_usd / v_exchange_rate, p_currency,
    v_wallet.available_balance, v_wallet.available_balance - p_amount_local,
    v_order_id, p_market_id,
    FORMAT('Bet %s on market: %s', UPPER(p_side::TEXT), v_market.title),
    COALESCE(p_client_order_id, gen_random_uuid()::TEXT)
  ) RETURNING id INTO v_transaction_id;

  -- Update market stats
  UPDATE public.markets SET
    total_volume_usd = total_volume_usd + v_amount_usd,
    yes_volume_usd = CASE WHEN p_side = 'yes' THEN yes_volume_usd + v_net_usd ELSE yes_volume_usd END,
    no_volume_usd = CASE WHEN p_side = 'no' THEN no_volume_usd + v_net_usd ELSE no_volume_usd END,
    total_bets = total_bets + 1,
    yes_price = v_new_yes_price,
    no_price = v_new_no_price,
    updated_at = NOW()
  WHERE id = p_market_id;

  -- Log price history
  INSERT INTO public.price_history (market_id, yes_price, no_price, volume_usd)
  VALUES (p_market_id, v_new_yes_price, v_new_no_price, v_amount_usd);

  -- Log activity
  INSERT INTO public.market_activity (market_id, user_id, action, amount_usd, side, price)
  VALUES (p_market_id, p_user_id,
    CASE WHEN p_side = 'yes' THEN 'bet_yes' ELSE 'bet_no' END,
    v_amount_usd, p_side,
    CASE WHEN p_side = 'yes' THEN v_market.yes_price ELSE v_market.no_price END
  );

  -- Return result
  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'transaction_id', v_transaction_id,
    'shares', v_shares,
    'amount_usd', v_amount_usd,
    'fee_usd', v_fee_usd,
    'new_yes_price', v_new_yes_price,
    'new_no_price', v_new_no_price,
    'potential_payout_usd', v_shares
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resolve a market and pay out winners
CREATE OR REPLACE FUNCTION public.resolve_market(
  p_market_id UUID,
  p_outcome order_side,
  p_resolver_id UUID,
  p_resolution_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_market public.markets%ROWTYPE;
  v_position RECORD;
  v_wallet public.wallets%ROWTYPE;
  v_payout_usd DECIMAL;
  v_payout_local DECIMAL;
  v_exchange_rate DECIMAL;
  v_total_paid_out DECIMAL := 0;
  v_winners INTEGER := 0;
  v_losers INTEGER := 0;
BEGIN
  -- Lock and fetch market
  SELECT * INTO v_market FROM public.markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_market.status NOT IN ('active', 'closed') THEN
    RAISE EXCEPTION 'Market cannot be resolved in status: %', v_market.status USING ERRCODE = 'P0002';
  END IF;

  -- Mark market resolved
  UPDATE public.markets SET
    status = 'resolved',
    resolved_outcome = p_outcome,
    resolved_at = NOW(),
    resolver_id = p_resolver_id,
    resolution_notes = p_resolution_notes
  WHERE id = p_market_id;

  -- Process all winning positions
  FOR v_position IN
    SELECT p.*, w.currency, w.available_balance
    FROM public.positions p
    JOIN public.wallets w ON w.id = p.wallet_id
    WHERE p.market_id = p_market_id
    AND p.is_active = TRUE
    AND p.side = p_outcome
  LOOP
    -- Payout = shares * $1 (binary outcome)
    v_payout_usd := v_position.shares;

    -- Get exchange rate
    SELECT rate INTO v_exchange_rate FROM public.exchange_rates
    WHERE from_currency = v_position.currency AND to_currency = 'USD';

    v_payout_local := v_payout_usd / v_exchange_rate;

    -- Credit wallet (move from reserved to available + add winnings)
    UPDATE public.wallets SET
      available_balance = available_balance + v_payout_local
        + (v_position.total_invested_usd / v_exchange_rate), -- return initial bet too (reserved)
      reserved_balance = GREATEST(0, reserved_balance - (v_position.total_invested_usd / v_exchange_rate)),
      total_won = total_won + v_payout_usd,
      updated_at = NOW()
    WHERE id = v_position.wallet_id;

    -- Update position
    UPDATE public.positions SET
      is_active = FALSE,
      realized_pnl_usd = v_payout_usd - v_position.total_invested_usd,
      total_payout_usd = v_payout_usd + v_position.total_invested_usd,
      claimed_at = NOW(),
      updated_at = NOW()
    WHERE id = v_position.id;

    -- Transaction record
    INSERT INTO public.transactions (
      user_id, wallet_id, type, status,
      amount, currency, amount_usd, exchange_rate_to_usd,
      balance_before, balance_after,
      market_id, description, idempotency_key
    ) VALUES (
      v_position.user_id, v_position.wallet_id, 'bet_won', 'completed',
      v_payout_local + (v_position.total_invested_usd / v_exchange_rate),
      v_position.currency, v_payout_usd + v_position.total_invested_usd, v_exchange_rate,
      v_position.available_balance,
      v_position.available_balance + v_payout_local + (v_position.total_invested_usd / v_exchange_rate),
      p_market_id,
      FORMAT('Won: %s - %s', v_market.title, UPPER(p_outcome::TEXT)),
      FORMAT('win_%s_%s', p_market_id, v_position.user_id)
    );

    -- Notification
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_position.user_id, 'bet_won',
      '🎉 You Won!',
      FORMAT('Your %s prediction on "%s" was correct! +%s USD', UPPER(p_outcome::TEXT), v_market.title, ROUND(v_payout_usd, 2)),
      jsonb_build_object('market_id', p_market_id, 'payout_usd', v_payout_usd)
    );

    v_total_paid_out := v_total_paid_out + v_payout_usd;
    v_winners := v_winners + 1;
  END LOOP;

  -- Mark losing positions
  FOR v_position IN
    SELECT p.*, w.currency, w.available_balance
    FROM public.positions p
    JOIN public.wallets w ON w.id = p.wallet_id
    WHERE p.market_id = p_market_id
    AND p.is_active = TRUE
    AND p.side != p_outcome
  LOOP
    -- Get exchange rate for reserved balance release
    SELECT rate INTO v_exchange_rate FROM public.exchange_rates
    WHERE from_currency = v_position.currency AND to_currency = 'USD';

    -- Release reserved balance (already deducted when bet placed)
    UPDATE public.wallets SET
      reserved_balance = GREATEST(0, reserved_balance - (v_position.total_invested_usd / v_exchange_rate)),
      total_lost = total_lost + v_position.total_invested_usd,
      updated_at = NOW()
    WHERE id = v_position.wallet_id;

    -- Update position
    UPDATE public.positions SET
      is_active = FALSE,
      realized_pnl_usd = -v_position.total_invested_usd,
      total_payout_usd = 0,
      claimed_at = NOW(),
      updated_at = NOW()
    WHERE id = v_position.id;

    -- Transaction record
    INSERT INTO public.transactions (
      user_id, wallet_id, type, status,
      amount, currency, amount_usd, exchange_rate_to_usd,
      balance_before, balance_after,
      market_id, description, idempotency_key
    ) VALUES (
      v_position.user_id, v_position.wallet_id, 'bet_lost', 'completed',
      0, v_position.currency, 0, v_exchange_rate,
      v_position.available_balance, v_position.available_balance,
      p_market_id,
      FORMAT('Lost: %s', v_market.title),
      FORMAT('lose_%s_%s', p_market_id, v_position.user_id)
    );

    -- Notification
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_position.user_id, 'bet_lost',
      '📉 Prediction Incorrect',
      FORMAT('Your %s prediction on "%s" did not win this time.',
        CASE WHEN v_position.side = 'yes' THEN 'YES' ELSE 'NO' END, v_market.title),
      jsonb_build_object('market_id', p_market_id)
    );

    v_losers := v_losers + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'market_id', p_market_id,
    'outcome', p_outcome,
    'winners', v_winners,
    'losers', v_losers,
    'total_paid_out_usd', v_total_paid_out
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cancel market and refund everyone
CREATE OR REPLACE FUNCTION public.cancel_market(
  p_market_id UUID,
  p_reason TEXT DEFAULT 'Market cancelled'
)
RETURNS JSONB AS $$
DECLARE
  v_market public.markets%ROWTYPE;
  v_position RECORD;
  v_exchange_rate DECIMAL;
  v_refund_local DECIMAL;
  v_total_refunded DECIMAL := 0;
  v_refunded_count INTEGER := 0;
BEGIN
  SELECT * INTO v_market FROM public.markets
  WHERE id = p_market_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market not found';
  END IF;

  UPDATE public.markets SET
    status = 'cancelled',
    resolution_notes = p_reason,
    updated_at = NOW()
  WHERE id = p_market_id;

  FOR v_position IN
    SELECT p.*, w.currency, w.available_balance
    FROM public.positions p
    JOIN public.wallets w ON w.id = p.wallet_id
    WHERE p.market_id = p_market_id AND p.is_active = TRUE
  LOOP
    SELECT rate INTO v_exchange_rate FROM public.exchange_rates
    WHERE from_currency = v_position.currency AND to_currency = 'USD';

    v_refund_local := v_position.total_invested_usd / v_exchange_rate;

    UPDATE public.wallets SET
      available_balance = available_balance + v_refund_local,
      reserved_balance = GREATEST(0, reserved_balance - v_refund_local),
      updated_at = NOW()
    WHERE id = v_position.wallet_id;

    UPDATE public.positions SET
      is_active = FALSE, realized_pnl_usd = 0, updated_at = NOW()
    WHERE id = v_position.id;

    INSERT INTO public.transactions (
      user_id, wallet_id, type, status,
      amount, currency, amount_usd, exchange_rate_to_usd,
      balance_before, balance_after, market_id, description, idempotency_key
    ) VALUES (
      v_position.user_id, v_position.wallet_id, 'bet_refunded', 'completed',
      v_refund_local, v_position.currency, v_position.total_invested_usd, v_exchange_rate,
      v_position.available_balance, v_position.available_balance + v_refund_local,
      p_market_id,
      FORMAT('Refund: %s (cancelled)', v_market.title),
      FORMAT('refund_%s_%s', p_market_id, v_position.user_id)
    );

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_position.user_id, 'market_resolved',
      '↩️ Market Cancelled - Refund Issued',
      FORMAT('"%s" was cancelled. Your bet of %s %s has been refunded.', v_market.title, v_refund_local, v_position.currency),
      jsonb_build_object('market_id', p_market_id, 'refund_amount', v_refund_local)
    );

    v_total_refunded := v_total_refunded + v_position.total_invested_usd;
    v_refunded_count := v_refunded_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'refunded_users', v_refunded_count,
    'total_refunded_usd', v_total_refunded
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_options ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'moderator')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- PROFILES policies
CREATE POLICY "Profiles are publicly viewable" ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (public.is_admin());

-- WALLETS policies
CREATE POLICY "Users can view own wallets" ON public.wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage wallets" ON public.wallets FOR ALL USING (auth.role() = 'service_role');

-- MARKETS policies
CREATE POLICY "Active markets are publicly viewable" ON public.markets
  FOR SELECT USING (status IN ('active', 'closed', 'resolved') OR auth.uid() = creator_id OR public.is_admin());
CREATE POLICY "Authenticated users can create markets" ON public.markets
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = creator_id);
CREATE POLICY "Creators can update own draft markets" ON public.markets
  FOR UPDATE USING (auth.uid() = creator_id AND status = 'draft');
CREATE POLICY "Admins can manage all markets" ON public.markets
  FOR ALL USING (public.is_admin());

-- ORDERS policies
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage orders" ON public.orders FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING (public.is_admin());

-- POSITIONS policies
CREATE POLICY "Users can view own positions" ON public.positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage positions" ON public.positions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Admins can view all positions" ON public.positions FOR SELECT USING (public.is_admin());

-- TRANSACTIONS policies
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage transactions" ON public.transactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Admins can view all transactions" ON public.transactions FOR SELECT USING (public.is_admin());

-- DEPOSITS policies
CREATE POLICY "Users can view own deposits" ON public.deposits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage deposits" ON public.deposits FOR ALL USING (auth.role() = 'service_role');

-- WITHDRAWALS policies
CREATE POLICY "Users can view own withdrawals" ON public.withdrawals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage withdrawals" ON public.withdrawals FOR ALL USING (auth.role() = 'service_role');

-- NOTIFICATIONS policies
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage notifications" ON public.notifications FOR ALL USING (auth.role() = 'service_role');

-- COMMENTS policies
CREATE POLICY "Comments are publicly viewable" ON public.comments
  FOR SELECT USING (is_deleted = FALSE OR public.is_admin());
CREATE POLICY "Authenticated users can comment" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON public.comments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all comments" ON public.comments FOR ALL USING (public.is_admin());

-- MARKET ACTIVITY policies
CREATE POLICY "Market activity is publicly viewable" ON public.market_activity FOR SELECT USING (TRUE);
CREATE POLICY "Service role can manage activity" ON public.market_activity FOR ALL USING (auth.role() = 'service_role');

-- KYC policies
CREATE POLICY "Users can view own KYC docs" ON public.kyc_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can submit KYC docs" ON public.kyc_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all KYC docs" ON public.kyc_documents FOR ALL USING (public.is_admin());

-- PRICE HISTORY policies
CREATE POLICY "Price history is publicly viewable" ON public.price_history FOR SELECT USING (TRUE);
CREATE POLICY "Service role can manage price history" ON public.price_history FOR ALL USING (auth.role() = 'service_role');

-- EXCHANGE RATES policies
CREATE POLICY "Exchange rates are publicly viewable" ON public.exchange_rates FOR SELECT USING (TRUE);
CREATE POLICY "Service role can manage exchange rates" ON public.exchange_rates FOR ALL USING (auth.role() = 'service_role');

-- REFERRALS policies
CREATE POLICY "Users can view own referrals" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
CREATE POLICY "Service role can manage referrals" ON public.referrals FOR ALL USING (auth.role() = 'service_role');

-- AUDIT LOG policies
CREATE POLICY "Admins can view audit log" ON public.audit_log FOR SELECT USING (public.is_admin());
CREATE POLICY "Service role can manage audit log" ON public.audit_log FOR ALL USING (auth.role() = 'service_role');

-- MARKET OPTIONS policies
CREATE POLICY "Market options are publicly viewable" ON public.market_options FOR SELECT USING (TRUE);
CREATE POLICY "Service role can manage market options" ON public.market_options FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================
-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.markets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.price_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
