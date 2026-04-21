export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string;
          name: string;
          type: string;
          base_price: number;
          capacity: number;
          images: Json | null;
          description: string | null;
          status: string | null;
          deleted_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          type: string;
          base_price: number;
          capacity?: number;
          images?: Json | null;
          description?: string | null;
          status?: string | null;
          deleted_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          type?: string;
          base_price?: number;
          capacity?: number;
          images?: Json | null;
          description?: string | null;
          status?: string | null;
          deleted_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      room_rates: {
        Row: {
          id: string;
          room_id: string | null;
          rate_date: string;
          price: number;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          room_id?: string | null;
          rate_date: string;
          price: number;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string | null;
          rate_date?: string;
          price?: number;
          created_at?: string | null;
        };
        Relationships: [
          Relationship & {
            foreignKeyName: "room_rates_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          role: string | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          user_id: string | null;
          room_id: string | null;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          special_requests: string | null;
          check_in: string;
          check_out: string;
          total_price: number;
          status: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          room_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          special_requests?: string | null;
          check_in: string;
          check_out: string;
          total_price: number;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          room_id?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          special_requests?: string | null;
          check_in?: string;
          check_out?: string;
          total_price?: number;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          Relationship & {
            foreignKeyName: "bookings_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          booking_id: string | null;
          midtrans_order_id: string | null;
          payment_type: string | null;
          amount: number | null;
          status: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          booking_id?: string | null;
          midtrans_order_id?: string | null;
          payment_type?: string | null;
          amount?: number | null;
          status?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          booking_id?: string | null;
          midtrans_order_id?: string | null;
          payment_type?: string | null;
          amount?: number | null;
          status?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          Relationship & {
            foreignKeyName: "transactions_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          table_name: string;
          record_id: string;
          action: string;
          old_data: Json | null;
          new_data: Json | null;
          performed_by: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          table_name: string;
          record_id: string;
          action: string;
          old_data?: Json | null;
          new_data?: Json | null;
          performed_by?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          table_name?: string;
          record_id?: string;
          action?: string;
          old_data?: Json | null;
          new_data?: Json | null;
          performed_by?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_dynamic_price: {
        Args: {
          p_room_id: string;
          p_date: string;
        };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
