export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      doc_invites: {
        Row: {
          created_at: string;
          doc_id: string;
          doc_title: string;
          email: string;
          id: string;
          invited_by: string;
          role: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          doc_id: string;
          doc_title?: string;
          email: string;
          id?: string;
          invited_by: string;
          role: string;
        };
        Update: {
          created_at?: string;
          doc_id?: string;
          doc_title?: string;
          email?: string;
          id?: string;
          invited_by?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doc_invites_doc_id_fkey";
            columns: ["doc_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      doc_members: {
        Row: {
          created_at: string;
          doc_id: string;
          email: string;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          doc_id: string;
          email: string;
          role: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          doc_id?: string;
          email?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doc_members_doc_id_fkey";
            columns: ["doc_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      doc_scene_meta: {
        Row: {
          doc_id: string;
          scene_version: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          doc_id: string;
          scene_version?: number;
          updated_at?: string;
        };
        Update: {
          doc_id?: string;
          scene_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doc_scene_meta_doc_id_fkey";
            columns: ["doc_id"];
            isOneToOne: true;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      doc_scenes: {
        Row: {
          blob: string;
          doc_id: string;
          scene_version: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          blob: string;
          doc_id: string;
          scene_version: number;
          updated_at?: string;
        };
        Update: {
          blob?: string;
          doc_id?: string;
          scene_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doc_scenes_doc_id_fkey";
            columns: ["doc_id"];
            isOneToOne: true;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          created_at: string;
          id: string;
          is_public: boolean;
          owner_email: string;
          owner_id: string;
          room_id: string;
          room_key: string;
          scene_version: number;
          thumbnail_path: string | null;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_public?: boolean;
          owner_email: string;
          owner_id: string;
          room_id: string;
          room_key: string;
          scene_version?: number;
          thumbnail_path?: string | null;
          title?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_public?: boolean;
          owner_email?: string;
          owner_id?: string;
          room_id?: string;
          room_key?: string;
          scene_version?: number;
          thumbnail_path?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email: string;
          id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string;
          id?: string;
        };
        Relationships: [];
      };
      scenes: {
        Row: {
          ciphertext: string;
          iv: string;
          room_id: string;
          scene_version: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          ciphertext: string;
          iv: string;
          room_id: string;
          scene_version: number;
          updated_at?: string;
        };
        Update: {
          ciphertext?: string;
          iv?: string;
          room_id?: string;
          scene_version?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_email: { Args: Record<PropertyKey, never>; Returns: string };
      doc_role: { Args: { p_doc: string }; Returns: string };
      get_public_doc: {
        Args: { p_doc: string };
        Returns: {
          id: string;
          scene_version: number;
          title: string;
          updated_at: string;
        }[];
      };
      is_doc_member: { Args: { p_doc: string }; Returns: boolean };
      is_doc_public: { Args: { p_doc: string }; Returns: boolean };
      save_anonymous_scene: {
        Args: {
          p_base_version: number;
          p_ciphertext: string;
          p_iv: string;
          p_room_id: string;
          p_scene_version: number;
        };
        Returns: number;
      };
      save_doc_scene: {
        Args: {
          p_base_version: number;
          p_blob: string;
          p_doc: string;
          p_scene_version: number;
        };
        Returns: number;
      };
      set_doc_thumbnail: {
        Args: { p_doc: string; p_path: string };
        Returns: undefined;
      };
      storage_doc_id: { Args: { object_name: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
      DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
      DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
