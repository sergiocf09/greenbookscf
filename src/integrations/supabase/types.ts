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
      golf_courses: {
        Row: {
          country: string
          created_at: string
          id: string
          location: string
          name: string
        }
        Insert: {
          country?: string
          created_at?: string
          id?: string
          location: string
          name: string
        }
        Update: {
          country?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
        }
        Relationships: []
      }
      handicap_history: {
        Row: {
          handicap: number
          id: string
          profile_id: string
          recorded_at: string
          round_id: string | null
        }
        Insert: {
          handicap: number
          id?: string
          profile_id: string
          recorded_at?: string
          round_id?: string | null
        }
        Update: {
          handicap?: number
          id?: string
          profile_id?: string
          recorded_at?: string
          round_id?: string | null
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
          marker_type: Database["public"]["Enums"]["marker_type"]
        }
        Insert: {
          created_at?: string
          hole_score_id: string
          id?: string
          is_auto_detected?: boolean
          marker_type: Database["public"]["Enums"]["marker_type"]
        }
        Update: {
          created_at?: string
          hole_score_id?: string
          id?: string
          is_auto_detected?: boolean
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
          created_at: string
          hole_number: number
          id: string
          net_score: number | null
          putts: number | null
          round_player_id: string
          strokes: number | null
          strokes_received: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hole_number: number
          id?: string
          net_score?: number | null
          putts?: number | null
          round_player_id: string
          strokes?: number | null
          strokes_received?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hole_number?: number
          id?: string
          net_score?: number | null
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
          player_a_id: string
          player_b_id: string
          rounds_played: number
          total_won_by_a: number
          total_won_by_b: number
          updated_at: string
        }
        Insert: {
          id?: string
          last_played_at?: string | null
          player_a_id: string
          player_b_id: string
          rounds_played?: number
          total_won_by_a?: number
          total_won_by_b?: number
          updated_at?: string
        }
        Update: {
          id?: string
          last_played_at?: string | null
          player_a_id?: string
          player_b_id?: string
          rounds_played?: number
          total_won_by_a?: number
          total_won_by_b?: number
          updated_at?: string
        }
        Relationships: [
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
      profiles: {
        Row: {
          avatar_color: string
          created_at: string
          current_handicap: number
          display_name: string
          id: string
          initials: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_color?: string
          created_at?: string
          current_handicap?: number
          display_name: string
          id?: string
          initials: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_color?: string
          created_at?: string
          current_handicap?: number
          display_name?: string
          id?: string
          initials?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      round_players: {
        Row: {
          group_id: string
          handicap_for_round: number
          id: string
          is_organizer: boolean
          joined_at: string
          profile_id: string
          round_id: string
        }
        Insert: {
          group_id: string
          handicap_for_round: number
          id?: string
          is_organizer?: boolean
          joined_at?: string
          profile_id: string
          round_id: string
        }
        Update: {
          group_id?: string
          handicap_for_round?: number
          id?: string
          is_organizer?: boolean
          joined_at?: string
          profile_id?: string
          round_id?: string
        }
        Relationships: [
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
      rounds: {
        Row: {
          course_id: string
          created_at: string
          date: string
          id: string
          organizer_id: string
          status: Database["public"]["Enums"]["round_status"]
          tee_color: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          date?: string
          id?: string
          organizer_id: string
          status?: Database["public"]["Enums"]["round_status"]
          tee_color?: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          date?: string
          id?: string
          organizer_id?: string
          status?: Database["public"]["Enums"]["round_status"]
          tee_color?: string
          updated_at?: string
        }
        Relationships: [
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_profile_id: { Args: never; Returns: string }
      is_own_profile: { Args: { p_profile_id: string }; Returns: boolean }
      is_round_organizer: { Args: { p_round_id: string }; Returns: boolean }
      is_round_participant: { Args: { p_round_id: string }; Returns: boolean }
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
      ],
      round_status: ["setup", "in_progress", "completed"],
    },
  },
} as const
