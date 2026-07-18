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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bet_templates: {
        Row: {
          created_at: string
          id: string
          is_favorite: boolean
          last_used_at: string | null
          name: string
          owner_profile_id: string
          template_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          last_used_at?: string | null
          name: string
          owner_profile_id: string
          template_json?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_favorite?: boolean
          last_used_at?: string | null
          name?: string
          owner_profile_id?: string
          template_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bet_templates_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bilateral_bets: {
        Row: {
          amount: number
          bet_type: Database["public"]["Enums"]["bet_type"]
          created_at: string
          handicap_a_override: number | null
          handicap_b_override: number | null
          id: string
          is_active: boolean
          player_a_id: string
          player_b_id: string
          round_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bet_type: Database["public"]["Enums"]["bet_type"]
          created_at?: string
          handicap_a_override?: number | null
          handicap_b_override?: number | null
          id?: string
          is_active?: boolean
          player_a_id: string
          player_b_id: string
          round_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bet_type?: Database["public"]["Enums"]["bet_type"]
          created_at?: string
          handicap_a_override?: number | null
          handicap_b_override?: number | null
          id?: string
          is_active?: boolean
          player_a_id?: string
          player_b_id?: string
          round_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bilateral_bets_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilateral_bets_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilateral_bets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      course_favorites: {
        Row: {
          course_id: string
          created_at: string
          profile_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          profile_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_favorites_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_holes: {
        Row: {
          course_id: string
          hole_number: number
          id: string
          par: number
          stroke_index: number
          yards_blue: number | null
          yards_red: number | null
          yards_white: number | null
          yards_yellow: number | null
        }
        Insert: {
          course_id: string
          hole_number: number
          id?: string
          par: number
          stroke_index: number
          yards_blue?: number | null
          yards_red?: number | null
          yards_white?: number | null
          yards_yellow?: number | null
        }
        Update: {
          course_id?: string
          hole_number?: number
          id?: string
          par?: number
          stroke_index?: number
          yards_blue?: number | null
          yards_red?: number | null
          yards_white?: number | null
          yards_yellow?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_holes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_tees: {
        Row: {
          course_id: string
          course_rating: number
          created_at: string
          id: string
          slope_rating: number
          tee_color: string
        }
        Insert: {
          course_id: string
          course_rating?: number
          created_at?: string
          id?: string
          slope_rating?: number
          tee_color: string
        }
        Update: {
          course_id?: string
          course_rating?: number
          created_at?: string
          id?: string
          slope_rating?: number
          tee_color?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_tees_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_visibility: {
        Row: {
          course_id: string
          created_at: string
          profile_id: string
          reason: string
        }
        Insert: {
          course_id: string
          created_at?: string
          profile_id: string
          reason?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          profile_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_visibility_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_visibility_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_bet_invitations: {
        Row: {
          bet_config_proposal: Json
          created_at: string
          id: string
          initiator_profile_id: string
          responded_at: string | null
          round_id: string
          status: string
          target_profile_id: string
        }
        Insert: {
          bet_config_proposal?: Json
          created_at?: string
          id?: string
          initiator_profile_id: string
          responded_at?: string | null
          round_id: string
          status?: string
          target_profile_id: string
        }
        Update: {
          bet_config_proposal?: Json
          created_at?: string
          id?: string
          initiator_profile_id?: string
          responded_at?: string | null
          round_id?: string
          status?: string
          target_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cross_bet_invitations_initiator_profile_id_fkey"
            columns: ["initiator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_bet_invitations_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_bet_invitations_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cup_matches: {
        Row: {
          advantage_side: string
          created_at: string
          format: string
          id: string
          leaderboard_id: string
          match_order: number
          player_a1_id: string | null
          player_a2_id: string | null
          player_b1_id: string | null
          player_b2_id: string | null
          points_per_match: number
          result_detail: string | null
          result_override: boolean
          result_type: string | null
          round_id: string | null
          status: string
          stroke_receiver_player_id: string | null
          strokes_advantage: number
          updated_at: string
        }
        Insert: {
          advantage_side?: string
          created_at?: string
          format?: string
          id?: string
          leaderboard_id: string
          match_order?: number
          player_a1_id?: string | null
          player_a2_id?: string | null
          player_b1_id?: string | null
          player_b2_id?: string | null
          points_per_match?: number
          result_detail?: string | null
          result_override?: boolean
          result_type?: string | null
          round_id?: string | null
          status?: string
          stroke_receiver_player_id?: string | null
          strokes_advantage?: number
          updated_at?: string
        }
        Update: {
          advantage_side?: string
          created_at?: string
          format?: string
          id?: string
          leaderboard_id?: string
          match_order?: number
          player_a1_id?: string | null
          player_a2_id?: string | null
          player_b1_id?: string | null
          player_b2_id?: string | null
          points_per_match?: number
          result_detail?: string | null
          result_override?: boolean
          result_type?: string | null
          round_id?: string | null
          status?: string
          stroke_receiver_player_id?: string | null
          strokes_advantage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cup_matches_leaderboard_id_fkey"
            columns: ["leaderboard_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_matches_player_a1_id_fkey"
            columns: ["player_a1_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_matches_player_a2_id_fkey"
            columns: ["player_a2_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_matches_player_b1_id_fkey"
            columns: ["player_b1_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_matches_player_b2_id_fkey"
            columns: ["player_b2_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_matches_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_matches_stroke_receiver_player_id_fkey"
            columns: ["stroke_receiver_player_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      cup_teams: {
        Row: {
          color: string
          created_at: string
          id: string
          leaderboard_id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          leaderboard_id: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          leaderboard_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cup_teams_leaderboard_id_fkey"
            columns: ["leaderboard_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_events"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          friend_profile_id: string
          id: string
          owner_profile_id: string
          status: string
        }
        Insert: {
          created_at?: string
          friend_profile_id: string
          id?: string
          owner_profile_id: string
          status?: string
        }
        Update: {
          created_at?: string
          friend_profile_id?: string
          id?: string
          owner_profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_friend_profile_id_fkey"
            columns: ["friend_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      golf_courses: {
        Row: {
          country: string
          course_rating: number | null
          created_at: string
          created_by_profile_id: string | null
          id: string
          is_manual: boolean
          last_synced_at: string | null
          location: string
          name: string
          slope_rating: number | null
          source: string
          source_course_id: number | null
        }
        Insert: {
          country?: string
          course_rating?: number | null
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          is_manual?: boolean
          last_synced_at?: string | null
          location: string
          name: string
          slope_rating?: number | null
          source?: string
          source_course_id?: number | null
        }
        Update: {
          country?: string
          course_rating?: number | null
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          is_manual?: boolean
          last_synced_at?: string | null
          location?: string
          name?: string
          slope_rating?: number | null
          source?: string
          source_course_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "golf_courses_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_sessions: {
        Row: {
          conversion_deadline: string | null
          converted_profile_id: string | null
          created_at: string
          ghost_profile_id: string
          id: string
          round_id: string
        }
        Insert: {
          conversion_deadline?: string | null
          converted_profile_id?: string | null
          created_at?: string
          ghost_profile_id: string
          id?: string
          round_id: string
        }
        Update: {
          conversion_deadline?: string | null
          converted_profile_id?: string | null
          created_at?: string
          ghost_profile_id?: string
          id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_sessions_converted_profile_id_fkey"
            columns: ["converted_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_sessions_ghost_profile_id_fkey"
            columns: ["ghost_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_sessions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      handicap_history: {
        Row: {
          adjusted_gross_score: number | null
          course_rating: number | null
          differential: number | null
          gross_score: number | null
          handicap: number
          id: string
          is_attested: boolean
          profile_id: string
          recorded_at: string
          round_id: string | null
          slope_rating: number | null
          tee_color: string | null
        }
        Insert: {
          adjusted_gross_score?: number | null
          course_rating?: number | null
          differential?: number | null
          gross_score?: number | null
          handicap: number
          id?: string
          is_attested?: boolean
          profile_id: string
          recorded_at?: string
          round_id?: string | null
          slope_rating?: number | null
          tee_color?: string | null
        }
        Update: {
          adjusted_gross_score?: number | null
          course_rating?: number | null
          differential?: number | null
          gross_score?: number | null
          handicap?: number
          id?: string
          is_attested?: boolean
          profile_id?: string
          recorded_at?: string
          round_id?: string | null
          slope_rating?: number | null
          tee_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handicap_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handicap_history_round_fk"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      hole_markers: {
        Row: {
          created_at: string
          hole_score_id: string
          id: string
          is_auto_detected: boolean
          marker_count: number
          marker_type: Database["public"]["Enums"]["marker_type"]
        }
        Insert: {
          created_at?: string
          hole_score_id: string
          id?: string
          is_auto_detected?: boolean
          marker_count?: number
          marker_type: Database["public"]["Enums"]["marker_type"]
        }
        Update: {
          created_at?: string
          hole_score_id?: string
          id?: string
          is_auto_detected?: boolean
          marker_count?: number
          marker_type?: Database["public"]["Enums"]["marker_type"]
        }
        Relationships: [
          {
            foreignKeyName: "hole_markers_hole_score_id_fkey"
            columns: ["hole_score_id"]
            isOneToOne: false
            referencedRelation: "hole_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      hole_scores: {
        Row: {
          confirmed: boolean
          created_at: string
          hole_number: number
          id: string
          net_score: number | null
          oyes_proximity: number | null
          oyes_proximity_sangron: number | null
          putts: number | null
          round_player_id: string
          strokes: number | null
          strokes_received: number
          updated_at: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          hole_number: number
          id?: string
          net_score?: number | null
          oyes_proximity?: number | null
          oyes_proximity_sangron?: number | null
          putts?: number | null
          round_player_id: string
          strokes?: number | null
          strokes_received?: number
          updated_at?: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          hole_number?: number
          id?: string
          net_score?: number | null
          oyes_proximity?: number | null
          oyes_proximity_sangron?: number | null
          putts?: number | null
          round_player_id?: string
          strokes?: number | null
          strokes_received?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hole_scores_round_player_id_fkey"
            columns: ["round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_events: {
        Row: {
          code: string
          competition_type: string
          created_at: string
          created_by: string
          cup_format: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          rules_json: Json
          scoring_modes: Json
          start_date: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          code?: string
          competition_type?: string
          created_at?: string
          created_by: string
          cup_format?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          rules_json?: Json
          scoring_modes?: Json
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          competition_type?: string
          created_at?: string
          created_by?: string
          cup_format?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          rules_json?: Json
          scoring_modes?: Json
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_participants: {
        Row: {
          cup_team_id: string | null
          guest_color: string | null
          guest_initials: string | null
          guest_name: string | null
          handicap_for_leaderboard: number
          id: string
          is_active: boolean
          joined_at: string
          leaderboard_id: string
          match_handicap: number
          profile_id: string | null
          source_round_id: string | null
          tee_color: string | null
        }
        Insert: {
          cup_team_id?: string | null
          guest_color?: string | null
          guest_initials?: string | null
          guest_name?: string | null
          handicap_for_leaderboard?: number
          id?: string
          is_active?: boolean
          joined_at?: string
          leaderboard_id: string
          match_handicap?: number
          profile_id?: string | null
          source_round_id?: string | null
          tee_color?: string | null
        }
        Update: {
          cup_team_id?: string | null
          guest_color?: string | null
          guest_initials?: string | null
          guest_name?: string | null
          handicap_for_leaderboard?: number
          id?: string
          is_active?: boolean
          joined_at?: string
          leaderboard_id?: string
          match_handicap?: number
          profile_id?: string | null
          source_round_id?: string | null
          tee_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_participants_cup_team_fk"
            columns: ["cup_team_id"]
            isOneToOne: false
            referencedRelation: "cup_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_participants_leaderboard_id_fkey"
            columns: ["leaderboard_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_participants_source_round_id_fkey"
            columns: ["source_round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_rounds: {
        Row: {
          added_at: string
          added_by: string
          id: string
          leaderboard_id: string
          round_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          id?: string
          leaderboard_id: string
          round_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          id?: string
          leaderboard_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_rounds_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_rounds_leaderboard_id_fkey"
            columns: ["leaderboard_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_rounds_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_scores: {
        Row: {
          computed_at: string
          gross_total: number | null
          gross_vs_par: number | null
          holes_played: number
          id: string
          leaderboard_id: string
          net_total: number | null
          net_vs_par: number | null
          participant_id: string
          points_earned: number | null
          round_id: string
          stableford_total: number | null
        }
        Insert: {
          computed_at?: string
          gross_total?: number | null
          gross_vs_par?: number | null
          holes_played?: number
          id?: string
          leaderboard_id: string
          net_total?: number | null
          net_vs_par?: number | null
          participant_id: string
          points_earned?: number | null
          round_id: string
          stableford_total?: number | null
        }
        Update: {
          computed_at?: string
          gross_total?: number | null
          gross_vs_par?: number | null
          holes_played?: number
          id?: string
          leaderboard_id?: string
          net_total?: number | null
          net_vs_par?: number | null
          participant_id?: string
          points_earned?: number | null
          round_id?: string
          stableford_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_scores_leaderboard_id_fkey"
            columns: ["leaderboard_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_scores_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_scores_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_transactions: {
        Row: {
          amount: number
          bet_type: Database["public"]["Enums"]["bet_type"]
          created_at: string
          description: string | null
          from_profile_id: string
          hole_number: number | null
          id: string
          round_id: string
          segment: string
          to_profile_id: string
        }
        Insert: {
          amount: number
          bet_type: Database["public"]["Enums"]["bet_type"]
          created_at?: string
          description?: string | null
          from_profile_id: string
          hole_number?: number | null
          id?: string
          round_id: string
          segment: string
          to_profile_id: string
        }
        Update: {
          amount?: number
          bet_type?: Database["public"]["Enums"]["bet_type"]
          created_at?: string
          description?: string | null
          from_profile_id?: string
          hole_number?: number | null
          id?: string
          round_id?: string
          segment?: string
          to_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_from_profile_id_fkey"
            columns: ["from_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_to_profile_id_fkey"
            columns: ["to_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      money_ranking_members: {
        Row: {
          added_by: string
          id: string
          joined_at: string
          profile_id: string
          ranking_id: string
        }
        Insert: {
          added_by: string
          id?: string
          joined_at?: string
          profile_id: string
          ranking_id: string
        }
        Update: {
          added_by?: string
          id?: string
          joined_at?: string
          profile_id?: string
          ranking_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_ranking_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_ranking_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_ranking_members_ranking_id_fkey"
            columns: ["ranking_id"]
            isOneToOne: false
            referencedRelation: "money_rankings"
            referencedColumns: ["id"]
          },
        ]
      }
      money_rankings: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_rankings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nines_config: {
        Row: {
          created_at: string
          id: string
          player_handicaps: Json | null
          player_ids: string[]
          round_id: string
          value_per_point: number
        }
        Insert: {
          created_at?: string
          id?: string
          player_handicaps?: Json | null
          player_ids?: string[]
          round_id: string
          value_per_point?: number
        }
        Update: {
          created_at?: string
          id?: string
          player_handicaps?: Json | null
          player_ids?: string[]
          round_id?: string
          value_per_point?: number
        }
        Relationships: [
          {
            foreignKeyName: "nines_config_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: true
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      player_statistics: {
        Row: {
          average_putts: number | null
          fir_percentage: number | null
          gir_percentage: number | null
          id: string
          money_lost: number
          money_won: number
          profile_id: string
          rounds_played: number
          total_putts: number
          total_strokes: number
          updated_at: string
        }
        Insert: {
          average_putts?: number | null
          fir_percentage?: number | null
          gir_percentage?: number | null
          id?: string
          money_lost?: number
          money_won?: number
          profile_id: string
          rounds_played?: number
          total_putts?: number
          total_strokes?: number
          updated_at?: string
        }
        Update: {
          average_putts?: number | null
          fir_percentage?: number | null
          gir_percentage?: number | null
          id?: string
          money_lost?: number
          money_won?: number
          profile_id?: string
          rounds_played?: number
          total_putts?: number
          total_strokes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_statistics_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_vs_player: {
        Row: {
          id: string
          last_played_at: string | null
          last_round_id: string | null
          player_a_id: string | null
          player_a_is_guest: boolean
          player_a_name: string | null
          player_b_id: string | null
          player_b_is_guest: boolean
          player_b_name: string | null
          rounds_played: number
          total_won_by_a: number
          total_won_by_b: number
          updated_at: string
        }
        Insert: {
          id?: string
          last_played_at?: string | null
          last_round_id?: string | null
          player_a_id?: string | null
          player_a_is_guest?: boolean
          player_a_name?: string | null
          player_b_id?: string | null
          player_b_is_guest?: boolean
          player_b_name?: string | null
          rounds_played?: number
          total_won_by_a?: number
          total_won_by_b?: number
          updated_at?: string
        }
        Update: {
          id?: string
          last_played_at?: string | null
          last_round_id?: string | null
          player_a_id?: string | null
          player_a_is_guest?: boolean
          player_a_name?: string | null
          player_b_id?: string | null
          player_b_is_guest?: boolean
          player_b_name?: string | null
          rounds_played?: number
          total_won_by_a?: number
          total_won_by_b?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_vs_player_last_round_id_fkey"
            columns: ["last_round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_vs_player_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_vs_player_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_app_balances: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          owner_profile_id: string
          rival_name: string
          rival_profile_id: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          owner_profile_id: string
          rival_name: string
          rival_profile_id?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          owner_profile_id?: string
          rival_name?: string
          rival_profile_id?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pre_app_balances_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_app_balances_rival_profile_id_fkey"
            columns: ["rival_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_color: string
          created_at: string
          current_handicap: number
          display_name: string
          id: string
          initials: string
          is_founder: boolean
          is_ghost: boolean
          subscription_expires_at: string | null
          subscription_tier: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_color?: string
          created_at?: string
          current_handicap?: number
          display_name: string
          id?: string
          initials: string
          is_founder?: boolean
          is_ghost?: boolean
          subscription_expires_at?: string | null
          subscription_tier?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_color?: string
          created_at?: string
          current_handicap?: number
          display_name?: string
          id?: string
          initials?: string
          is_founder?: boolean
          is_ghost?: boolean
          subscription_expires_at?: string | null
          subscription_tier?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      round_audit_log: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          round_id: string
          target_player_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          round_id: string
          target_player_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          round_id?: string
          target_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_audit_log_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_audit_log_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      round_close_attempts: {
        Row: {
          ended_at: string | null
          error_message: string | null
          error_stage: string | null
          id: string
          organizer_profile_id: string
          report_json: Json | null
          round_id: string
          started_at: string
          status: string
        }
        Insert: {
          ended_at?: string | null
          error_message?: string | null
          error_stage?: string | null
          id?: string
          organizer_profile_id: string
          report_json?: Json | null
          round_id: string
          started_at?: string
          status: string
        }
        Update: {
          ended_at?: string | null
          error_message?: string | null
          error_stage?: string | null
          id?: string
          organizer_profile_id?: string
          report_json?: Json | null
          round_id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      round_cross_bets: {
        Row: {
          bet_config: Json
          created_at: string
          id: string
          initiator_profile_id: string
          invitation_id: string
          round_id: string
          target_profile_id: string
          target_round_player_id: string | null
        }
        Insert: {
          bet_config?: Json
          created_at?: string
          id?: string
          initiator_profile_id: string
          invitation_id: string
          round_id: string
          target_profile_id: string
          target_round_player_id?: string | null
        }
        Update: {
          bet_config?: Json
          created_at?: string
          id?: string
          initiator_profile_id?: string
          invitation_id?: string
          round_id?: string
          target_profile_id?: string
          target_round_player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_cross_bets_initiator_profile_id_fkey"
            columns: ["initiator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_cross_bets_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "cross_bet_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_cross_bets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_cross_bets_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_cross_bets_target_round_player_id_fkey"
            columns: ["target_round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
        ]
      }
      round_groups: {
        Row: {
          created_at: string
          group_number: number
          id: string
          round_id: string
        }
        Insert: {
          created_at?: string
          group_number?: number
          id?: string
          round_id: string
        }
        Update: {
          created_at?: string
          group_number?: number
          id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_groups_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_handicaps: {
        Row: {
          created_at: string
          id: string
          player_a_id: string
          player_b_id: string
          round_id: string
          strokes_given_by_a: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_a_id: string
          player_b_id: string
          round_id: string
          strokes_given_by_a?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          player_a_id?: string
          player_b_id?: string
          round_id?: string
          strokes_given_by_a?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_handicaps_player_a_id_fkey"
            columns: ["player_a_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_handicaps_player_b_id_fkey"
            columns: ["player_b_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_handicaps_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_players: {
        Row: {
          added_by_profile_id: string | null
          attested_at: string | null
          attested_by: string | null
          cross_bet_id: string | null
          group_id: string
          guest_color: string | null
          guest_initials: string | null
          guest_name: string | null
          handicap_for_round: number
          id: string
          is_admin: boolean
          is_cross_only: boolean
          is_organizer: boolean
          joined_at: string
          profile_id: string | null
          round_id: string
          tee_color: string | null
        }
        Insert: {
          added_by_profile_id?: string | null
          attested_at?: string | null
          attested_by?: string | null
          cross_bet_id?: string | null
          group_id: string
          guest_color?: string | null
          guest_initials?: string | null
          guest_name?: string | null
          handicap_for_round: number
          id?: string
          is_admin?: boolean
          is_cross_only?: boolean
          is_organizer?: boolean
          joined_at?: string
          profile_id?: string | null
          round_id: string
          tee_color?: string | null
        }
        Update: {
          added_by_profile_id?: string | null
          attested_at?: string | null
          attested_by?: string | null
          cross_bet_id?: string | null
          group_id?: string
          guest_color?: string | null
          guest_initials?: string | null
          guest_name?: string | null
          handicap_for_round?: number
          id?: string
          is_admin?: boolean
          is_cross_only?: boolean
          is_organizer?: boolean
          joined_at?: string
          profile_id?: string | null
          round_id?: string
          tee_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_round_players_cross_bet_id"
            columns: ["cross_bet_id"]
            isOneToOne: false
            referencedRelation: "round_cross_bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_players_added_by_profile_id_fkey"
            columns: ["added_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_players_attested_by_fkey"
            columns: ["attested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_players_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "round_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_players_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_players_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_snapshots: {
        Row: {
          closed_at: string
          created_at: string
          id: string
          round_id: string
          snapshot_json: Json
          snapshot_version: number
        }
        Insert: {
          closed_at?: string
          created_at?: string
          id?: string
          round_id: string
          snapshot_json: Json
          snapshot_version?: number
        }
        Update: {
          closed_at?: string
          created_at?: string
          id?: string
          round_id?: string
          snapshot_json?: Json
          snapshot_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "round_snapshots_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: true
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          attested_at: string | null
          attested_by: string | null
          auto_close_pending: boolean
          auto_close_scheduled_at: string | null
          bet_config: Json | null
          course_id: string
          created_at: string
          date: string
          id: string
          is_incomplete: boolean
          organizer_id: string
          starting_hole: number
          status: Database["public"]["Enums"]["round_status"]
          tee_color: string
          updated_at: string
        }
        Insert: {
          attested_at?: string | null
          attested_by?: string | null
          auto_close_pending?: boolean
          auto_close_scheduled_at?: string | null
          bet_config?: Json | null
          course_id: string
          created_at?: string
          date?: string
          id?: string
          is_incomplete?: boolean
          organizer_id: string
          starting_hole?: number
          status?: Database["public"]["Enums"]["round_status"]
          tee_color?: string
          updated_at?: string
        }
        Update: {
          attested_at?: string | null
          attested_by?: string | null
          auto_close_pending?: boolean
          auto_close_scheduled_at?: string | null
          bet_config?: Json | null
          course_id?: string
          created_at?: string
          date?: string
          id?: string
          is_incomplete?: boolean
          organizer_id?: string
          starting_hole?: number
          status?: Database["public"]["Enums"]["round_status"]
          tee_color?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_attested_by_fkey"
            columns: ["attested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "golf_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sixes_config: {
        Row: {
          amount: number
          cobro: string
          created_at: string
          id: string
          round_id: string
          scoring_mode: string
          set1_amount: number | null
          set2_amount: number | null
          set3_amount: number | null
          use_handicap: boolean
          use_per_set_amounts: boolean
        }
        Insert: {
          amount?: number
          cobro?: string
          created_at?: string
          id?: string
          round_id: string
          scoring_mode?: string
          set1_amount?: number | null
          set2_amount?: number | null
          set3_amount?: number | null
          use_handicap?: boolean
          use_per_set_amounts?: boolean
        }
        Update: {
          amount?: number
          cobro?: string
          created_at?: string
          id?: string
          round_id?: string
          scoring_mode?: string
          set1_amount?: number | null
          set2_amount?: number | null
          set3_amount?: number | null
          use_handicap?: boolean
          use_per_set_amounts?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sixes_config_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: true
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      sixes_sets: {
        Row: {
          created_at: string
          id: string
          round_id: string
          set_number: number
          team1_player1_id: string
          team1_player2_id: string
          team2_player1_id: string
          team2_player2_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          round_id: string
          set_number: number
          team1_player1_id: string
          team1_player2_id: string
          team2_player1_id: string
          team2_player2_id: string
        }
        Update: {
          created_at?: string
          id?: string
          round_id?: string
          set_number?: number
          team1_player1_id?: string
          team1_player2_id?: string
          team2_player1_id?: string
          team2_player2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sixes_sets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      sliding_current: {
        Row: {
          id: string
          last_round_id: string | null
          last_updated_at: string
          player_a_profile_id: string
          player_b_profile_id: string
          strokes_a_gives_b_current: number
        }
        Insert: {
          id?: string
          last_round_id?: string | null
          last_updated_at?: string
          player_a_profile_id: string
          player_b_profile_id: string
          strokes_a_gives_b_current?: number
        }
        Update: {
          id?: string
          last_round_id?: string | null
          last_updated_at?: string
          player_a_profile_id?: string
          player_b_profile_id?: string
          strokes_a_gives_b_current?: number
        }
        Relationships: [
          {
            foreignKeyName: "sliding_current_last_round_id_fkey"
            columns: ["last_round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sliding_current_player_a_profile_id_fkey"
            columns: ["player_a_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sliding_current_player_b_profile_id_fkey"
            columns: ["player_b_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sliding_history: {
        Row: {
          back_main_winner: string
          carry_front_main: boolean
          created_at: string
          front_main_winner: string
          id: string
          match_total_winner: string
          player_a_profile_id: string
          player_b_profile_id: string
          round_id: string
          strokes_a_gives_b_next: number
          strokes_a_gives_b_used: number
        }
        Insert: {
          back_main_winner: string
          carry_front_main?: boolean
          created_at?: string
          front_main_winner: string
          id?: string
          match_total_winner: string
          player_a_profile_id: string
          player_b_profile_id: string
          round_id: string
          strokes_a_gives_b_next?: number
          strokes_a_gives_b_used?: number
        }
        Update: {
          back_main_winner?: string
          carry_front_main?: boolean
          created_at?: string
          front_main_winner?: string
          id?: string
          match_total_winner?: string
          player_a_profile_id?: string
          player_b_profile_id?: string
          round_id?: string
          strokes_a_gives_b_next?: number
          strokes_a_gives_b_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "sliding_history_player_a_profile_id_fkey"
            columns: ["player_a_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sliding_history_player_b_profile_id_fkey"
            columns: ["player_b_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sliding_history_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_paid: number | null
          created_at: string
          expires_at: string
          id: string
          plan: string
          profile_id: string
          starts_at: string
          stripe_session_id: string | null
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string
          expires_at: string
          id?: string
          plan: string
          profile_id: string
          starts_at?: string
          stripe_session_id?: string | null
        }
        Update: {
          amount_paid?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          plan?: string
          profile_id?: string
          starts_at?: string
          stripe_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_bets: {
        Row: {
          amount: number
          bet_type: Database["public"]["Enums"]["bet_type"]
          created_at: string
          id: string
          is_active: boolean
          round_id: string
          scoring_type: string
          team_a_handicap: number | null
          team_a_player1_id: string
          team_a_player2_id: string
          team_b_handicap: number | null
          team_b_player1_id: string
          team_b_player2_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bet_type: Database["public"]["Enums"]["bet_type"]
          created_at?: string
          id?: string
          is_active?: boolean
          round_id: string
          scoring_type?: string
          team_a_handicap?: number | null
          team_a_player1_id: string
          team_a_player2_id: string
          team_b_handicap?: number | null
          team_b_player1_id: string
          team_b_player2_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bet_type?: Database["public"]["Enums"]["bet_type"]
          created_at?: string
          id?: string
          is_active?: boolean
          round_id?: string
          scoring_type?: string
          team_a_handicap?: number | null
          team_a_player1_id?: string
          team_a_player2_id?: string
          team_b_handicap?: number | null
          team_b_player1_id?: string
          team_b_player2_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_bets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_bets_team_a_player1_id_fkey"
            columns: ["team_a_player1_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_bets_team_a_player2_id_fkey"
            columns: ["team_a_player2_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_bets_team_b_player1_id_fkey"
            columns: ["team_b_player1_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_bets_team_b_player2_id_fkey"
            columns: ["team_b_player2_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
        ]
      }
      vegas_config: {
        Row: {
          back_amount: number | null
          birdie_multiplier: boolean
          created_at: string
          front_amount: number | null
          id: string
          player_a_id: string | null
          player_b_id: string | null
          player_c_id: string | null
          player_d_id: string | null
          round_id: string
          set1_amount: number | null
          set2_amount: number | null
          set3_amount: number | null
          use_handicap: boolean
          use_segment_amounts: boolean
          value_per_point: number
          variant: string
        }
        Insert: {
          back_amount?: number | null
          birdie_multiplier?: boolean
          created_at?: string
          front_amount?: number | null
          id?: string
          player_a_id?: string | null
          player_b_id?: string | null
          player_c_id?: string | null
          player_d_id?: string | null
          round_id: string
          set1_amount?: number | null
          set2_amount?: number | null
          set3_amount?: number | null
          use_handicap?: boolean
          use_segment_amounts?: boolean
          value_per_point?: number
          variant?: string
        }
        Update: {
          back_amount?: number | null
          birdie_multiplier?: boolean
          created_at?: string
          front_amount?: number | null
          id?: string
          player_a_id?: string | null
          player_b_id?: string | null
          player_c_id?: string | null
          player_d_id?: string | null
          round_id?: string
          set1_amount?: number | null
          set2_amount?: number | null
          set3_amount?: number | null
          use_handicap?: boolean
          use_segment_amounts?: boolean
          value_per_point?: number
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "vegas_config_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: true
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      wolf_config: {
        Row: {
          amount_per_hole: number
          carryover: boolean
          created_at: string
          id: string
          participant_ids: string[]
          player_handicaps: Json | null
          player_order: string[]
          round_id: string
          scoring_mode: string
          timing: string
          use_handicap: boolean
        }
        Insert: {
          amount_per_hole?: number
          carryover?: boolean
          created_at?: string
          id?: string
          participant_ids?: string[]
          player_handicaps?: Json | null
          player_order?: string[]
          round_id: string
          scoring_mode?: string
          timing?: string
          use_handicap?: boolean
        }
        Update: {
          amount_per_hole?: number
          carryover?: boolean
          created_at?: string
          id?: string
          participant_ids?: string[]
          player_handicaps?: Json | null
          player_order?: string[]
          round_id?: string
          scoring_mode?: string
          timing?: string
          use_handicap?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "wolf_config_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: true
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      wolf_hole_state: {
        Row: {
          carryover_holes: number
          created_at: string
          effective_amount: number | null
          hole_number: number
          id: string
          partner_ids: string[]
          result: string | null
          round_id: string
          updated_at: string
          went_solo: boolean
          wolf_player_id: string
        }
        Insert: {
          carryover_holes?: number
          created_at?: string
          effective_amount?: number | null
          hole_number: number
          id?: string
          partner_ids?: string[]
          result?: string | null
          round_id: string
          updated_at?: string
          went_solo?: boolean
          wolf_player_id: string
        }
        Update: {
          carryover_holes?: number
          created_at?: string
          effective_amount?: number | null
          hole_number?: number
          id?: string
          partner_ids?: string[]
          result?: string | null
          round_id?: string
          updated_at?: string
          went_solo?: boolean
          wolf_player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wolf_hole_state_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _calc_handicap_index: { Args: { diffs: number[] }; Returns: number }
      _calc_pair_net_with_overrides: {
        Args: {
          p_ledger: Json
          p_overrides: Json
          p_player_a_id: string
          p_player_b_id: string
          p_players: Json
        }
        Returns: number
      }
      accept_cross_bet_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      attest_round_player: {
        Args: { p_round_player_id: string }
        Returns: undefined
      }
      begin_round_close_attempt: {
        Args: { p_lock_seconds?: number; p_round_id: string }
        Returns: Json
      }
      both_players_can_cross: {
        Args: { p_profile_a: string; p_profile_b: string }
        Returns: boolean
      }
      can_access_full_history: { Args: never; Returns: boolean }
      can_create_leaderboard: { Args: never; Returns: boolean }
      can_create_round_as_organizer: { Args: never; Returns: boolean }
      can_view_leaderboard: {
        Args: { _leaderboard_id: string }
        Returns: boolean
      }
      cancel_cross_bet_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      cleanup_expired_guest_sessions: { Args: never; Returns: undefined }
      close_leaderboard: {
        Args: { p_leaderboard_id: string }
        Returns: boolean
      }
      close_round_as_incomplete: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      compute_league_jornada_standings: {
        Args: { p_jornada_date: string; p_leaderboard_id: string }
        Returns: {
          display_name: string
          participant_id: string
          points_earned: number
          position_rank: number
          score_value: number
        }[]
      }
      convert_ghost_to_profile: {
        Args: { p_auth_uid: string; p_session_id: string }
        Returns: string
      }
      create_round:
        | {
            Args: {
              p_bet_config: Json
              p_course_id: string
              p_date: string
              p_tee_color: string
            }
            Returns: {
              group_id: string
              organizer_profile_id: string
              round_id: string
              round_player_id: string
            }[]
          }
        | {
            Args: {
              p_bet_config: Json
              p_course_id: string
              p_date: string
              p_starting_hole?: number
              p_tee_color: string
            }
            Returns: {
              group_id: string
              organizer_profile_id: string
              round_id: string
              round_player_id: string
            }[]
          }
      decline_cross_bet_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_round_with_financials: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      delete_user_account: { Args: never; Returns: undefined }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_auto_close_notification: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_round_close_emails: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      execute_auto_close_pending: { Args: never; Returns: number }
      finalize_round_bets: {
        Args: { p_ledger: Json; p_round_id: string }
        Returns: undefined
      }
      finish_round_close_attempt: {
        Args: {
          p_attempt_id: string
          p_error_message?: string
          p_error_stage?: string
          p_report?: Json
          p_status: string
        }
        Returns: undefined
      }
      get_attestation_stats: {
        Args: { p_profile_id: string }
        Returns: {
          attested_rounds: number
          total_rounds: number
        }[]
      }
      get_cross_bets_for_round: {
        Args: { p_round_id: string }
        Returns: {
          bet_config: Json
          cross_bet_id: string
          initiator_color: string
          initiator_initials: string
          initiator_name: string
          initiator_profile_id: string
          target_color: string
          target_initials: string
          target_name: string
          target_profile_id: string
          target_round_player_id: string
        }[]
      }
      get_cup_match_result: {
        Args: { p_match_id: string }
        Returns: {
          current_standing: string
          hole_breakdown: Json
          holes_played: number
          holes_remaining: number
          match_closed: boolean
          result_type: string
          side_a_holes_won: number
          side_b_holes_won: number
        }[]
      }
      get_friend_handicap_ranking_stats: {
        Args: never
        Returns: {
          avatar_color: string
          avg_gross_score: number
          best_gross_score: number
          current_handicap: number
          display_name: string
          handicap_trend: number
          initials: string
          profile_id: string
          rounds_played: number
        }[]
      }
      get_friends_live_rounds: {
        Args: never
        Returns: {
          avatar_color: string
          birdie_holes: number[]
          course_name: string
          display_name: string
          eagle_holes: number[]
          gross_vs_par: number
          holes_played: number
          initials: string
          profile_id: string
          round_id: string
        }[]
      }
      get_league_accumulated_standings: {
        Args: { p_leaderboard_id: string }
        Returns: {
          avatar_color: string
          display_name: string
          initials: string
          jornadas_jugadas: number
          participant_id: string
          points_acumulados: number
          points_cuenta: number
          position_rank: number
          qualifies: boolean
          score_acumulado: number
          score_cuenta: number
        }[]
      }
      get_money_ranking_balances: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_period?: string
          p_ranking_id: string
        }
        Returns: {
          avatar_color: string
          display_name: string
          initials: string
          net_balance: number
          profile_id: string
          rounds_played: number
        }[]
      }
      get_money_ranking_bilateral: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_period?: string
          p_profile_id: string
          p_ranking_id: string
        }
        Returns: {
          avatar_color: string
          display_name: string
          initials: string
          net_balance: number
          rival_profile_id: string
          rounds_together: number
        }[]
      }
      get_money_ranking_handicap_stats: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_period?: string
          p_ranking_id: string
        }
        Returns: {
          avatar_color: string
          avg_gross_score: number
          best_gross_score: number
          current_handicap: number
          display_name: string
          handicap_trend: number
          initials: string
          profile_id: string
          rounds_played: number
        }[]
      }
      get_my_friends: {
        Args: never
        Returns: {
          avatar_color: string
          created_at: string
          current_handicap: number
          display_name: string
          friend_profile_id: string
          friendship_id: string
          initials: string
        }[]
      }
      get_my_pending_auto_close_rounds: {
        Args: never
        Returns: {
          all_players_complete: boolean
          course_name: string
          incomplete_player_names: string[]
          organizer_email: string
          organizer_name: string
          round_date: string
          round_id: string
        }[]
      }
      get_my_pending_cross_invitations: {
        Args: never
        Returns: {
          bet_config_proposal: Json
          course_name: string
          created_at: string
          holes_played: number
          initiator_color: string
          initiator_initials: string
          initiator_name: string
          initiator_profile_id: string
          invitation_id: string
          round_id: string
        }[]
      }
      get_my_profile_id: { Args: never; Returns: string }
      get_organizer_rounds_closed_count: { Args: never; Returns: number }
      get_participated_rounds_closed_count: { Args: never; Returns: number }
      get_pending_attestations: {
        Args: never
        Returns: {
          course_name: string
          organizer_name: string
          pending_players: Json
          round_date: string
          round_id: string
        }[]
      }
      get_player_courses_summary: {
        Args: never
        Returns: {
          avg_score: number
          best_score: number
          course_id: string
          course_name: string
          last_played: string
          rounds_played: number
        }[]
      }
      get_player_milestones: {
        Args: never
        Returns: {
          best_round_course: string
          best_round_date: string
          best_round_score: number
          birdie_streak_best: number
          birdies_total: number
          eagles_total: number
          handicap_delta: number
          holes_in_one: number
          organizer_rounds: number
          rounds_no_bogey: number
          rounds_sub_100: number
          rounds_sub_70: number
          rounds_sub_80: number
          rounds_sub_90: number
          total_holes: number
          unique_courses: number
          unique_opponents: number
        }[]
      }
      get_player_recent_rounds: {
        Args: never
        Returns: {
          course_name: string
          holes_played: number
          round_date: string
          total_putts: number
          total_strokes: number
          vs_par: number
        }[]
      }
      get_player_score_by_hole: {
        Args: { p_course_id: string }
        Returns: {
          avg_strokes: number
          avg_vs_par: number
          hole_number: number
          par: number
          rounds_count: number
        }[]
      }
      get_player_stats: {
        Args: { p_course_id?: string }
        Returns: {
          avg_gross_score: number
          avg_putts_per_gir: number
          avg_putts_per_round: number
          avg_score_vs_par: number
          avg_vs_par_par3: number
          avg_vs_par_par4: number
          avg_vs_par_par5: number
          best_gross_score: number
          birdies_count: number
          bogeys_count: number
          courses_played: number
          doubles_count: number
          eagles_count: number
          gir_pct: number
          gir_pct_par3: number
          gir_pct_par4: number
          gir_pct_par5: number
          holes_played: number
          opponents_played: number
          pars_count: number
          pct_one_putt: number
          pct_three_putt_plus: number
          rounds_played: number
          scrambling_pct: number
          worse_count: number
          worst_gross_score: number
        }[]
      }
      get_round_audit_log: {
        Args: { p_limit?: number; p_offset?: number; p_round_id: string }
        Returns: {
          actor_id: string
          actor_name: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          target_name: string
          target_player_id: string
        }[]
      }
      get_round_handicap_ranking_stats: {
        Args: { p_round_id: string }
        Returns: {
          avatar_color: string
          avg_gross_score: number
          best_gross_score: number
          current_handicap: number
          display_name: string
          handicap_trend: number
          initials: string
          profile_id: string
          rounds_played: number
        }[]
      }
      get_round_invite_info: { Args: { p_round_id: string }; Returns: Json }
      is_group_admin: { Args: { p_group_id: string }; Returns: boolean }
      is_linked_round_organizer: {
        Args: { _leaderboard_id: string }
        Returns: boolean
      }
      is_money_ranking_creator: {
        Args: { p_ranking_id: string }
        Returns: boolean
      }
      is_money_ranking_member: {
        Args: { p_ranking_id: string }
        Returns: boolean
      }
      is_own_profile: { Args: { p_profile_id: string }; Returns: boolean }
      is_round_admin: { Args: { p_round_id: string }; Returns: boolean }
      is_round_organizer: { Args: { p_round_id: string }; Returns: boolean }
      is_round_participant: { Args: { p_round_id: string }; Returns: boolean }
      is_round_participant_by_profile: {
        Args: { p_profile_id: string; p_round_id: string }
        Returns: boolean
      }
      join_leaderboard_by_code: {
        Args: { p_code: string; p_handicap?: number }
        Returns: string
      }
      join_round:
        | { Args: { p_round_id: string }; Returns: string }
        | { Args: { p_group_id?: string; p_round_id: string }; Returns: string }
      join_round_as_guest:
        | {
            Args: {
              p_display_name: string
              p_group_id?: string
              p_round_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_auth_uid?: string
              p_display_name: string
              p_group_id?: string
              p_round_id: string
            }
            Returns: Json
          }
      log_round_event: {
        Args: {
          p_event_type: string
          p_payload?: Json
          p_round_id: string
          p_target_player_id?: string
        }
        Returns: undefined
      }
      mark_auto_close_pending: { Args: never; Returns: number }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      rebuild_all_missing_sliding_history: { Args: never; Returns: Json }
      rebuild_all_pvp_from_snapshots: { Args: never; Returns: Json }
      rebuild_round_financials_from_snapshot: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      rebuild_sliding_history_from_snapshot: {
        Args: { p_round_id: string }
        Returns: Json
      }
      rebuild_snapshot_balances_from_ledger: { Args: never; Returns: Json }
      rebuild_snapshot_bilateral_handicaps: { Args: never; Returns: Json }
      reopen_leaderboard: {
        Args: { p_leaderboard_id: string }
        Returns: boolean
      }
      reset_round_for_reclose: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      reset_round_groups_and_players: {
        Args: { p_round_id: string }
        Returns: undefined
      }
      resolve_leaderboard_by_code: { Args: { p_code: string }; Returns: string }
      resolve_round_id_by_code: { Args: { p_code: string }; Returns: string }
      search_profiles: {
        Args: { p_query: string }
        Returns: {
          avatar_color: string
          current_handicap: number
          display_name: string
          id: string
          initials: string
        }[]
      }
      send_cross_bet_invitation: {
        Args: {
          p_bet_config_proposal?: Json
          p_round_id: string
          p_target_profile_id: string
        }
        Returns: string
      }
      update_cross_bet_config: {
        Args: { p_bet_config: Json; p_cross_bet_id: string }
        Returns: undefined
      }
      update_round_bet_config: {
        Args: { p_bet_config: Json; p_round_id: string }
        Returns: string
      }
    }
    Enums: {
      bet_type:
        | "medal_front"
        | "medal_back"
        | "medal_total"
        | "pressure_front"
        | "pressure_back"
        | "skins_front"
        | "skins_back"
        | "caros"
        | "units"
        | "manchas"
        | "culebras"
        | "pinguinos"
        | "carritos_front"
        | "carritos_back"
        | "carritos_total"
        | "rayas_front"
        | "rayas_back"
        | "rayas_medal_total"
        | "rayas_oyes"
        | "coneja"
      marker_type:
        | "birdie"
        | "eagle"
        | "albatross"
        | "cuatriput"
        | "sandy_par"
        | "aqua_par"
        | "hole_out"
        | "ladies"
        | "swing_blanco"
        | "retruje"
        | "trampa"
        | "doble_agua"
        | "doble_ob"
        | "par3_gir_mas_3"
        | "doble_digito"
        | "moreliana"
        | "culebra"
        | "oyes_uni"
        | "mancha_generica"
        | "unidad_generica"
      round_status: "setup" | "in_progress" | "completed"
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
      bet_type: [
        "medal_front",
        "medal_back",
        "medal_total",
        "pressure_front",
        "pressure_back",
        "skins_front",
        "skins_back",
        "caros",
        "units",
        "manchas",
        "culebras",
        "pinguinos",
        "carritos_front",
        "carritos_back",
        "carritos_total",
        "rayas_front",
        "rayas_back",
        "rayas_medal_total",
        "rayas_oyes",
        "coneja",
      ],
      marker_type: [
        "birdie",
        "eagle",
        "albatross",
        "cuatriput",
        "sandy_par",
        "aqua_par",
        "hole_out",
        "ladies",
        "swing_blanco",
        "retruje",
        "trampa",
        "doble_agua",
        "doble_ob",
        "par3_gir_mas_3",
        "doble_digito",
        "moreliana",
        "culebra",
        "oyes_uni",
        "mancha_generica",
        "unidad_generica",
      ],
      round_status: ["setup", "in_progress", "completed"],
    },
  },
} as const
