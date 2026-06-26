// ============================================================
// MarketPips - Supabase Database Generated Types
// Run: supabase gen types typescript --local > types/database.ts
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          phone_number: string | null
          country_code: string
          preferred_currency: Database['public']['Enums']['currency_code']
          role: Database['public']['Enums']['user_role']
          kyc_status: Database['public']['Enums']['kyc_status']
          kyc_completed_at: string | null
          account_status: Database['public']['Enums']['account_status']
          referral_code: string
          referred_by: string | null
          referral_count: number
          total_volume_usd: number
          total_bets: number
          total_wins: number
          win_rate: number
          profit_loss_usd: number
          email_notifications: boolean
          sms_notifications: boolean
          push_notifications: boolean
          last_login_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          phone_number?: string | null
          country_code?: string
          preferred_currency?: Database['public']['Enums']['currency_code']
          role?: Database['public']['Enums']['user_role']
          kyc_status?: Database['public']['Enums']['kyc_status']
          account_status?: Database['public']['Enums']['account_status']
          referred_by?: string | null
        }
        Update: {
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          phone_number?: string | null
          country_code?: string
          preferred_currency?: Database['public']['Enums']['currency_code']
          email_notifications?: boolean
          sms_notifications?: boolean
          push_notifications?: boolean
        }
      }
      wallets: {
        Row: {
          id: string
          user_id: string
          currency: Database['public']['Enums']['currency_code']
          available_balance: number
          reserved_balance: number
          total_deposited: number
          total_withdrawn: number
          total_won: number
          total_lost: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          currency: Database['public']['Enums']['currency_code']
          available_balance?: number
        }
        Update: {
          available_balance?: number
          reserved_balance?: number
        }
      }
      markets: {
        Row: {
          id: string
          slug: string
          title: string
          description: string
          category: Database['public']['Enums']['market_category']
          resolution_type: Database['public']['Enums']['market_resolution_type']
          creator_id: string
          creator_reward_rate: number
          status: Database['public']['Enums']['market_status']
          opens_at: string
          closes_at: string
          resolves_at: string | null
          resolved_at: string | null
          resolver_id: string | null
          resolution_source: string | null
          resolution_criteria: string
          resolved_outcome: Database['public']['Enums']['order_side'] | null
          resolution_notes: string | null
          yes_price: number
          no_price: number
          liquidity_pool_usd: number
          initial_liquidity_usd: number
          total_volume_usd: number
          yes_volume_usd: number
          no_volume_usd: number
          total_bets: number
          unique_bettors: number
          platform_fee_rate: number
          is_featured: boolean
          is_trending: boolean
          featured_order: number | null
          tags: string[]
          cover_image_url: string | null
          allowed_countries: string[]
          view_count: number
          comment_count: number
          share_count: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          slug: string
          title: string
          description: string
          category: Database['public']['Enums']['market_category']
          creator_id: string
          resolution_criteria: string
          closes_at: string
          resolves_at?: string | null
          tags?: string[]
          cover_image_url?: string | null
          status?: Database['public']['Enums']['market_status']
        }
        Update: {
          title?: string
          description?: string
          status?: Database['public']['Enums']['market_status']
          is_featured?: boolean
          is_trending?: boolean
          cover_image_url?: string | null
        }
      }
      orders: {
        Row: {
          id: string
          market_id: string
          user_id: string
          wallet_id: string
          side: Database['public']['Enums']['order_side']
          type: Database['public']['Enums']['order_type']
          status: Database['public']['Enums']['order_status']
          amount_usd: number
          filled_usd: number
          remaining_usd: number
          currency: Database['public']['Enums']['currency_code']
          amount_local: number
          exchange_rate_to_usd: number
          limit_price: number | null
          avg_fill_price: number
          shares: number
          potential_payout_usd: number
          fee_usd: number
          fee_local: number
          expires_at: string | null
          transaction_id: string | null
          client_order_id: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      positions: {
        Row: {
          id: string
          user_id: string
          market_id: string
          wallet_id: string
          side: Database['public']['Enums']['position_side']
          shares: number
          total_invested_usd: number
          avg_entry_price: number
          current_value_usd: number
          unrealized_pnl_usd: number
          realized_pnl_usd: number
          total_payout_usd: number
          is_active: boolean
          claimed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          wallet_id: string
          type: Database['public']['Enums']['transaction_type']
          status: Database['public']['Enums']['transaction_status']
          amount: number
          currency: Database['public']['Enums']['currency_code']
          amount_usd: number
          exchange_rate_to_usd: number
          fee_amount: number
          fee_currency: Database['public']['Enums']['currency_code'] | null
          net_amount: number
          balance_before: number
          balance_after: number
          order_id: string | null
          market_id: string | null
          payment_reference: string | null
          provider_reference: string | null
          idempotency_key: string | null
          payment_provider: Database['public']['Enums']['payment_provider'] | null
          payment_phone: string | null
          payment_metadata: Json
          description: string | null
          notes: string | null
          initiated_at: string
          completed_at: string | null
          failed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      deposits: {
        Row: {
          id: string
          user_id: string
          wallet_id: string
          transaction_id: string | null
          status: Database['public']['Enums']['transaction_status']
          provider: Database['public']['Enums']['payment_provider']
          amount: number
          currency: Database['public']['Enums']['currency_code']
          phone_number: string
          checkout_request_id: string | null
          merchant_request_id: string | null
          mtn_reference_id: string | null
          airtel_reference: string | null
          pesapal_order_id: string | null
          provider_receipt: string | null
          exchange_rate_to_usd: number | null
          retry_count: number
          expires_at: string
          initiated_at: string
          confirmed_at: string | null
          failed_at: string | null
          failure_reason: string | null
          raw_callback: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          wallet_id: string
          provider: Database['public']['Enums']['payment_provider']
          amount: number
          currency: Database['public']['Enums']['currency_code']
          phone_number: string
        }
        Update: {
          status?: Database['public']['Enums']['transaction_status']
          checkout_request_id?: string | null
          confirmed_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          raw_callback?: Json | null
          provider_receipt?: string | null
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: Database['public']['Enums']['notification_type']
          title: string
          body: string
          data: Json
          is_read: boolean
          read_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          type: Database['public']['Enums']['notification_type']
          title: string
          body: string
          data?: Json
        }
        Update: {
          is_read?: boolean
          read_at?: string | null
        }
      }
      price_history: {
        Row: {
          id: string
          market_id: string
          yes_price: number
          no_price: number
          volume_usd: number
          recorded_at: string
        }
        Insert: {
          market_id: string
          yes_price: number
          no_price: number
          volume_usd?: number
        }
        Update: Record<string, never>
      }
      comments: {
        Row: {
          id: string
          market_id: string
          user_id: string
          parent_id: string | null
          content: string
          is_deleted: boolean
          like_count: number
          report_count: number
          is_flagged: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          market_id: string
          user_id: string
          parent_id?: string | null
          content: string
        }
        Update: {
          content?: string
          is_deleted?: boolean
        }
      }
      exchange_rates: {
        Row: {
          id: string
          from_currency: Database['public']['Enums']['currency_code']
          to_currency: Database['public']['Enums']['currency_code']
          rate: number
          source: string
          fetched_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      market_activity: {
        Row: {
          id: string
          market_id: string
          user_id: string
          action: string
          amount_usd: number | null
          side: Database['public']['Enums']['order_side'] | null
          price: number | null
          metadata: Json
          created_at: string
        }
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
    }
    Views: Record<string, never>
    Functions: {
      lmsr_price: {
        Args: { q_yes: number; q_no: number; b?: number }
        Returns: { yes_price: number; no_price: number; cost_function: number }[]
      }
      place_bet: {
        Args: {
          p_user_id: string
          p_market_id: string
          p_side: Database['public']['Enums']['order_side']
          p_amount_local: number
          p_currency: Database['public']['Enums']['currency_code']
          p_order_type?: Database['public']['Enums']['order_type']
          p_limit_price?: number | null
          p_client_order_id?: string | null
        }
        Returns: Json
      }
      resolve_market: {
        Args: {
          p_market_id: string
          p_outcome: Database['public']['Enums']['order_side']
          p_resolver_id: string
          p_resolution_notes?: string | null
        }
        Returns: Json
      }
      cancel_market: {
        Args: { p_market_id: string; p_reason?: string }
        Returns: Json
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: {
      user_role: 'user' | 'admin' | 'moderator' | 'resolver'
      kyc_status: 'unverified' | 'pending' | 'verified' | 'rejected'
      account_status: 'active' | 'suspended' | 'closed'
      market_status: 'draft' | 'pending' | 'active' | 'closed' | 'resolved' | 'disputed' | 'cancelled'
      market_category: 'politics' | 'sports' | 'economics' | 'crypto' | 'technology' | 'entertainment' | 'weather' | 'governance' | 'elections' | 'business' | 'health' | 'social' | 'other'
      market_resolution_type: 'binary' | 'multiple_choice'
      order_side: 'yes' | 'no'
      order_type: 'market' | 'limit'
      order_status: 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'expired'
      position_side: 'yes' | 'no'
      transaction_type: 'deposit' | 'withdrawal' | 'bet_placed' | 'bet_won' | 'bet_lost' | 'bet_refunded' | 'fee' | 'bonus' | 'referral_bonus' | 'creator_reward'
      transaction_status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'
      payment_provider: 'mpesa' | 'mtn_momo' | 'airtel_money' | 'pesapal' | 'bank_transfer' | 'internal'
      currency_code: 'KES' | 'UGX' | 'TZS' | 'RWF' | 'ZMW' | 'ETB' | 'BIF' | 'USD'
      notification_type: 'market_created' | 'market_resolved' | 'bet_filled' | 'bet_won' | 'bet_lost' | 'deposit_completed' | 'withdrawal_completed' | 'withdrawal_failed' | 'price_alert' | 'market_closing_soon' | 'referral_bonus' | 'kyc_approved' | 'kyc_rejected' | 'system_announcement'
    }
  }
}
