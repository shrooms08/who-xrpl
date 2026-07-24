// Generated from the Supabase project schema (project ref wzpvdverwrqipxuequaf)
// via the Supabase MCP `generate_typescript_types`. Regenerate after migrations
// (do not hand-edit).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          content: string
          created_at: string
          game_id: string | null
          id: string
          lobby_id: string
          player_id: string
        }
        Insert: {
          content: string
          created_at?: string
          game_id?: string | null
          id?: string
          lobby_id: string
          player_id: string
        }
        Update: {
          content?: string
          created_at?: string
          game_id?: string | null
          id?: string
          lobby_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clues: {
        Row: {
          created_at: string
          id: string
          player_id: string
          round_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          round_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          round_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "clues_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clues_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          alive: boolean
          created_at: string
          game_id: string
          id: string
          player_id: string
          role: Database["public"]["Enums"]["player_role"]
          turn_order: number
        }
        Insert: {
          alive?: boolean
          created_at?: string
          game_id: string
          id?: string
          player_id: string
          role: Database["public"]["Enums"]["player_role"]
          turn_order: number
        }
        Update: {
          alive?: boolean
          created_at?: string
          game_id?: string
          id?: string
          player_id?: string
          role?: Database["public"]["Enums"]["player_role"]
          turn_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_secrets: {
        Row: { category: string; game_id: string; word: string }
        Insert: { category: string; game_id: string; word: string }
        Update: { category?: string; game_id?: string; word?: string }
        Relationships: [
          {
            foreignKeyName: "game_secrets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          created_at: string
          current_round: number
          ended_at: string | null
          id: string
          lobby_id: string
          status: Database["public"]["Enums"]["game_status"]
          version: number
          winner: Database["public"]["Enums"]["player_role"] | null
        }
        Insert: {
          created_at?: string
          current_round?: number
          ended_at?: string | null
          id?: string
          lobby_id: string
          status?: Database["public"]["Enums"]["game_status"]
          version?: number
          winner?: Database["public"]["Enums"]["player_role"] | null
        }
        Update: {
          created_at?: string
          current_round?: number
          ended_at?: string | null
          id?: string
          lobby_id?: string
          status?: Database["public"]["Enums"]["game_status"]
          version?: number
          winner?: Database["public"]["Enums"]["player_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "games_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_events: {
        Row: {
          created_at: string
          delivered_amount: string | null
          event_type: string
          game_id: string | null
          id: string
          lobby_id: string | null
          memo: string | null
          player_id: string | null
          tx_hash: string | null
          verified: boolean
        }
        Insert: {
          created_at?: string
          delivered_amount?: string | null
          event_type: string
          game_id?: string | null
          id?: string
          lobby_id?: string | null
          memo?: string | null
          player_id?: string | null
          tx_hash?: string | null
          verified?: boolean
        }
        Update: {
          created_at?: string
          delivered_amount?: string | null
          event_type?: string
          game_id?: string | null
          id?: string
          lobby_id?: string | null
          memo?: string | null
          player_id?: string | null
          tx_hash?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ledger_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lobbies: {
        Row: {
          code: string
          created_at: string
          host_id: string
          id: string
          max_players: number
          mode: Database["public"]["Enums"]["lobby_mode"]
          status: Database["public"]["Enums"]["lobby_status"]
        }
        Insert: {
          code: string
          created_at?: string
          host_id: string
          id?: string
          max_players?: number
          mode?: Database["public"]["Enums"]["lobby_mode"]
          status?: Database["public"]["Enums"]["lobby_status"]
        }
        Update: {
          code?: string
          created_at?: string
          host_id?: string
          id?: string
          max_players?: number
          mode?: Database["public"]["Enums"]["lobby_mode"]
          status?: Database["public"]["Enums"]["lobby_status"]
        }
        Relationships: [
          {
            foreignKeyName: "lobbies_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lobby_players: {
        Row: {
          id: string
          joined_at: string
          last_seen: string
          lobby_id: string
          player_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          last_seen?: string
          lobby_id: string
          player_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          last_seen?: string
          lobby_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lobby_players_lobby_id_fkey"
            columns: ["lobby_id"]
            isOneToOne: false
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lobby_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: { created_at: string; display_name: string | null; id: string; xrpl_address: string | null }
        Insert: { created_at?: string; display_name?: string | null; id: string; xrpl_address?: string | null }
        Update: { created_at?: string; display_name?: string | null; id?: string; xrpl_address?: string | null }
        Relationships: []
      }
      rounds: {
        Row: {
          awaiting_guess: boolean
          created_at: string
          current_turn_player_id: string | null
          ejected_player_id: string | null
          ejected_role: Database["public"]["Enums"]["player_role"] | null
          game_id: string
          guess_correct: boolean | null
          id: string
          phase: Database["public"]["Enums"]["round_phase"]
          phase_ends_at: string | null
          round_number: number
          turn_index: number
          turn_order: string[] | null
        }
        Insert: {
          awaiting_guess?: boolean
          created_at?: string
          current_turn_player_id?: string | null
          ejected_player_id?: string | null
          ejected_role?: Database["public"]["Enums"]["player_role"] | null
          game_id: string
          guess_correct?: boolean | null
          id?: string
          phase?: Database["public"]["Enums"]["round_phase"]
          phase_ends_at?: string | null
          round_number: number
          turn_index?: number
          turn_order?: string[] | null
        }
        Update: {
          awaiting_guess?: boolean
          created_at?: string
          current_turn_player_id?: string | null
          ejected_player_id?: string | null
          ejected_role?: Database["public"]["Enums"]["player_role"] | null
          game_id?: string
          guess_correct?: boolean | null
          id?: string
          phase?: Database["public"]["Enums"]["round_phase"]
          phase_ends_at?: string | null
          round_number?: number
          turn_index?: number
          turn_order?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "rounds_current_turn_player_id_fkey"
            columns: ["current_turn_player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_ejected_player_id_fkey"
            columns: ["ejected_player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          created_at: string
          id: string
          round_id: string
          target_id: string | null
          voter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          round_id: string
          target_id?: string | null
          voter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          round_id?: string
          target_id?: string | null
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      apply_game_state: {
        Args: {
          p_expected_version: number
          p_game: string
          p_is_deal?: boolean
          p_state: Json
        }
        Returns: number
      }
      create_lobby: {
        Args: { p_max_players: number }
        Returns: { code: string; id: string }[]
      }
      gen_lobby_code: { Args: Record<PropertyKey, never>; Returns: string }
      get_game_roster: {
        Args: { p_game: string }
        Returns: {
          alive: boolean
          display_name: string
          player_id: string
          role: Database["public"]["Enums"]["player_role"]
          turn_order: number
        }[]
      }
      get_my_role_card: { Args: { p_game: string }; Returns: Json }
      get_my_word: { Args: { p_game: string }; Returns: string }
      get_vote_progress: { Args: { p_game: string }; Returns: Json }
      has_verified_seat_claim: {
        Args: { p_lobby: string; p_player: string }
        Returns: boolean
      }
      is_game_member: { Args: { p_game: string }; Returns: boolean }
      is_lobby_member: { Args: { p_lobby: string }; Returns: boolean }
      is_round_member: { Args: { p_round: string }; Returns: boolean }
      join_lobby: { Args: { p_code: string }; Returns: string }
      leave_lobby: { Args: { p_lobby: string }; Returns: string }
      reap_and_migrate_host: {
        Args: { p_absent_host: string; p_lobby: string }
        Returns: string
      }
      send_chat: { Args: { p_content: string; p_game: string }; Returns: undefined }
      shares_lobby_with: { Args: { p_other: string }; Returns: boolean }
      touch_lobby_presence: { Args: { p_lobby: string }; Returns: undefined }
    }
    Enums: {
      game_status: "active" | "ended"
      lobby_mode: "casual" | "onchain"
      lobby_status: "waiting" | "in_game" | "ended"
      player_role: "crew" | "imposter"
      round_phase:
        | "deal"
        | "clue"
        | "discussion"
        | "vote"
        | "reveal"
        | "guess"
        | "end"
    }
    CompositeTypes: { [_ in never]: never }
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

export const Constants = {
  public: {
    Enums: {
      game_status: ["active", "ended"],
      lobby_status: ["waiting", "in_game", "ended"],
      player_role: ["crew", "imposter"],
      round_phase: ["deal", "clue", "discussion", "vote", "reveal", "guess", "end"],
    },
  },
} as const
