export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
        Relationships: [];
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
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
