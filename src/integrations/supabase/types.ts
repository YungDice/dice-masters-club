export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          description: string
          dice_reward: number
          icon: string | null
          id: string
          name: string
          xp_reward: number
        }
        Insert: {
          description: string
          dice_reward?: number
          icon?: string | null
          id: string
          name: string
          xp_reward?: number
        }
        Update: {
          description?: string
          dice_reward?: number
          icon?: string | null
          id?: string
          name?: string
          xp_reward?: number
        }
        Relationships: []
      }
      activity_feed: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          title: string
          user_id: string
          visibility: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          title: string
          user_id: string
          visibility?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          title?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      admin_announcements: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          pinned: boolean
          title: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          pinned?: boolean
          title: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      baddie_templates: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          income_per_hour: number
          name: string
          rarity: string
          weight: number
        }
        Insert: {
          created_at?: string
          id: string
          image_url?: string | null
          income_per_hour: number
          name: string
          rarity: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          income_per_hour?: number
          name?: string
          rarity?: string
          weight?: number
        }
        Relationships: []
      }
      challenge_comments: {
        Row: {
          body: string
          challenge_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          challenge_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          body?: string
          challenge_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_comments_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_likes: {
        Row: {
          challenge_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_likes_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_participants: {
        Row: {
          challenge_id: string
          completed: boolean
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed?: boolean
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed?: boolean
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_proofs: {
        Row: {
          caption: string | null
          challenge_id: string
          created_at: string
          id: string
          media_kind: string | null
          media_url: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          status: Database["public"]["Enums"]["proof_status"]
          text_response: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          challenge_id: string
          created_at?: string
          id?: string
          media_kind?: string | null
          media_url?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["proof_status"]
          text_response?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          challenge_id?: string
          created_at?: string
          id?: string
          media_kind?: string | null
          media_url?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["proof_status"]
          text_response?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_proofs_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          category: Database["public"]["Enums"]["challenge_category"]
          cover_url: string | null
          created_at: string
          creator_id: string | null
          deadline: string | null
          description: string
          dice_reward: number
          difficulty: Database["public"]["Enums"]["difficulty"]
          id: string
          is_daily: boolean
          is_featured: boolean
          max_participants: number | null
          proof_type: Database["public"]["Enums"]["proof_type"]
          rules: string | null
          status: Database["public"]["Enums"]["challenge_status"]
          tags: string[]
          title: string
          updated_at: string
          xp_reward: number
        }
        Insert: {
          category: Database["public"]["Enums"]["challenge_category"]
          cover_url?: string | null
          created_at?: string
          creator_id?: string | null
          deadline?: string | null
          description: string
          dice_reward?: number
          difficulty?: Database["public"]["Enums"]["difficulty"]
          id?: string
          is_daily?: boolean
          is_featured?: boolean
          max_participants?: number | null
          proof_type?: Database["public"]["Enums"]["proof_type"]
          rules?: string | null
          status?: Database["public"]["Enums"]["challenge_status"]
          tags?: string[]
          title: string
          updated_at?: string
          xp_reward?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["challenge_category"]
          cover_url?: string | null
          created_at?: string
          creator_id?: string | null
          deadline?: string | null
          description?: string
          dice_reward?: number
          difficulty?: Database["public"]["Enums"]["difficulty"]
          id?: string
          is_daily?: boolean
          is_featured?: boolean
          max_participants?: number | null
          proof_type?: Database["public"]["Enums"]["proof_type"]
          rules?: string | null
          status?: Database["public"]["Enums"]["challenge_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          xp_reward?: number
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string | null
          created_at: string
          id: string
          media_kind: string | null
          media_url: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          media_kind?: string | null
          media_url?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          media_kind?: string | null
          media_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_leaderboard_rewards: {
        Row: {
          created_at: string
          dice_awarded: number
          rank: number
          reward_date: string
          user_id: string
          vip_hours: number
          xp_gained: number
        }
        Insert: {
          created_at?: string
          dice_awarded?: number
          rank: number
          reward_date: string
          user_id: string
          vip_hours?: number
          xp_gained?: number
        }
        Update: {
          created_at?: string
          dice_awarded?: number
          rank?: number
          reward_date?: string
          user_id?: string
          vip_hours?: number
          xp_gained?: number
        }
        Relationships: []
      }
      daily_xp_snapshots: {
        Row: {
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      dice_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          id: string
          note: string | null
          operation_id: string | null
          ref_id: string | null
          ref_kind: string | null
          source: string | null
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          id?: string
          note?: string | null
          operation_id?: string | null
          ref_id?: string | null
          ref_kind?: string | null
          source?: string | null
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          id?: string
          note?: string | null
          operation_id?: string | null
          ref_id?: string | null
          ref_kind?: string | null
          source?: string | null
          type?: Database["public"]["Enums"]["tx_type"]
          user_id?: string
        }
        Relationships: []
      }
      dice_wallets: {
        Row: {
          balance: number
          lifetime_earned: number
          lifetime_spent: number
          locked: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          locked?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          locked?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friend_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friend_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friend_status"]
          updated_at?: string
        }
        Relationships: []
      }
      gallery_items: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          is_public: boolean
          media_kind: string
          media_path: string
          media_url: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          media_kind: string
          media_path: string
          media_url: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          media_kind?: string
          media_path?: string
          media_url?: string
          user_id?: string
        }
        Relationships: []
      }
      gallery_likes: {
        Row: {
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_likes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "gallery_items"
            referencedColumns: ["id"]
          },
        ]
      }
      game_invites: {
        Row: {
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          room_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          room_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          room_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_invites_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          id: string
          joined_at: string
          room_id: string
          seat: number
          staked: number
          state: Json
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          room_id: string
          seat?: number
          staked?: number
          state?: Json
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          room_id?: string
          seat?: number
          staked?: number
          state?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      game_private_state: {
        Row: {
          room_id: string
          state: Json
          updated_at: string
        }
        Insert: {
          room_id: string
          state?: Json
          updated_at?: string
        }
        Update: {
          room_id?: string
          state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_private_state_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      game_results: {
        Row: {
          created_at: string
          delta: number
          details: Json | null
          id: string
          kind: Database["public"]["Enums"]["game_kind"]
          outcome: string | null
          payout: number
          room_id: string
          user_id: string
          wagered: number
        }
        Insert: {
          created_at?: string
          delta: number
          details?: Json | null
          id?: string
          kind: Database["public"]["Enums"]["game_kind"]
          outcome?: string | null
          payout?: number
          room_id: string
          user_id: string
          wagered?: number
        }
        Update: {
          created_at?: string
          delta?: number
          details?: Json | null
          id?: string
          kind?: Database["public"]["Enums"]["game_kind"]
          outcome?: string | null
          payout?: number
          room_id?: string
          user_id?: string
          wagered?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_results_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rooms: {
        Row: {
          created_at: string
          finished_at: string | null
          host_id: string
          id: string
          invite_code: string | null
          is_private: boolean
          kind: Database["public"]["Enums"]["game_kind"]
          max_players: number
          stake: number
          state: Json
          status: Database["public"]["Enums"]["room_status"]
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          host_id: string
          id?: string
          invite_code?: string | null
          is_private?: boolean
          kind: Database["public"]["Enums"]["game_kind"]
          max_players?: number
          stake?: number
          state?: Json
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          host_id?: string
          id?: string
          invite_code?: string | null
          is_private?: boolean
          kind?: Database["public"]["Enums"]["game_kind"]
          max_players?: number
          stake?: number
          state?: Json
          status?: Database["public"]["Enums"]["room_status"]
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: []
      }
      marketplace_bids: {
        Row: {
          amount: number
          bidder_id: string
          created_at: string
          id: string
          listing_id: string
          status: string
        }
        Insert: {
          amount: number
          bidder_id: string
          created_at?: string
          id?: string
          listing_id: string
          status?: string
        }
        Update: {
          amount?: number
          bidder_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_bids_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_favorites: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          auction_ends_at: string | null
          category: string
          created_at: string
          current_bid: number | null
          current_bidder_id: string | null
          description: string
          file_url: string | null
          id: string
          license_notes: string | null
          min_bid: number | null
          ownership_confirmed: boolean
          preview_url: string | null
          price: number
          sale_type: string
          sales_count: number
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          tag_value: string | null
          tags: string[]
          title: string
          updated_at: string
          username_value: string | null
          winner_id: string | null
        }
        Insert: {
          auction_ends_at?: string | null
          category: string
          created_at?: string
          current_bid?: number | null
          current_bidder_id?: string | null
          description: string
          file_url?: string | null
          id?: string
          license_notes?: string | null
          min_bid?: number | null
          ownership_confirmed?: boolean
          preview_url?: string | null
          price: number
          sale_type?: string
          sales_count?: number
          seller_id: string
          status?: Database["public"]["Enums"]["listing_status"]
          tag_value?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          username_value?: string | null
          winner_id?: string | null
        }
        Update: {
          auction_ends_at?: string | null
          category?: string
          created_at?: string
          current_bid?: number | null
          current_bidder_id?: string | null
          description?: string
          file_url?: string | null
          id?: string
          license_notes?: string | null
          min_bid?: number | null
          ownership_confirmed?: boolean
          preview_url?: string | null
          price?: number
          sale_type?: string
          sales_count?: number
          seller_id?: string
          status?: Database["public"]["Enums"]["listing_status"]
          tag_value?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          username_value?: string | null
          winner_id?: string | null
        }
        Relationships: []
      }
      marketplace_purchases: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          listing_id: string
          price: number
          seller_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          listing_id: string
          price: number
          seller_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          price?: number
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_purchases_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          moderator_id: string
          reason: string | null
          target_id: string
          target_kind: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          moderator_id: string
          reason?: string | null
          target_id: string
          target_kind: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          moderator_id?: string
          reason?: string | null
          target_id?: string
          target_kind?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_private: {
        Row: {
          created_at: string
          dob: string
          is_18_plus: boolean
          terms_accepted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dob: string
          is_18_plus?: boolean
          terms_accepted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dob?: string
          is_18_plus?: boolean
          terms_accepted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_tags: {
        Row: {
          acquired_at: string
          id: string
          tag: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          id?: string
          tag: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          id?: string
          tag?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          display_name: string
          dob: string
          id: string
          is_18_plus: boolean
          last_login_at: string | null
          last_seen_at: string | null
          last_streak_date: string | null
          last_xp_tick_at: string | null
          level: number
          privacy_activity: string
          privacy_profile: string
          profile_bg_url: string | null
          reputation: number
          streak_days: number
          tag: string | null
          terms_accepted_at: string
          updated_at: string
          username: string
          username_changed_at: string | null
          username_free_change_available: boolean
          vip_until: string | null
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name: string
          dob: string
          id: string
          is_18_plus?: boolean
          last_login_at?: string | null
          last_seen_at?: string | null
          last_streak_date?: string | null
          last_xp_tick_at?: string | null
          level?: number
          privacy_activity?: string
          privacy_profile?: string
          profile_bg_url?: string | null
          reputation?: number
          streak_days?: number
          tag?: string | null
          terms_accepted_at?: string
          updated_at?: string
          username: string
          username_changed_at?: string | null
          username_free_change_available?: boolean
          vip_until?: string | null
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name?: string
          dob?: string
          id?: string
          is_18_plus?: boolean
          last_login_at?: string | null
          last_seen_at?: string | null
          last_streak_date?: string | null
          last_xp_tick_at?: string | null
          level?: number
          privacy_activity?: string
          privacy_profile?: string
          profile_bg_url?: string | null
          reputation?: number
          streak_days?: number
          tag?: string | null
          terms_accepted_at?: string
          updated_at?: string
          username?: string
          username_changed_at?: string | null
          username_free_change_available?: boolean
          vip_until?: string | null
          xp?: number
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          user_id: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          user_id: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_kind: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_kind: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_kind?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_baddies: {
        Row: {
          acquired_at: string
          id: string
          last_collected_at: string
          name: string | null
          template_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          id?: string
          last_collected_at?: string
          name?: string | null
          template_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          id?: string
          last_collected_at?: string
          name?: string | null
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_baddies_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "baddie_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          notif_challenges: boolean
          notif_friend_requests: boolean
          notif_games: boolean
          notif_marketplace: boolean
          responsible_play_break_minutes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notif_challenges?: boolean
          notif_friend_requests?: boolean
          notif_games?: boolean
          notif_marketplace?: boolean
          responsible_play_break_minutes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          notif_challenges?: boolean
          notif_friend_requests?: boolean
          notif_games?: boolean
          notif_marketplace?: boolean
          responsible_play_break_minutes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      user_game_stats: {
        Row: {
          games_played: number | null
          losses: number | null
          net: number | null
          ties: number | null
          total_lost: number | null
          total_wagered: number | null
          total_won: number | null
          user_id: string | null
          wins: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_delete_challenge_tx: {
        Args: { _challenge_id: string; _reason: string }
        Returns: Json
      }
      admin_delete_listing_tx: {
        Args: { _listing_id: string; _reason: string }
        Returns: Json
      }
      assert_bet_within_limit: {
        Args: { _amount: number; _uid: string }
        Returns: undefined
      }
      award_daily_leaderboard_rewards: { Args: never; Returns: Json }
      award_idle_xp: { Args: { _uid: string }; Returns: Json }
      buy_listing_tx: {
        Args: { _buyer: string; _listing_id: string }
        Returns: Json
      }
      change_username: { Args: { _new_username: string }; Returns: Json }
      claim_daily_tx: { Args: { _uid: string }; Returns: Json }
      cleanup_stale_data: { Args: never; Returns: undefined }
      collect_baddie_tx: {
        Args: { _baddie_id: string }
        Returns: {
          amount: number
          last_collected_at: string
        }[]
      }
      expire_auctions: { Args: never; Returns: number }
      expire_vip_status: { Args: never; Returns: number }
      grant_achievement_tx: {
        Args: { _achievement: string; _user: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_vip: { Args: { _uid: string }; Returns: boolean }
      open_baddie_case_tx: {
        Args: never
        Returns: {
          image_url: string
          income_per_hour: number
          name: string
          rarity: string
          template_id: string
          user_baddie_id: string
        }[]
      }
      place_bid_tx: {
        Args: { _amount: number; _bidder: string; _listing_id: string }
        Returns: Json
      }
      pvp_payout_tx: {
        Args: {
          _loser: string
          _loser_amount: number
          _note: string
          _room_id: string
          _source: string
          _winner: string
          _winner_amount: number
        }
        Returns: Json
      }
      rate_limit_hit: {
        Args: {
          _key: string
          _max_hits: number
          _user: string
          _window_seconds: number
        }
        Returns: boolean
      }
      record_game_result:
        | {
            Args: {
              _delta: number
              _details: Json
              _kind: string
              _outcome: string
              _room_id: string
              _uid: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _delta: number
              _details: Json
              _kind: string
              _outcome: string
              _payout?: number
              _room_id: string
              _uid: string
              _wagered?: number
            }
            Returns: undefined
          }
      review_proof_tx: {
        Args: {
          _approve: boolean
          _notes: string
          _proof_id: string
          _reviewer: string
        }
        Returns: Json
      }
      set_active_tag: { Args: { _tag: string }; Returns: Json }
      settle_auction_tx: { Args: { _listing_id: string }; Returns: Json }
      touch_presence: { Args: never; Returns: Json }
      wallet_adjust: {
        Args: {
          _delta: number
          _note: string
          _ref_id: string
          _ref_kind: string
          _source: string
          _type: Database["public"]["Enums"]["tx_type"]
          _user: string
        }
        Returns: number
      }
      wallet_adjust_idem: {
        Args: {
          _delta: number
          _note: string
          _op_id: string
          _ref_id: string
          _ref_kind: string
          _source: string
          _type: Database["public"]["Enums"]["tx_type"]
          _user: string
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "user" | "moderator" | "admin" | "owner"
      challenge_category:
        | "fitness"
        | "creativity"
        | "gaming"
        | "social"
        | "photography"
        | "video"
        | "daily"
        | "community"
        | "skill"
        | "funny"
        | "custom"
      challenge_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "rejected"
        | "active"
        | "closed"
        | "archived"
      difficulty: "easy" | "medium" | "hard" | "extreme"
      friend_status: "pending" | "accepted" | "blocked"
      game_kind:
        | "dice"
        | "coinflip"
        | "poker"
        | "blackjack"
        | "slots"
        | "split_steal"
        | "flappy"
        | "obby"
      listing_status:
        | "draft"
        | "pending_review"
        | "active"
        | "sold"
        | "removed"
        | "rejected"
        | "expired"
      notification_kind:
        | "friend_request"
        | "friend_accept"
        | "challenge_invite"
        | "challenge_approved"
        | "challenge_rejected"
        | "proof_result"
        | "game_invite"
        | "game_turn"
        | "marketplace_sale"
        | "marketplace_purchase"
        | "badge_unlock"
        | "leaderboard"
        | "admin_announcement"
        | "auction_outbid"
        | "auction_won"
      proof_status: "pending" | "approved" | "rejected"
      proof_type:
        | "text"
        | "photo"
        | "gif"
        | "video"
        | "camera"
        | "live_camera"
        | "admin_review"
        | "community_vote"
        | "auto_timer"
      report_status: "open" | "reviewing" | "resolved" | "dismissed"
      room_status: "waiting" | "active" | "finished" | "cancelled"
      tx_type:
        | "challenge_reward"
        | "game_win"
        | "game_stake"
        | "game_payout"
        | "daily_reward"
        | "streak_reward"
        | "achievement"
        | "event"
        | "referral"
        | "marketplace_sale"
        | "marketplace_purchase"
        | "admin_adjust"
        | "escrow_lock"
        | "escrow_release"
        | "refund"
        | "fee"
        | "auction_won"
        | "auction_outbid"
        | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "moderator", "admin", "owner"],
      challenge_category: [
        "fitness",
        "creativity",
        "gaming",
        "social",
        "photography",
        "video",
        "daily",
        "community",
        "skill",
        "funny",
        "custom",
      ],
      challenge_status: [
        "draft",
        "pending_review",
        "approved",
        "rejected",
        "active",
        "closed",
        "archived",
      ],
      difficulty: ["easy", "medium", "hard", "extreme"],
      friend_status: ["pending", "accepted", "blocked"],
      game_kind: [
        "dice",
        "coinflip",
        "poker",
        "blackjack",
        "slots",
        "split_steal",
        "flappy",
        "obby",
      ],
      listing_status: [
        "draft",
        "pending_review",
        "active",
        "sold",
        "removed",
        "rejected",
        "expired",
      ],
      notification_kind: [
        "friend_request",
        "friend_accept",
        "challenge_invite",
        "challenge_approved",
        "challenge_rejected",
        "proof_result",
        "game_invite",
        "game_turn",
        "marketplace_sale",
        "marketplace_purchase",
        "badge_unlock",
        "leaderboard",
        "admin_announcement",
        "auction_outbid",
        "auction_won",
      ],
      proof_status: ["pending", "approved", "rejected"],
      proof_type: [
        "text",
        "photo",
        "gif",
        "video",
        "camera",
        "live_camera",
        "admin_review",
        "community_vote",
        "auto_timer",
      ],
      report_status: ["open", "reviewing", "resolved", "dismissed"],
      room_status: ["waiting", "active", "finished", "cancelled"],
      tx_type: [
        "challenge_reward",
        "game_win",
        "game_stake",
        "game_payout",
        "daily_reward",
        "streak_reward",
        "achievement",
        "event",
        "referral",
        "marketplace_sale",
        "marketplace_purchase",
        "admin_adjust",
        "escrow_lock",
        "escrow_release",
        "refund",
        "fee",
        "auction_won",
        "auction_outbid",
        "expired",
      ],
    },
  },
} as const
