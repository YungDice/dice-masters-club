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
          payload: Json
          title: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          payload?: Json
          title?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          payload?: Json
          title?: string | null
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
      baddie_upgrades: {
        Row: {
          awarded_baddie_id: string | null
          chance_pct: number
          created_at: string
          id: string
          material_count: number
          material_template_ids: string[]
          success: boolean
          target_template_id: string
          user_id: string
        }
        Insert: {
          awarded_baddie_id?: string | null
          chance_pct: number
          created_at?: string
          id?: string
          material_count: number
          material_template_ids: string[]
          success: boolean
          target_template_id: string
          user_id: string
        }
        Update: {
          awarded_baddie_id?: string | null
          chance_pct?: number
          created_at?: string
          id?: string
          material_count?: number
          material_template_ids?: string[]
          success?: boolean
          target_template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baddie_upgrades_awarded_baddie_id_fkey"
            columns: ["awarded_baddie_id"]
            isOneToOne: false
            referencedRelation: "user_baddies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baddie_upgrades_target_template_id_fkey"
            columns: ["target_template_id"]
            isOneToOne: false
            referencedRelation: "baddie_templates"
            referencedColumns: ["id"]
          },
        ]
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
      cosmetic_submissions: {
        Row: {
          cosmetic_id: string | null
          created_at: string
          fee_paid: number
          id: string
          kind: string
          meta: Json
          name: string
          price_dice: number
          rarity: string
          review_notes: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          submitter_id: string
        }
        Insert: {
          cosmetic_id?: string | null
          created_at?: string
          fee_paid?: number
          id?: string
          kind: string
          meta?: Json
          name: string
          price_dice?: number
          rarity?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitter_id: string
        }
        Update: {
          cosmetic_id?: string | null
          created_at?: string
          fee_paid?: number
          id?: string
          kind?: string
          meta?: Json
          name?: string
          price_dice?: number
          rarity?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cosmetic_submissions_cosmetic_id_fkey"
            columns: ["cosmetic_id"]
            isOneToOne: false
            referencedRelation: "cosmetics"
            referencedColumns: ["id"]
          },
        ]
      }
      cosmetics: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          meta: Json
          name: string
          price_dice: number
          rarity: string
          slug: string
          vip_only: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          name: string
          price_dice?: number
          rarity?: string
          slug: string
          vip_only?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          name?: string
          price_dice?: number
          rarity?: string
          slug?: string
          vip_only?: boolean
        }
        Relationships: []
      }
      crew_donations: {
        Row: {
          amount: number
          created_at: string
          crew_id: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          crew_id: string
          id?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          crew_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_donations_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_donations_user_id_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_donations_user_id_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_game_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crew_join_requests: {
        Row: {
          created_at: string
          crew_id: string
          id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["crew_join_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["crew_join_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["crew_join_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_join_requests_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_join_requests_user_id_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_join_requests_user_id_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_game_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crew_members: {
        Row: {
          contribution_total: number
          contribution_weekly: number
          crew_id: string
          joined_at: string
          role: Database["public"]["Enums"]["crew_role"]
          user_id: string
        }
        Insert: {
          contribution_total?: number
          contribution_weekly?: number
          crew_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["crew_role"]
          user_id: string
        }
        Update: {
          contribution_total?: number
          contribution_weekly?: number
          crew_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["crew_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_user_id_profile_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_user_id_profile_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_game_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crew_mission_templates: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string
          id: string
          metric: Database["public"]["Enums"]["crew_mission_metric"]
          name: string
          reward_dice: number
          reward_points: number
          target: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description: string
          id?: string
          metric: Database["public"]["Enums"]["crew_mission_metric"]
          name: string
          reward_dice?: number
          reward_points?: number
          target: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string
          id?: string
          metric?: Database["public"]["Enums"]["crew_mission_metric"]
          name?: string
          reward_dice?: number
          reward_points?: number
          target?: number
        }
        Relationships: []
      }
      crew_missions: {
        Row: {
          completed_at: string | null
          created_at: string
          crew_id: string
          id: string
          metric: Database["public"]["Enums"]["crew_mission_metric"]
          progress: number
          reward_dice: number
          reward_points: number
          slot: number
          source: string
          target: number
          template_id: string
          updated_at: string
          week_start: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          crew_id: string
          id?: string
          metric: Database["public"]["Enums"]["crew_mission_metric"]
          progress?: number
          reward_dice?: number
          reward_points?: number
          slot: number
          source?: string
          target: number
          template_id: string
          updated_at?: string
          week_start: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          crew_id?: string
          id?: string
          metric?: Database["public"]["Enums"]["crew_mission_metric"]
          progress?: number
          reward_dice?: number
          reward_points?: number
          slot?: number
          source?: string
          target?: number
          template_id?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_missions_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_missions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "crew_mission_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_weekly_rankings: {
        Row: {
          created_at: string
          crew_id: string
          crew_name: string
          crew_tag: string
          id: string
          rank: number
          reward_dice: number
          score: number
          week_start: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          crew_name: string
          crew_tag: string
          id?: string
          rank: number
          reward_dice?: number
          score: number
          week_start: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          crew_name?: string
          crew_tag?: string
          id?: string
          rank?: number
          reward_dice?: number
          score?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_weekly_rankings_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          avatar_url: string | null
          banner_url: string | null
          created_at: string
          description: string | null
          id: string
          is_open: boolean
          level: number
          max_members: number
          member_count: number
          min_level: number
          name: string
          owner_id: string
          tag: string
          total_score: number
          updated_at: string
          weekly_score: number
          xp: number
        }
        Insert: {
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_open?: boolean
          level?: number
          max_members?: number
          member_count?: number
          min_level?: number
          name: string
          owner_id: string
          tag: string
          total_score?: number
          updated_at?: string
          weekly_score?: number
          xp?: number
        }
        Update: {
          avatar_url?: string | null
          banner_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_open?: boolean
          level?: number
          max_members?: number
          member_count?: number
          min_level?: number
          name?: string
          owner_id?: string
          tag?: string
          total_score?: number
          updated_at?: string
          weekly_score?: number
          xp?: number
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
      daily_missions: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          mission_date: string
          mission_key: string
          progress: number
          reward_dice: number
          reward_xp: number
          slot: number
          target: number
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          mission_date: string
          mission_key: string
          progress?: number
          reward_dice?: number
          reward_xp?: number
          slot: number
          target: number
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          mission_date?: string
          mission_key?: string
          progress?: number
          reward_dice?: number
          reward_xp?: number
          slot?: number
          target?: number
          user_id?: string
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
      dominion_battles: {
        Row: {
          attack_power: number
          client_action_id: string
          created_at: string
          defense_power: number
          id: string
          outcome: string
          rewards: Json
          sector_id: number
          survivors: Json
          units_sent: Json
          user_id: string
        }
        Insert: {
          attack_power: number
          client_action_id: string
          created_at?: string
          defense_power: number
          id?: string
          outcome: string
          rewards?: Json
          sector_id: number
          survivors: Json
          units_sent: Json
          user_id: string
        }
        Update: {
          attack_power?: number
          client_action_id?: string
          created_at?: string
          defense_power?: number
          id?: string
          outcome?: string
          rewards?: Json
          sector_id?: number
          survivors?: Json
          units_sent?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dominion_battles_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "dominion_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      dominion_buildings: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["dominion_building_kind"]
          last_collected_at: string
          level: number
          slot_x: number
          slot_y: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["dominion_building_kind"]
          last_collected_at?: string
          level?: number
          slot_x: number
          slot_y: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["dominion_building_kind"]
          last_collected_at?: string
          level?: number
          slot_x?: number
          slot_y?: number
          user_id?: string
        }
        Relationships: []
      }
      dominion_daily_rewards: {
        Row: {
          day: string
          dice_amount: number
          granted_at: string
          kind: string
          op_id: string
          user_id: string
        }
        Insert: {
          day: string
          dice_amount: number
          granted_at?: string
          kind: string
          op_id: string
          user_id: string
        }
        Update: {
          day?: string
          dice_amount?: number
          granted_at?: string
          kind?: string
          op_id?: string
          user_id?: string
        }
        Relationships: []
      }
      dominion_jobs: {
        Row: {
          client_action_id: string
          created_at: string
          ends_at: string
          finished: boolean
          id: string
          kind: Database["public"]["Enums"]["dominion_job_kind"]
          payload: Json
          ref_id: string | null
          starts_at: string
          user_id: string
        }
        Insert: {
          client_action_id: string
          created_at?: string
          ends_at: string
          finished?: boolean
          id?: string
          kind: Database["public"]["Enums"]["dominion_job_kind"]
          payload?: Json
          ref_id?: string | null
          starts_at?: string
          user_id: string
        }
        Update: {
          client_action_id?: string
          created_at?: string
          ends_at?: string
          finished?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["dominion_job_kind"]
          payload?: Json
          ref_id?: string | null
          starts_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dominion_profiles: {
        Row: {
          command_energy: number
          command_energy_updated_at: string
          created_at: string
          hq_level: number
          initialized_at: string
          power: number
          roll_credits: number
          scrap: number
          updated_at: string
          user_id: string
          workers: number
          xp: number
        }
        Insert: {
          command_energy?: number
          command_energy_updated_at?: string
          created_at?: string
          hq_level?: number
          initialized_at?: string
          power?: number
          roll_credits?: number
          scrap?: number
          updated_at?: string
          user_id: string
          workers?: number
          xp?: number
        }
        Update: {
          command_energy?: number
          command_energy_updated_at?: string
          created_at?: string
          hq_level?: number
          initialized_at?: string
          power?: number
          roll_credits?: number
          scrap?: number
          updated_at?: string
          user_id?: string
          workers?: number
          xp?: number
        }
        Relationships: []
      }
      dominion_research: {
        Row: {
          branch: Database["public"]["Enums"]["dominion_research_branch"]
          level: number
          node: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch: Database["public"]["Enums"]["dominion_research_branch"]
          level?: number
          node: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch?: Database["public"]["Enums"]["dominion_research_branch"]
          level?: number
          node?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dominion_sectors: {
        Row: {
          created_at: string
          id: number
          kind: Database["public"]["Enums"]["dominion_sector_kind"]
          name: string
          reward_power: number
          reward_roll_credits: number
          reward_scrap: number
          strength: number
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          id: number
          kind: Database["public"]["Enums"]["dominion_sector_kind"]
          name: string
          reward_power?: number
          reward_roll_credits?: number
          reward_scrap?: number
          strength: number
          x: number
          y: number
        }
        Update: {
          created_at?: string
          id?: number
          kind?: Database["public"]["Enums"]["dominion_sector_kind"]
          name?: string
          reward_power?: number
          reward_roll_credits?: number
          reward_scrap?: number
          strength?: number
          x?: number
          y?: number
        }
        Relationships: []
      }
      dominion_units: {
        Row: {
          count: number
          kind: Database["public"]["Enums"]["dominion_unit_kind"]
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          kind: Database["public"]["Enums"]["dominion_unit_kind"]
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          kind?: Database["public"]["Enums"]["dominion_unit_kind"]
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
          room_id: string | null
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
          room_id?: string | null
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
          room_id?: string | null
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
          baddie_id: string | null
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
          baddie_id?: string | null
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
          baddie_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_baddie_id_fkey"
            columns: ["baddie_id"]
            isOneToOne: false
            referencedRelation: "user_baddies"
            referencedColumns: ["id"]
          },
        ]
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
          autosell_rarities: string[]
          avatar_url: string | null
          baddie_slots_bought: number
          banner_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          display_name: string
          dob: string
          equipped_banner_id: string | null
          equipped_dice_skin_id: string | null
          equipped_frame_id: string | null
          equipped_title_id: string | null
          favorite_achievement_id: string | null
          favorite_baddie_id: string | null
          favorite_game: string | null
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
          user_emoji: string | null
          username: string
          username_changed_at: string | null
          username_free_change_available: boolean
          vip_until: string | null
          win_pose_url: string | null
          xp: number
          yuri_autosell_rarities: string[]
        }
        Insert: {
          autosell_rarities?: string[]
          avatar_url?: string | null
          baddie_slots_bought?: number
          banner_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name: string
          dob: string
          equipped_banner_id?: string | null
          equipped_dice_skin_id?: string | null
          equipped_frame_id?: string | null
          equipped_title_id?: string | null
          favorite_achievement_id?: string | null
          favorite_baddie_id?: string | null
          favorite_game?: string | null
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
          user_emoji?: string | null
          username: string
          username_changed_at?: string | null
          username_free_change_available?: boolean
          vip_until?: string | null
          win_pose_url?: string | null
          xp?: number
          yuri_autosell_rarities?: string[]
        }
        Update: {
          autosell_rarities?: string[]
          avatar_url?: string | null
          baddie_slots_bought?: number
          banner_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          display_name?: string
          dob?: string
          equipped_banner_id?: string | null
          equipped_dice_skin_id?: string | null
          equipped_frame_id?: string | null
          equipped_title_id?: string | null
          favorite_achievement_id?: string | null
          favorite_baddie_id?: string | null
          favorite_game?: string | null
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
          user_emoji?: string | null
          username?: string
          username_changed_at?: string | null
          username_free_change_available?: boolean
          vip_until?: string | null
          win_pose_url?: string | null
          xp?: number
          yuri_autosell_rarities?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_equipped_banner_id_fkey"
            columns: ["equipped_banner_id"]
            isOneToOne: false
            referencedRelation: "cosmetics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_equipped_dice_skin_id_fkey"
            columns: ["equipped_dice_skin_id"]
            isOneToOne: false
            referencedRelation: "cosmetics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_equipped_frame_id_fkey"
            columns: ["equipped_frame_id"]
            isOneToOne: false
            referencedRelation: "cosmetics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_equipped_title_id_fkey"
            columns: ["equipped_title_id"]
            isOneToOne: false
            referencedRelation: "cosmetics"
            referencedColumns: ["id"]
          },
        ]
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
      season_claims: {
        Row: {
          claimed_at: string
          season_id: string
          tier: number
          track: string
          user_id: string
        }
        Insert: {
          claimed_at?: string
          season_id: string
          tier: number
          track: string
          user_id: string
        }
        Update: {
          claimed_at?: string
          season_id?: string
          tier?: number
          track?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_claims_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      season_progress: {
        Row: {
          baseline_xp: number
          bonus_xp: number
          created_at: string
          season_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline_xp?: number
          bonus_xp?: number
          created_at?: string
          season_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline_xp?: number
          bonus_xp?: number
          created_at?: string
          season_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_progress_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      season_tiers: {
        Row: {
          free_reward: Json
          id: string
          season_id: string
          tier: number
          vip_reward: Json
        }
        Insert: {
          free_reward?: Json
          id?: string
          season_id: string
          tier: number
          vip_reward?: Json
        }
        Update: {
          free_reward?: Json
          id?: string
          season_id?: string
          tier?: number
          vip_reward?: Json
        }
        Relationships: [
          {
            foreignKeyName: "season_tiers_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string
          id: string
          name: string
          starts_at: string
          tier_count: number
          xp_per_tier: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at: string
          id?: string
          name: string
          starts_at?: string
          tier_count?: number
          xp_per_tier?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string
          id?: string
          name?: string
          starts_at?: string
          tier_count?: number
          xp_per_tier?: number
        }
        Relationships: []
      }
      trades: {
        Row: {
          created_at: string
          expires_at: string
          from_baddies: string[]
          from_dice: number
          from_user: string
          id: string
          note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["trade_status"]
          to_baddies: string[]
          to_dice: number
          to_user: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          from_baddies?: string[]
          from_dice?: number
          from_user: string
          id?: string
          note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["trade_status"]
          to_baddies?: string[]
          to_dice?: number
          to_user: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          from_baddies?: string[]
          from_dice?: number
          from_user?: string
          id?: string
          note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["trade_status"]
          to_baddies?: string[]
          to_dice?: number
          to_user?: string
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
      user_baddie_case_tokens: {
        Row: {
          tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_baddies: {
        Row: {
          acquired_at: string
          id: string
          last_collected_at: string
          listing_id: string | null
          name: string | null
          template_id: string
          tier: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          acquired_at?: string
          id?: string
          last_collected_at?: string
          listing_id?: string | null
          name?: string | null
          template_id: string
          tier?: string
          trade_id?: string | null
          user_id: string
        }
        Update: {
          acquired_at?: string
          id?: string
          last_collected_at?: string
          listing_id?: string | null
          name?: string | null
          template_id?: string
          tier?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_baddies_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_baddies_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "baddie_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cosmetics: {
        Row: {
          acquired_at: string
          cosmetic_id: string
          id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          cosmetic_id: string
          id?: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          cosmetic_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cosmetics_cosmetic_id_fkey"
            columns: ["cosmetic_id"]
            isOneToOne: false
            referencedRelation: "cosmetics"
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
      user_streaks: {
        Row: {
          best_streak: number
          current_streak: number
          last_completion_date: string | null
          last_weekly_claim_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          best_streak?: number
          current_streak?: number
          last_completion_date?: string | null
          last_weekly_claim_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          best_streak?: number
          current_streak?: number
          last_completion_date?: string | null
          last_weekly_claim_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_yuri: {
        Row: {
          acquired_at: string
          case_slot: number | null
          id: string
          last_collected_at: string
          template_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          case_slot?: number | null
          id?: string
          last_collected_at?: string
          template_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          case_slot?: number | null
          id?: string
          last_collected_at?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_yuri_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "yuri_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      yuri_templates: {
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
          income_per_hour?: number
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
    }
    Views: {
      user_game_stats: {
        Row: {
          draws: number | null
          games_played: number | null
          losses: number | null
          net: number | null
          payout: number | null
          rank_score: number | null
          user_id: string | null
          wagered: number | null
          win_loss_ratio: number | null
          wins: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _crew_mission_award: {
        Args: { _mission: Database["public"]["Tables"]["crew_missions"]["Row"] }
        Returns: undefined
      }
      _crew_missions_bump: {
        Args: {
          _crew_id: string
          _delta: number
          _metric: Database["public"]["Enums"]["crew_mission_metric"]
        }
        Returns: undefined
      }
      _is_room_host: {
        Args: { _room_id: string; _uid: string }
        Returns: boolean
      }
      _is_room_participant: {
        Args: { _room_id: string; _uid: string }
        Returns: boolean
      }
      add_season_bonus_xp: { Args: { _amount: number }; Returns: undefined }
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
      autofill_crew_missions: { Args: never; Returns: Json }
      award_crew_dice_tx: {
        Args: { _amount: number; _target: string }
        Returns: Json
      }
      award_daily_leaderboard_rewards: { Args: never; Returns: Json }
      award_idle_xp: { Args: { _uid: string }; Returns: Json }
      baddie_storage_cap: { Args: { _tier: string }; Returns: number }
      baddie_tier_mult_bp: { Args: { _tier: string }; Returns: number }
      baddie_upgrade_chance: {
        Args: {
          _material_value: number
          _target_rarity: string
          _target_value: number
        }
        Returns: number
      }
      buy_baddie_slot_tx: {
        Args: never
        Returns: {
          new_balance: number
          slots_bought: number
        }[]
      }
      buy_cosmetic_tx: { Args: { _cosmetic_id: string }; Returns: Json }
      buy_listing_tx: {
        Args: { _buyer: string; _listing_id: string }
        Returns: Json
      }
      cancel_listing_tx: { Args: { _listing_id: string }; Returns: Json }
      cancel_trade_tx: { Args: { _trade_id: string }; Returns: Json }
      change_username: { Args: { _new_username: string }; Returns: Json }
      claim_daily_tx: { Args: { _uid: string }; Returns: Json }
      claim_season_reward_tx: {
        Args: { _tier: number; _track: string }
        Returns: Json
      }
      claim_weekly_streak_tx: { Args: never; Returns: Json }
      cleanup_abandoned_lobbies: {
        Args: never
        Returns: {
          cancelled_waiting: number
          finished_active: number
        }[]
      }
      cleanup_stale_data: { Args: never; Returns: undefined }
      collect_baddie_tx: {
        Args: { _baddie_id: string }
        Returns: {
          amount: number
          last_collected_at: string
        }[]
      }
      create_crew_tx: {
        Args: {
          _description: string
          _is_open: boolean
          _min_level: number
          _name: string
          _tag: string
        }
        Returns: Json
      }
      create_trade_tx: {
        Args: {
          _from_baddies: string[]
          _from_dice: number
          _note: string
          _to: string
          _to_baddies: string[]
          _to_dice: number
        }
        Returns: Json
      }
      crew_missions_this_week: {
        Args: { _crew_id: string }
        Returns: {
          code: string
          completed_at: string
          description: string
          id: string
          metric: Database["public"]["Enums"]["crew_mission_metric"]
          name: string
          progress: number
          reward_dice: number
          reward_points: number
          slot: number
          source: string
          target: number
          template_id: string
        }[]
      }
      current_season: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          ends_at: string
          id: string
          name: string
          starts_at: string
          tier_count: number
          xp_per_tier: number
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_week_start: { Args: never; Returns: string }
      delete_tag_tx: { Args: { _tag: string }; Returns: Json }
      donate_to_crew_tx: { Args: { _amount: number }; Returns: Json }
      ensure_season_progress: {
        Args: never
        Returns: {
          baseline_xp: number
          bonus_xp: number
          created_at: string
          season_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "season_progress"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      equip_cosmetic_tx: { Args: { _cosmetic_id: string }; Returns: Json }
      evaluate_user_achievements: { Args: { _uid: string }; Returns: undefined }
      expire_auctions: { Args: never; Returns: undefined }
      expire_trades: { Args: never; Returns: number }
      expire_vip_status: { Args: never; Returns: number }
      finalize_stale_user_games: {
        Args: { _older_than_seconds?: number; _uid: string }
        Returns: Json
      }
      finalize_weekly_crew_rankings: { Args: never; Returns: Json }
      fuse_baddies_tx: { Args: { _baddie_ids: string[] }; Returns: Json }
      get_today_missions: {
        Args: never
        Returns: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          mission_date: string
          mission_key: string
          progress: number
          reward_dice: number
          reward_xp: number
          slot: number
          target: number
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "daily_missions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_profile_stats: {
        Args: { _uid: string }
        Returns: {
          draws: number
          games_played: number
          losses: number
          net: number
          payout: number
          rank_score: number
          user_id: string
          wagered: number
          win_loss_ratio: number
          wins: number
        }[]
      }
      grant_achievement: {
        Args: { _achievement_id: string; _user_id: string }
        Returns: boolean
      }
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
      is_crew_officer: {
        Args: { _crew: string; _user: string }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_vip: { Args: { _uid: string }; Returns: boolean }
      join_crew_tx: { Args: { _crew_id: string }; Returns: Json }
      kick_crew_member_tx: { Args: { _target: string }; Returns: Json }
      leaderboard_crews: {
        Args: { _limit?: number; _order?: string }
        Returns: {
          avatar_url: string
          id: string
          level: number
          member_count: number
          name: string
          tag: string
          total_score: number
          weekly_score: number
        }[]
      }
      leaderboard_wins: {
        Args: { _limit?: number }
        Returns: {
          losses: number
          rank_score: number
          user_id: string
          wins: number
        }[]
      }
      leave_crew_tx: { Args: never; Returns: Json }
      list_baddie_for_sale_tx: {
        Args: { _baddie_id: string; _price: number }
        Returns: Json
      }
      mission_tick: {
        Args: { _delta: number; _key: string; _user: string }
        Returns: undefined
      }
      open_baddie_case_tx: {
        Args: never
        Returns: {
          autosold: boolean
          image_url: string
          income_per_hour: number
          name: string
          rarity: string
          sell_price: number
          template_id: string
          user_baddie_id: string
        }[]
      }
      open_baddie_cases_tx: {
        Args: { _count: number }
        Returns: {
          autosold: boolean
          image_url: string
          income_per_hour: number
          name: string
          rarity: string
          sell_price: number
          template_id: string
          user_baddie_id: string
        }[]
      }
      open_yuri_case: {
        Args: { _count: number }
        Returns: {
          acquired_at: string
          case_slot: number | null
          id: string
          last_collected_at: string
          template_id: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "user_yuri"
          isOneToOne: false
          isSetofReturn: true
        }
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
      respond_crew_join_tx: {
        Args: { _accept: boolean; _request_id: string }
        Returns: Json
      }
      respond_trade_tx: {
        Args: { _accept: boolean; _trade_id: string }
        Returns: Json
      }
      review_cosmetic_submission: {
        Args: { _approve: boolean; _notes?: string; _submission_id: string }
        Returns: string
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
      save_game_private_state: {
        Args: { _room_id: string; _state: Json }
        Returns: undefined
      }
      seed_daily_missions: {
        Args: { _user: string }
        Returns: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          mission_date: string
          mission_key: string
          progress: number
          reward_dice: number
          reward_xp: number
          slot: number
          target: number
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "daily_missions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      sell_baddie_tx: { Args: { _baddie_id: string }; Returns: Json }
      sell_yuri_tx: {
        Args: { _yuri_id: string }
        Returns: {
          price: number
        }[]
      }
      set_active_tag: { Args: { _tag: string }; Returns: Json }
      set_autosell_rarities: {
        Args: { _rarities: string[] }
        Returns: string[]
      }
      set_crew_mission: {
        Args: { _slot: number; _template_id: string }
        Returns: Json
      }
      set_crew_role_tx: {
        Args: {
          _role: Database["public"]["Enums"]["crew_role"]
          _target: string
        }
        Returns: Json
      }
      set_yuri_autosell_rarities: {
        Args: { _rarities: string[] }
        Returns: undefined
      }
      settle_auction_tx: { Args: { _listing_id: string }; Returns: Json }
      submit_cosmetic: {
        Args: {
          _kind: string
          _meta: Json
          _name: string
          _price_dice: number
          _rarity: string
        }
        Returns: string
      }
      touch_presence: { Args: never; Returns: Json }
      unequip_cosmetic_tx: { Args: { _kind: string }; Returns: Json }
      update_crew_customization: {
        Args: {
          _avatar_url: string
          _banner_url: string
          _crew_id: string
          _description: string
        }
        Returns: undefined
      }
      upgrade_baddies_tx: {
        Args: { _material_baddie_ids: string[]; _target_template_id: string }
        Returns: Json
      }
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
      yuri_collect_duo: {
        Args: { _group: number }
        Returns: {
          amount: number
        }[]
      }
      yuri_place: {
        Args: { _slot: number; _yuri_id: string }
        Returns: undefined
      }
      yuri_unplace: { Args: { _yuri_id: string }; Returns: undefined }
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
      crew_join_status: "pending" | "accepted" | "rejected" | "cancelled"
      crew_mission_metric: "donations" | "new_members"
      crew_role: "owner" | "officer" | "member"
      difficulty: "easy" | "medium" | "hard" | "extreme"
      dominion_building_kind:
        | "headquarters"
        | "salvage_yard"
        | "power_core"
        | "dice_forge"
        | "vault"
        | "command_center"
        | "workshop"
      dominion_job_kind: "build" | "upgrade" | "train" | "research"
      dominion_research_branch: "industry" | "tactics" | "logistics"
      dominion_sector_kind: "neutral" | "dice_vault" | "fortified" | "event"
      dominion_unit_kind:
        | "scout_roller"
        | "shield_guard"
        | "crusher_tank"
        | "sky_drone"
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
        | "event"
        | "achievement"
        | "trade_offer"
        | "trade_declined"
        | "crew"
        | "system"
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
      trade_status:
        | "pending"
        | "accepted"
        | "declined"
        | "cancelled"
        | "expired"
        | "completed"
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
        | "trade"
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
      crew_join_status: ["pending", "accepted", "rejected", "cancelled"],
      crew_mission_metric: ["donations", "new_members"],
      crew_role: ["owner", "officer", "member"],
      difficulty: ["easy", "medium", "hard", "extreme"],
      dominion_building_kind: [
        "headquarters",
        "salvage_yard",
        "power_core",
        "dice_forge",
        "vault",
        "command_center",
        "workshop",
      ],
      dominion_job_kind: ["build", "upgrade", "train", "research"],
      dominion_research_branch: ["industry", "tactics", "logistics"],
      dominion_sector_kind: ["neutral", "dice_vault", "fortified", "event"],
      dominion_unit_kind: [
        "scout_roller",
        "shield_guard",
        "crusher_tank",
        "sky_drone",
      ],
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
        "event",
        "achievement",
        "trade_offer",
        "trade_declined",
        "crew",
        "system",
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
      trade_status: [
        "pending",
        "accepted",
        "declined",
        "cancelled",
        "expired",
        "completed",
      ],
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
        "trade",
      ],
    },
  },
} as const
