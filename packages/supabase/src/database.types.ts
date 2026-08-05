export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string;
          branch_id: string;
          organization_id: string;
          customer_id: string | null;
          order_number: number;
          tracking_token: string;
          customer_name: string;
          customer_phone: string;
          fulfillment_type: 'delivery' | 'pickup';
          unit_id: string | null;
          delivery_notes: string | null;
          status: 'pending' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
          subtotal: number;
          delivery_fee: number;
          total: number;
          payment_method: 'cash' | 'card_terminal' | 'transfer' | 'online' | null;
          payment_status: 'pending' | 'paid' | 'refunded';
          paid_at: string | null;
          paid_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['orders']['Row']> & {
          branch_id: string;
          organization_id: string;
          customer_name: string;
          customer_phone: string;
          fulfillment_type: 'delivery' | 'pickup';
        };
        Update: Partial<Database['public']['Tables']['orders']['Row']>;
        Relationships: [];
      };
      branches: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          address: string | null;
          timezone: string;
          is_active: boolean;
          pickup_instructions: string | null;
          delivery_fee: number;
          minimum_order_amount: number;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['branches']['Row']> & {
          organization_id: string;
          name: string;
          slug: string;
        };
        Update: Partial<Database['public']['Tables']['branches']['Row']>;
        Relationships: [];
      };
      branch_products: {
        Row: {
          id: string;
          branch_id: string;
          product_id: string;
          price: number;
          stock: number;
          is_available: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['branch_products']['Row']> & {
          branch_id: string;
          product_id: string;
          price: number;
        };
        Update: Partial<Database['public']['Tables']['branch_products']['Row']>;
        Relationships: [];
      };
      promotions: {
        Row: {
          id: string;
          branch_id: string;
          title: string;
          body: string | null;
          kind: 'banner' | 'discount' | 'bundle';
          image_url: string | null;
          starts_at: string | null;
          ends_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['promotions']['Row']> & {
          branch_id: string;
          title: string;
        };
        Update: Partial<Database['public']['Tables']['promotions']['Row']>;
        Relationships: [];
      };
      buildings: {
        Row: {
          id: string;
          branch_id: string;
          name: string;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['buildings']['Row']> & {
          branch_id: string;
          name: string;
        };
        Update: Partial<Database['public']['Tables']['buildings']['Row']>;
        Relationships: [];
      };
      whatsapp_message_logs: {
        Row: {
          id: string;
          organization_id: string;
          order_id: string | null;
          recipient_phone: string;
          template_key: string | null;
          body: string;
          external_message_id: string | null;
          status: string;
          error_message: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['whatsapp_message_logs']['Row']> & {
          organization_id: string;
          recipient_phone: string;
          body: string;
        };
        Update: Partial<Database['public']['Tables']['whatsapp_message_logs']['Row']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_public_branch: {
        Args: { target_slug: string };
        Returns: Array<{
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          address: string | null;
          pickup_instructions: string | null;
          delivery_fee: number;
          minimum_order_amount: number;
          org_name: string;
          org_slug: string;
        }>;
      };
      place_guest_order: {
        Args: {
          p_branch_slug: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_fulfillment_type: 'delivery' | 'pickup';
          p_unit_id: string | null;
          p_delivery_notes: string | null;
          p_items: Json;
        };
        Returns: Array<{
          order_id: string;
          order_number: number;
          tracking_token: string;
          total: number;
        }>;
      };
      get_order_by_tracking_token: {
        Args: { p_token: string };
        Returns: Array<{
          id: string;
          order_number: number;
          customer_name: string;
          status: 'pending' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
          fulfillment_type: 'delivery' | 'pickup';
          subtotal: number;
          delivery_fee: number;
          total: number;
          payment_status: 'pending' | 'paid' | 'refunded';
          created_at: string;
          branch_name: string;
          items: Json;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
