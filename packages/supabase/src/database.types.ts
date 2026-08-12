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
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          subscription_plan: 'basic' | 'pro' | 'enterprise';
          subscription_status: 'trialing' | 'active' | 'past_due' | 'cancelled';
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          trial_ends_at: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['organizations']['Row']> & {
          name: string;
          slug: string;
        };
        Update: Partial<Database['public']['Tables']['organizations']['Row']>;
        Relationships: [];
      };
      product_categories: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['product_categories']['Row']> & {
          organization_id: string;
          name: string;
        };
        Update: Partial<Database['public']['Tables']['product_categories']['Row']>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          unit: 'kg' | 'piece' | 'bunch' | 'bag' | 'liter';
          image_url: string | null;
          is_active: boolean;
          shelf_life_days: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['products']['Row']> & {
          organization_id: string;
          name: string;
          unit: 'kg' | 'piece' | 'bunch' | 'bag' | 'liter';
        };
        Update: Partial<Database['public']['Tables']['products']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'product_categories';
            referencedColumns: ['id'];
          },
        ];
      };
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
          stripe_checkout_session_id: string | null;
          source: 'web' | 'pos';
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
      order_items: {
        Row: {
          id: string;
          order_id: string;
          branch_product_id: string;
          product_name: string;
          unit: 'kg' | 'piece' | 'bunch' | 'bag' | 'liter';
          quantity: number;
          unit_price: number;
          line_total: number;
          unit_cost: number | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['order_items']['Row']> & {
          order_id: string;
          branch_product_id: string;
          product_name: string;
          unit: 'kg' | 'piece' | 'bunch' | 'bag' | 'liter';
          quantity: number;
          unit_price: number;
          line_total: number;
        };
        Update: Partial<Database['public']['Tables']['order_items']['Row']>;
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
          avg_unit_cost: number;
          last_unit_cost: number | null;
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
        Relationships: [
          {
            foreignKeyName: 'branch_products_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
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
          discount_percent: number | null;
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
      customers: {
        Row: {
          id: string;
          organization_id: string;
          phone: string;
          full_name: string | null;
          default_unit_id: string | null;
          whatsapp_opt_in: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['customers']['Row']> & {
          organization_id: string;
          phone: string;
        };
        Update: Partial<Database['public']['Tables']['customers']['Row']>;
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          id: string;
          branch_id: string;
          branch_product_id: string;
          movement_type: 'purchase' | 'sale' | 'waste' | 'adjustment';
          quantity: number;
          notes: string | null;
          order_id: string | null;
          created_by: string | null;
          expires_at: string | null;
          lot_id: string | null;
          unit_cost: number | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['inventory_movements']['Row']> & {
          branch_id: string;
          branch_product_id: string;
          movement_type: 'purchase' | 'sale' | 'waste' | 'adjustment';
          quantity: number;
        };
        Update: Partial<Database['public']['Tables']['inventory_movements']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'inventory_movements_branch_product_id_fkey';
            columns: ['branch_product_id'];
            isOneToOne: false;
            referencedRelation: 'branch_products';
            referencedColumns: ['id'];
          },
        ];
      };
      branch_operating_costs: {
        Row: {
          id: string;
          branch_id: string;
          name: string;
          cost_type: 'fixed' | 'variable';
          period: 'monthly' | 'daily' | 'per_order';
          amount: number;
          notes: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['branch_operating_costs']['Row']> & {
          branch_id: string;
          name: string;
          cost_type: 'fixed' | 'variable';
          amount: number;
        };
        Update: Partial<Database['public']['Tables']['branch_operating_costs']['Row']>;
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          phone: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['suppliers']['Row']> & {
          organization_id: string;
          name: string;
        };
        Update: Partial<Database['public']['Tables']['suppliers']['Row']>;
        Relationships: [];
      };
      purchases: {
        Row: {
          id: string;
          branch_id: string;
          supplier_id: string;
          purchased_at: string;
          notes: string | null;
          total_amount: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['purchases']['Row']> & {
          branch_id: string;
          supplier_id: string;
        };
        Update: Partial<Database['public']['Tables']['purchases']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'purchases_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
        ];
      };
      purchase_items: {
        Row: {
          id: string;
          purchase_id: string;
          branch_product_id: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['purchase_items']['Row']> & {
          purchase_id: string;
          branch_product_id: string;
          quantity: number;
          unit_price: number;
        };
        Update: Partial<Database['public']['Tables']['purchase_items']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'purchase_items_purchase_id_fkey';
            columns: ['purchase_id'];
            isOneToOne: false;
            referencedRelation: 'purchases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchase_items_branch_product_id_fkey';
            columns: ['branch_product_id'];
            isOneToOne: false;
            referencedRelation: 'branch_products';
            referencedColumns: ['id'];
          },
        ];
      };
      product_lots: {
        Row: {
          id: string;
          branch_id: string;
          branch_product_id: string;
          lot_code: string;
          gtin: string | null;
          supplier_name: string | null;
          pack_date: string | null;
          expires_at: string | null;
          quantity_received: number;
          quantity_remaining: number;
          pti_label: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['product_lots']['Row']> & {
          branch_id: string;
          branch_product_id: string;
          lot_code: string;
          quantity_received: number;
          quantity_remaining: number;
        };
        Update: Partial<Database['public']['Tables']['product_lots']['Row']>;
        Relationships: [
          {
            foreignKeyName: 'product_lots_branch_product_id_fkey';
            columns: ['branch_product_id'];
            isOneToOne: false;
            referencedRelation: 'branch_products';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          is_platform_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['profiles']['Row']> & { id: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      staff_memberships: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          branch_id: string | null;
          role: 'owner' | 'org_admin' | 'branch_manager' | 'staff';
          status: 'active' | 'inactive';
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['staff_memberships']['Row']> & {
          user_id: string;
          organization_id: string;
          role: 'owner' | 'org_admin' | 'branch_manager' | 'staff';
        };
        Update: Partial<Database['public']['Tables']['staff_memberships']['Row']>;
        Relationships: [];
      };
      daily_cash_closings: {
        Row: {
          id: string;
          branch_id: string;
          closing_date: string;
          cash_total: number;
          card_terminal_total: number;
          transfer_total: number;
          notes: string | null;
          closed_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['daily_cash_closings']['Row']> & {
          branch_id: string;
          closing_date: string;
        };
        Update: Partial<Database['public']['Tables']['daily_cash_closings']['Row']>;
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
          direction: 'inbound' | 'outbound';
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
      record_inventory_movement: {
        Args: {
          p_branch_product_id: string;
          p_movement_type: 'purchase' | 'sale' | 'waste' | 'adjustment';
          p_quantity: number;
          p_notes: string | null;
          p_expires_at?: string | null;
          p_unit_cost?: number | null;
        };
        Returns: Array<{ new_stock: number; new_avg_unit_cost: number }>;
      };
      get_branch_discount_percent: {
        Args: { p_branch_id: string };
        Returns: number;
      };
      receive_product_lot: {
        Args: {
          p_branch_product_id: string;
          p_lot_code: string;
          p_quantity: number;
          p_gtin?: string | null;
          p_supplier_name?: string | null;
          p_pack_date?: string | null;
          p_expires_at?: string | null;
          p_pti_label?: string | null;
          p_notes?: string | null;
        };
        Returns: Array<{ lot_id: string; new_stock: number }>;
      };
      record_supplier_purchase: {
        Args: {
          p_branch_id: string;
          p_supplier_id: string;
          p_purchased_at: string | null;
          p_notes: string | null;
          p_items: Json;
        };
        Returns: Array<{ purchase_id: string; total_amount: number }>;
      };
      get_lot_traceability: {
        Args: { p_lot_code: string; p_branch_id?: string | null };
        Returns: Array<Record<string, unknown>>;
      };
      get_restock_forecast: {
        Args: { p_branch_id: string; p_horizon_days?: number };
        Returns: Array<{
          branch_product_id: string;
          product_name: string;
          unit: 'kg' | 'piece' | 'bunch' | 'bag' | 'liter';
          current_stock: number;
          avg_daily_sales: number;
          forecast_demand: number;
          suggested_reorder: number;
          days_until_stockout: number | null;
        }>;
      };
      get_product_margins: {
        Args: { p_branch_id: string };
        Returns: Array<{
          branch_product_id: string;
          product_name: string;
          unit: 'kg' | 'piece' | 'bunch' | 'bag' | 'liter';
          sale_price: number;
          avg_unit_cost: number;
          last_unit_cost: number | null;
          margin_amount: number;
          margin_percent: number;
          stock: number;
          inventory_value_cost: number;
          inventory_value_sale: number;
        }>;
      };
      get_profit_summary: {
        Args: { p_branch_id: string; p_days?: number };
        Returns: Array<{
          period_days: number;
          revenue: number;
          cogs: number;
          gross_profit: number;
          gross_margin_percent: number;
          fixed_costs: number;
          variable_costs: number;
          operating_costs_total: number;
          estimated_net_profit: number;
          order_count: number;
        }>;
      };
      get_profit_by_category: {
        Args: { p_branch_id: string; p_days?: number };
        Returns: Array<{
          category_name: string;
          product_count: number;
          units_sold: number;
          revenue: number;
          cogs: number;
          gross_profit: number;
          gross_margin_percent: number;
        }>;
      };
      resolve_whatsapp_organization: {
        Args: { p_phone_number_id: string };
        Returns: string | null;
      };
      get_orders_by_customer_phone: {
        Args: { p_organization_id: string; p_phone: string; p_limit?: number };
        Returns: Array<{
          id: string;
          order_number: number;
          status: 'pending' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
          total: number;
          tracking_token: string;
          created_at: string;
          branch_name: string;
          branch_slug: string;
        }>;
      };
      get_customer_whatsapp_opt_in: {
        Args: { p_organization_id: string; p_phone: string };
        Returns: boolean;
      };
      set_customer_whatsapp_opt_in: {
        Args: { p_organization_id: string; p_phone: string; p_opt_in: boolean };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
