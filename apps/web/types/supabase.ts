// AUTO-GENERATED from live Supabase schema. Do not edit by hand.
// Regenerate with: python3 scripts/gen_supabase_types.py <DB_URL>

export type Json =
  | string | number | boolean | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_user_notes: {
        Row: {
          id: string
          user_id: string
          author_id: string | null
          note: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          author_id?: string | null
          note: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          author_id?: string | null
          note?: string
          created_at?: string
        }
        Relationships: []
      }
      impersonation_sessions: {
        Row: {
          id: string
          admin_id: string
          target_user_id: string
          reason: string | null
          started_at: string
          expires_at: string
          ended_at: string | null
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          admin_id: string
          target_user_id: string
          reason?: string | null
          started_at?: string
          expires_at: string
          ended_at?: string | null
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          admin_id?: string
          target_user_id?: string
          reason?: string | null
          started_at?: string
          expires_at?: string
          ended_at?: string | null
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          role: Database["public"]["Enums"]["user_role"]
          capability: string
          created_at: string
        }
        Insert: {
          role: Database["public"]["Enums"]["user_role"]
          capability: string
          created_at?: string
        }
        Update: {
          role?: Database["public"]["Enums"]["user_role"]
          capability?: string
          created_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          entity_type: string | null
          entity_id: string | null
          old_data: Json | null
          new_data: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          entity_type?: string | null
          entity_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          actor_id?: string | null
          action?: string
          entity_type?: string | null
          entity_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      comments: {
        Row: {
          id: string
          market_id: string
          user_id: string
          parent_id: string | null
          content: string
          is_deleted: boolean | null
          like_count: number | null
          report_count: number | null
          is_flagged: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          market_id: string
          user_id: string
          parent_id?: string | null
          content: string
          is_deleted?: boolean | null
          like_count?: number | null
          report_count?: number | null
          is_flagged?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          market_id?: string
          user_id?: string
          parent_id?: string | null
          content?: string
          is_deleted?: boolean | null
          like_count?: number | null
          report_count?: number | null
          is_flagged?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      deposits: {
        Row: {
          id: string
          user_id: string
          wallet_id: string
          transaction_id: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          provider: Database["public"]["Enums"]["payment_provider"]
          amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          phone_number: string
          checkout_request_id: string | null
          merchant_request_id: string | null
          mtn_reference_id: string | null
          airtel_reference: string | null
          pesapal_order_id: string | null
          provider_receipt: string | null
          exchange_rate_to_usd: number | null
          retry_count: number | null
          expires_at: string | null
          initiated_at: string | null
          confirmed_at: string | null
          failed_at: string | null
          failure_reason: string | null
          raw_callback: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          wallet_id: string
          transaction_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          provider: Database["public"]["Enums"]["payment_provider"]
          amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          phone_number: string
          checkout_request_id?: string | null
          merchant_request_id?: string | null
          mtn_reference_id?: string | null
          airtel_reference?: string | null
          pesapal_order_id?: string | null
          provider_receipt?: string | null
          exchange_rate_to_usd?: number | null
          retry_count?: number | null
          expires_at?: string | null
          initiated_at?: string | null
          confirmed_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          raw_callback?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          wallet_id?: string
          transaction_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          amount?: number
          currency?: Database["public"]["Enums"]["currency_code"]
          phone_number?: string
          checkout_request_id?: string | null
          merchant_request_id?: string | null
          mtn_reference_id?: string | null
          airtel_reference?: string | null
          pesapal_order_id?: string | null
          provider_receipt?: string | null
          exchange_rate_to_usd?: number | null
          retry_count?: number | null
          expires_at?: string | null
          initiated_at?: string | null
          confirmed_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          raw_callback?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deposits_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          }
        ]
      }
      exchange_rates: {
        Row: {
          id: string
          from_currency: Database["public"]["Enums"]["currency_code"]
          to_currency: Database["public"]["Enums"]["currency_code"]
          rate: number
          source: string | null
          fetched_at: string | null
        }
        Insert: {
          id?: string
          from_currency: Database["public"]["Enums"]["currency_code"]
          to_currency?: Database["public"]["Enums"]["currency_code"]
          rate: number
          source?: string | null
          fetched_at?: string | null
        }
        Update: {
          id?: string
          from_currency?: Database["public"]["Enums"]["currency_code"]
          to_currency?: Database["public"]["Enums"]["currency_code"]
          rate?: number
          source?: string | null
          fetched_at?: string | null
        }
        Relationships: []
      }
      kyc_documents: {
        Row: {
          id: string
          user_id: string
          document_type: string
          document_number: string | null
          front_image_url: string | null
          back_image_url: string | null
          selfie_image_url: string | null
          country_of_issue: string | null
          expiry_date: string | null
          status: Database["public"]["Enums"]["kyc_status"] | null
          reviewed_by: string | null
          reviewed_at: string | null
          rejection_reason: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          document_type: string
          document_number?: string | null
          front_image_url?: string | null
          back_image_url?: string | null
          selfie_image_url?: string | null
          country_of_issue?: string | null
          expiry_date?: string | null
          status?: Database["public"]["Enums"]["kyc_status"] | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          document_type?: string
          document_number?: string | null
          front_image_url?: string | null
          back_image_url?: string | null
          selfie_image_url?: string | null
          country_of_issue?: string | null
          expiry_date?: string | null
          status?: Database["public"]["Enums"]["kyc_status"] | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      market_activity: {
        Row: {
          id: string
          market_id: string
          user_id: string
          action: string
          amount_usd: number | null
          side: Database["public"]["Enums"]["order_side"] | null
          price: number | null
          metadata: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          market_id: string
          user_id: string
          action: string
          amount_usd?: number | null
          side?: Database["public"]["Enums"]["order_side"] | null
          price?: number | null
          metadata?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          market_id?: string
          user_id?: string
          action?: string
          amount_usd?: number | null
          side?: Database["public"]["Enums"]["order_side"] | null
          price?: number | null
          metadata?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_activity_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      market_options: {
        Row: {
          id: string
          market_id: string
          label: string
          description: string | null
          price: number | null
          volume_usd: number | null
          is_winner: boolean | null
          display_order: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          market_id: string
          label: string
          description?: string | null
          price?: number | null
          volume_usd?: number | null
          is_winner?: boolean | null
          display_order?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          market_id?: string
          label?: string
          description?: string | null
          price?: number | null
          volume_usd?: number | null
          is_winner?: boolean | null
          display_order?: number | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_options_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          }
        ]
      }
      markets: {
        Row: {
          id: string
          slug: string
          title: string
          description: string
          category: Database["public"]["Enums"]["market_category"]
          resolution_type: Database["public"]["Enums"]["market_resolution_type"] | null
          creator_id: string
          creator_reward_rate: number | null
          status: Database["public"]["Enums"]["market_status"] | null
          opens_at: string | null
          closes_at: string
          resolves_at: string | null
          resolved_at: string | null
          resolver_id: string | null
          resolution_source: string | null
          resolution_criteria: string
          resolved_outcome: Database["public"]["Enums"]["order_side"] | null
          resolution_notes: string | null
          yes_price: number | null
          no_price: number | null
          liquidity_pool_usd: number | null
          initial_liquidity_usd: number | null
          total_volume_usd: number | null
          yes_volume_usd: number | null
          no_volume_usd: number | null
          total_bets: number | null
          unique_bettors: number | null
          platform_fee_rate: number | null
          is_featured: boolean | null
          is_trending: boolean | null
          featured_order: number | null
          tags: string[] | null
          cover_image_url: string | null
          allowed_countries: string[] | null
          view_count: number | null
          comment_count: number | null
          share_count: number | null
          metadata: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          slug: string
          title: string
          description: string
          category?: Database["public"]["Enums"]["market_category"]
          resolution_type?: Database["public"]["Enums"]["market_resolution_type"] | null
          creator_id: string
          creator_reward_rate?: number | null
          status?: Database["public"]["Enums"]["market_status"] | null
          opens_at?: string | null
          closes_at: string
          resolves_at?: string | null
          resolved_at?: string | null
          resolver_id?: string | null
          resolution_source?: string | null
          resolution_criteria: string
          resolved_outcome?: Database["public"]["Enums"]["order_side"] | null
          resolution_notes?: string | null
          yes_price?: number | null
          no_price?: number | null
          liquidity_pool_usd?: number | null
          initial_liquidity_usd?: number | null
          total_volume_usd?: number | null
          yes_volume_usd?: number | null
          no_volume_usd?: number | null
          total_bets?: number | null
          unique_bettors?: number | null
          platform_fee_rate?: number | null
          is_featured?: boolean | null
          is_trending?: boolean | null
          featured_order?: number | null
          tags?: string[] | null
          cover_image_url?: string | null
          allowed_countries?: string[] | null
          view_count?: number | null
          comment_count?: number | null
          share_count?: number | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          slug?: string
          title?: string
          description?: string
          category?: Database["public"]["Enums"]["market_category"]
          resolution_type?: Database["public"]["Enums"]["market_resolution_type"] | null
          creator_id?: string
          creator_reward_rate?: number | null
          status?: Database["public"]["Enums"]["market_status"] | null
          opens_at?: string | null
          closes_at?: string
          resolves_at?: string | null
          resolved_at?: string | null
          resolver_id?: string | null
          resolution_source?: string | null
          resolution_criteria?: string
          resolved_outcome?: Database["public"]["Enums"]["order_side"] | null
          resolution_notes?: string | null
          yes_price?: number | null
          no_price?: number | null
          liquidity_pool_usd?: number | null
          initial_liquidity_usd?: number | null
          total_volume_usd?: number | null
          yes_volume_usd?: number | null
          no_volume_usd?: number | null
          total_bets?: number | null
          unique_bettors?: number | null
          platform_fee_rate?: number | null
          is_featured?: boolean | null
          is_trending?: boolean | null
          featured_order?: number | null
          tags?: string[] | null
          cover_image_url?: string | null
          allowed_countries?: string[] | null
          view_count?: number | null
          comment_count?: number | null
          share_count?: number | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "markets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_resolver_id_fkey"
            columns: ["resolver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: Database["public"]["Enums"]["notification_type"]
          title: string
          body: string
          data: Json | null
          is_read: boolean | null
          read_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          type: Database["public"]["Enums"]["notification_type"]
          title: string
          body: string
          data?: Json | null
          is_read?: boolean | null
          read_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          type?: Database["public"]["Enums"]["notification_type"]
          title?: string
          body?: string
          data?: Json | null
          is_read?: boolean | null
          read_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      orders: {
        Row: {
          id: string
          market_id: string
          user_id: string
          wallet_id: string
          side: Database["public"]["Enums"]["order_side"]
          type: Database["public"]["Enums"]["order_type"] | null
          status: Database["public"]["Enums"]["order_status"] | null
          amount_usd: number
          filled_usd: number | null
          remaining_usd: number | null
          currency: Database["public"]["Enums"]["currency_code"]
          amount_local: number
          exchange_rate_to_usd: number
          limit_price: number | null
          avg_fill_price: number | null
          shares: number | null
          potential_payout_usd: number | null
          fee_usd: number | null
          fee_local: number | null
          expires_at: string | null
          transaction_id: string | null
          client_order_id: string | null
          metadata: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          market_id: string
          user_id: string
          wallet_id: string
          side: Database["public"]["Enums"]["order_side"]
          type?: Database["public"]["Enums"]["order_type"] | null
          status?: Database["public"]["Enums"]["order_status"] | null
          amount_usd: number
          filled_usd?: number | null
          remaining_usd?: number | null
          currency: Database["public"]["Enums"]["currency_code"]
          amount_local: number
          exchange_rate_to_usd: number
          limit_price?: number | null
          avg_fill_price?: number | null
          shares?: number | null
          potential_payout_usd?: number | null
          fee_usd?: number | null
          fee_local?: number | null
          expires_at?: string | null
          transaction_id?: string | null
          client_order_id?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          market_id?: string
          user_id?: string
          wallet_id?: string
          side?: Database["public"]["Enums"]["order_side"]
          type?: Database["public"]["Enums"]["order_type"] | null
          status?: Database["public"]["Enums"]["order_status"] | null
          amount_usd?: number
          filled_usd?: number | null
          remaining_usd?: number | null
          currency?: Database["public"]["Enums"]["currency_code"]
          amount_local?: number
          exchange_rate_to_usd?: number
          limit_price?: number | null
          avg_fill_price?: number | null
          shares?: number | null
          potential_payout_usd?: number | null
          fee_usd?: number | null
          fee_local?: number | null
          expires_at?: string | null
          transaction_id?: string | null
          client_order_id?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          }
        ]
      }
      positions: {
        Row: {
          id: string
          user_id: string
          market_id: string
          wallet_id: string
          side: Database["public"]["Enums"]["position_side"]
          shares: number | null
          total_invested_usd: number | null
          avg_entry_price: number | null
          current_value_usd: number | null
          unrealized_pnl_usd: number | null
          realized_pnl_usd: number | null
          total_payout_usd: number | null
          is_active: boolean | null
          claimed_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          market_id: string
          wallet_id: string
          side: Database["public"]["Enums"]["position_side"]
          shares?: number | null
          total_invested_usd?: number | null
          avg_entry_price?: number | null
          current_value_usd?: number | null
          unrealized_pnl_usd?: number | null
          realized_pnl_usd?: number | null
          total_payout_usd?: number | null
          is_active?: boolean | null
          claimed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          market_id?: string
          wallet_id?: string
          side?: Database["public"]["Enums"]["position_side"]
          shares?: number | null
          total_invested_usd?: number | null
          avg_entry_price?: number | null
          current_value_usd?: number | null
          unrealized_pnl_usd?: number | null
          realized_pnl_usd?: number | null
          total_payout_usd?: number | null
          is_active?: boolean | null
          claimed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          }
        ]
      }
      price_history: {
        Row: {
          id: string
          market_id: string
          yes_price: number
          no_price: number
          volume_usd: number | null
          recorded_at: string | null
        }
        Insert: {
          id?: string
          market_id: string
          yes_price: number
          no_price: number
          volume_usd?: number | null
          recorded_at?: string | null
        }
        Update: {
          id?: string
          market_id?: string
          yes_price?: number
          no_price?: number
          volume_usd?: number | null
          recorded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          phone_number: string | null
          country_code: string | null
          preferred_currency: Database["public"]["Enums"]["currency_code"] | null
          role: Database["public"]["Enums"]["user_role"] | null
          kyc_status: Database["public"]["Enums"]["kyc_status"] | null
          kyc_completed_at: string | null
          account_status: Database["public"]["Enums"]["account_status"] | null
          referral_code: string | null
          referred_by: string | null
          referral_count: number | null
          total_volume_usd: number | null
          total_bets: number | null
          total_wins: number | null
          win_rate: number | null
          profit_loss_usd: number | null
          email_notifications: boolean | null
          sms_notifications: boolean | null
          push_notifications: boolean | null
          last_login_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          phone_number?: string | null
          country_code?: string | null
          preferred_currency?: Database["public"]["Enums"]["currency_code"] | null
          role?: Database["public"]["Enums"]["user_role"] | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"] | null
          kyc_completed_at?: string | null
          account_status?: Database["public"]["Enums"]["account_status"] | null
          referral_code?: string | null
          referred_by?: string | null
          referral_count?: number | null
          total_volume_usd?: number | null
          total_bets?: number | null
          total_wins?: number | null
          win_rate?: number | null
          profit_loss_usd?: number | null
          email_notifications?: boolean | null
          sms_notifications?: boolean | null
          push_notifications?: boolean | null
          last_login_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          username?: string | null
          display_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          phone_number?: string | null
          country_code?: string | null
          preferred_currency?: Database["public"]["Enums"]["currency_code"] | null
          role?: Database["public"]["Enums"]["user_role"] | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"] | null
          kyc_completed_at?: string | null
          account_status?: Database["public"]["Enums"]["account_status"] | null
          referral_code?: string | null
          referred_by?: string | null
          referral_count?: number | null
          total_volume_usd?: number | null
          total_bets?: number | null
          total_wins?: number | null
          win_rate?: number | null
          profit_loss_usd?: number | null
          email_notifications?: boolean | null
          sms_notifications?: boolean | null
          push_notifications?: boolean | null
          last_login_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      referrals: {
        Row: {
          id: string
          referrer_id: string
          referred_id: string
          referral_code: string
          status: string | null
          bonus_amount: number | null
          bonus_currency: Database["public"]["Enums"]["currency_code"] | null
          bonus_paid_at: string | null
          qualified_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          referrer_id: string
          referred_id: string
          referral_code: string
          status?: string | null
          bonus_amount?: number | null
          bonus_currency?: Database["public"]["Enums"]["currency_code"] | null
          bonus_paid_at?: string | null
          qualified_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          referrer_id?: string
          referred_id?: string
          referral_code?: string
          status?: string | null
          bonus_amount?: number | null
          bonus_currency?: Database["public"]["Enums"]["currency_code"] | null
          bonus_paid_at?: string | null
          qualified_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          wallet_id: string
          type: Database["public"]["Enums"]["transaction_type"]
          status: Database["public"]["Enums"]["transaction_status"] | null
          amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          amount_usd: number
          exchange_rate_to_usd: number
          fee_amount: number | null
          fee_currency: Database["public"]["Enums"]["currency_code"] | null
          net_amount: number | null
          balance_before: number
          balance_after: number
          order_id: string | null
          market_id: string | null
          payment_reference: string | null
          provider_reference: string | null
          idempotency_key: string | null
          payment_provider: Database["public"]["Enums"]["payment_provider"] | null
          payment_phone: string | null
          payment_metadata: Json | null
          description: string | null
          notes: string | null
          initiated_at: string | null
          completed_at: string | null
          failed_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          wallet_id: string
          type: Database["public"]["Enums"]["transaction_type"]
          status?: Database["public"]["Enums"]["transaction_status"] | null
          amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          amount_usd: number
          exchange_rate_to_usd: number
          fee_amount?: number | null
          fee_currency?: Database["public"]["Enums"]["currency_code"] | null
          net_amount?: number | null
          balance_before: number
          balance_after: number
          order_id?: string | null
          market_id?: string | null
          payment_reference?: string | null
          provider_reference?: string | null
          idempotency_key?: string | null
          payment_provider?: Database["public"]["Enums"]["payment_provider"] | null
          payment_phone?: string | null
          payment_metadata?: Json | null
          description?: string | null
          notes?: string | null
          initiated_at?: string | null
          completed_at?: string | null
          failed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          wallet_id?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          status?: Database["public"]["Enums"]["transaction_status"] | null
          amount?: number
          currency?: Database["public"]["Enums"]["currency_code"]
          amount_usd?: number
          exchange_rate_to_usd?: number
          fee_amount?: number | null
          fee_currency?: Database["public"]["Enums"]["currency_code"] | null
          net_amount?: number | null
          balance_before?: number
          balance_after?: number
          order_id?: string | null
          market_id?: string | null
          payment_reference?: string | null
          provider_reference?: string | null
          idempotency_key?: string | null
          payment_provider?: Database["public"]["Enums"]["payment_provider"] | null
          payment_phone?: string | null
          payment_metadata?: Json | null
          description?: string | null
          notes?: string | null
          initiated_at?: string | null
          completed_at?: string | null
          failed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          }
        ]
      }
      wallets: {
        Row: {
          id: string
          user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          available_balance: number | null
          reserved_balance: number | null
          total_deposited: number | null
          total_withdrawn: number | null
          total_won: number | null
          total_lost: number | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          available_balance?: number | null
          reserved_balance?: number | null
          total_deposited?: number | null
          total_withdrawn?: number | null
          total_won?: number | null
          total_lost?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          available_balance?: number | null
          reserved_balance?: number | null
          total_deposited?: number | null
          total_withdrawn?: number | null
          total_won?: number | null
          total_lost?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      withdrawals: {
        Row: {
          id: string
          user_id: string
          wallet_id: string
          transaction_id: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          provider: Database["public"]["Enums"]["payment_provider"]
          amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          phone_number: string
          provider_reference: string | null
          provider_receipt: string | null
          raw_response: Json | null
          exchange_rate_to_usd: number | null
          fee_amount: number | null
          net_amount: number | null
          requires_review: boolean | null
          reviewed_by: string | null
          reviewed_at: string | null
          review_notes: string | null
          initiated_at: string | null
          completed_at: string | null
          failed_at: string | null
          failure_reason: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          wallet_id: string
          transaction_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          provider: Database["public"]["Enums"]["payment_provider"]
          amount: number
          currency: Database["public"]["Enums"]["currency_code"]
          phone_number: string
          provider_reference?: string | null
          provider_receipt?: string | null
          raw_response?: Json | null
          exchange_rate_to_usd?: number | null
          fee_amount?: number | null
          net_amount?: number | null
          requires_review?: boolean | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_notes?: string | null
          initiated_at?: string | null
          completed_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          wallet_id?: string
          transaction_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          amount?: number
          currency?: Database["public"]["Enums"]["currency_code"]
          phone_number?: string
          provider_reference?: string | null
          provider_receipt?: string | null
          raw_response?: Json | null
          exchange_rate_to_usd?: number | null
          fee_amount?: number | null
          net_amount?: number | null
          requires_review?: boolean | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_notes?: string | null
          initiated_at?: string | null
          completed_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      leaderboard: {
        Row: {
          id: string | null
          display_name: string | null
          username: string | null
          avatar_url: string | null
          total_bets: number | null
          total_wins: number | null
          win_rate: number | null
          profit_loss_usd: number | null
          total_volume_usd: number | null
          volume_rank: number | null
          winrate_rank: number | null
          pnl_rank: number | null
        }
        Relationships: []
      }
      market_search: {
        Row: {
          id: string | null
          slug: string | null
          title: string | null
          description: string | null
          category: Database["public"]["Enums"]["market_category"] | null
          status: Database["public"]["Enums"]["market_status"] | null
          yes_price: number | null
          no_price: number | null
          total_volume_usd: number | null
          unique_bettors: number | null
          closes_at: string | null
          is_featured: boolean | null
          is_trending: boolean | null
          tags: string[] | null
          cover_image_url: string | null
          created_at: string | null
          search_vector: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_add_user_note: {
        Args: {
          p_user_id: string
          p_note: string
        }
        Returns: Json
      }
      admin_adjust_balance: {
        Args: {
          p_user_id: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_amount: number
          p_reason: string
          p_type?: Database["public"]["Enums"]["transaction_type"] | null
        }
        Returns: Json
      }
      admin_set_account_status: {
        Args: {
          p_user_id: string
          p_status: Database["public"]["Enums"]["account_status"]
          p_reason?: string | null
        }
        Returns: Json
      }
      admin_set_user_role: {
        Args: {
          p_user_id: string
          p_new_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: Json
      }
      has_capability: {
        Args: {
          cap: string
        }
        Returns: boolean
      }
      is_staff: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_superadmin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      admin_review_kyc: {
        Args: {
          p_doc_id: string
          p_status: Database["public"]["Enums"]["kyc_status"]
          p_reviewer_id: string
          p_rejection_reason?: string | null
        }
        Returns: Json
      }
      cancel_market: {
        Args: {
          p_market_id: string
          p_reason?: string | null
        }
        Returns: Json
      }
      handle_new_user: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      lmsr_cost_to_buy: {
        Args: {
          current_q_yes: number
          current_q_no: number
          delta_q_yes: number
          delta_q_no: number
          b?: number | null
        }
        Returns: number
      }
      lmsr_price: {
        Args: {
          q_yes: number
          q_no: number
          b?: number | null
        }
        Returns: Json
      }
      place_bet: {
        Args: {
          p_user_id: string
          p_market_id: string
          p_side: Database["public"]["Enums"]["order_side"]
          p_amount_local: number
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_order_type?: Database["public"]["Enums"]["order_type"] | null
          p_limit_price?: number | null
          p_client_order_id?: string | null
        }
        Returns: Json
      }
      refresh_leaderboard: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      search_markets: {
        Args: {
          p_query?: string | null
          p_category?: string | null
          p_status?: string | null
          p_sort?: string | null
          p_limit?: number | null
          p_offset?: number | null
        }
        Returns: Json
      }
      get_leaderboard: {
        Args: {
          p_metric?: string | null
          p_period?: string | null
          p_limit?: number | null
        }
        Returns: Json
      }
      resolve_market: {
        Args: {
          p_market_id: string
          p_outcome: Database["public"]["Enums"]["order_side"]
          p_resolver_id: string
          p_resolution_notes?: string | null
        }
        Returns: Json
      }
      update_profile_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
    }
    Enums: {
      account_status: "active" | "suspended" | "closed"
      currency_code: "KES" | "UGX" | "TZS" | "RWF" | "ZMW" | "ETB" | "BIF" | "USD"
      kyc_status: "unverified" | "pending" | "verified" | "rejected"
      market_category: "politics" | "sports" | "economics" | "crypto" | "technology" | "entertainment" | "weather" | "governance" | "elections" | "business" | "health" | "social" | "other"
      market_resolution_type: "binary" | "multiple_choice"
      market_status: "draft" | "pending" | "active" | "closed" | "resolved" | "disputed" | "cancelled"
      notification_type: "market_created" | "market_resolved" | "bet_filled" | "bet_won" | "bet_lost" | "deposit_completed" | "withdrawal_completed" | "withdrawal_failed" | "price_alert" | "market_closing_soon" | "referral_bonus" | "kyc_approved" | "kyc_rejected" | "system_announcement"
      order_side: "yes" | "no"
      order_status: "open" | "filled" | "partially_filled" | "cancelled" | "expired"
      order_type: "market" | "limit"
      payment_provider: "mpesa" | "mtn_momo" | "airtel_money" | "pesapal" | "bank_transfer" | "internal"
      position_side: "yes" | "no"
      transaction_status: "pending" | "processing" | "completed" | "failed" | "refunded"
      transaction_type: "deposit" | "withdrawal" | "bet_placed" | "bet_won" | "bet_lost" | "bet_refunded" | "fee" | "bonus" | "referral_bonus" | "creator_reward"
      user_role: "user" | "admin" | "moderator" | "resolver" | "creator" | "marketer" | "support" | "finance" | "superadmin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database['public']
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]

