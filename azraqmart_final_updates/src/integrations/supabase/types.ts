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
      about_section: {
        Row: {
          cta_label: string | null
          cta_link: string | null
          description: string | null
          eyebrow: string | null
          features: Json
          image_url: string | null
          is_visible: boolean
          key: string
          stats: Json
          subtitle: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cta_label?: string | null
          cta_link?: string | null
          description?: string | null
          eyebrow?: string | null
          features?: Json
          image_url?: string | null
          is_visible?: boolean
          key?: string
          stats?: Json
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cta_label?: string | null
          cta_link?: string | null
          description?: string | null
          eyebrow?: string | null
          features?: Json
          image_url?: string | null
          is_visible?: boolean
          key?: string
          stats?: Json
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_custom_css: {
        Row: {
          css_content: string
          id: string
          is_active: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          css_content?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          css_content?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_custom_css_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_labels: {
        Row: {
          category: string
          default_value: string
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          category?: string
          default_value: string
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          category?: string
          default_value?: string
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_labels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          accent_color: string | null
          app_name: string
          app_slogan: string | null
          background_color: string | null
          created_at: string
          features: Json | null
          font_family: string | null
          id: string
          license_key: string | null
          logo_url: string | null
          max_customers: number | null
          max_users: number | null
          primary_color: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          app_name?: string
          app_slogan?: string | null
          background_color?: string | null
          created_at?: string
          features?: Json | null
          font_family?: string | null
          id?: string
          license_key?: string | null
          logo_url?: string | null
          max_customers?: number | null
          max_users?: number | null
          primary_color?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          app_name?: string
          app_slogan?: string | null
          background_color?: string | null
          created_at?: string
          features?: Json | null
          font_family?: string | null
          id?: string
          license_key?: string | null
          logo_url?: string | null
          max_customers?: number | null
          max_users?: number | null
          primary_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          snapshot_data: Json
          title: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          snapshot_data: Json
          title: string
          version?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          snapshot_data?: Json
          title?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_typography: {
        Row: {
          category: string
          css_variable: string | null
          key: string
          label: string
          updated_at: string
          value: string
        }
        Insert: {
          category?: string
          css_variable?: string | null
          key: string
          label: string
          updated_at?: string
          value: string
        }
        Update: {
          category?: string
          css_variable?: string | null
          key?: string
          label?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bin_locations: {
        Row: {
          capacity: number | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          zone: string | null
        }
        Insert: {
          capacity?: number | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          zone?: string | null
        }
        Update: {
          capacity?: number | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          zone?: string | null
        }
        Relationships: []
      }
      cash_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          assigned_to: string | null
          created_at: string
          customer_id: string
          id: string
          last_message_at: string
          status: string
          subject: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          customer_id: string
          id?: string
          last_message_at?: string
          status?: string
          subject?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          last_message_at?: string
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          metadata: Json | null
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          sender_id?: string | null
          sender_type?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          metadata?: Json | null
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          keywords: string[]
          question: string
          sort_order: number
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keywords: string[]
          question: string
          sort_order?: number
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          question?: string
          sort_order?: number
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_total: number | null
          starts_at: string | null
          updated_at: string
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_total?: number | null
          starts_at?: string | null
          updated_at?: string
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_total?: number | null
          starts_at?: string | null
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      customer_return_items: {
        Row: {
          condition: string | null
          id: string
          line_total: number
          product_id: string
          quantity: number
          return_id: string
          unit_price: number
        }
        Insert: {
          condition?: string | null
          id?: string
          line_total?: number
          product_id: string
          quantity: number
          return_id: string
          unit_price?: number
        }
        Update: {
          condition?: string | null
          id?: string
          line_total?: number
          product_id?: string
          quantity?: number
          return_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "customer_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_returns: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          order_id: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string
          status: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          order_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason: string
          status?: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_returns_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          balance: number | null
          city: string | null
          created_at: string
          credit_limit: number | null
          district: string | null
          governorate: string | null
          id: string
          is_active: boolean | null
          owner_name: string | null
          phone: string
          points: number
          shop_name: string
          tier: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          balance?: number | null
          city?: string | null
          created_at?: string
          credit_limit?: number | null
          district?: string | null
          governorate?: string | null
          id?: string
          is_active?: boolean | null
          owner_name?: string | null
          phone: string
          points?: number
          shop_name: string
          tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          balance?: number | null
          city?: string | null
          created_at?: string
          credit_limit?: number | null
          district?: string | null
          governorate?: string | null
          id?: string
          is_active?: boolean | null
          owner_name?: string | null
          phone?: string
          points?: number
          shop_name?: string
          tier?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      driver_location_history: {
        Row: {
          driver_id: string
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          speed: number | null
        }
        Insert: {
          driver_id: string
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          speed?: number | null
        }
        Update: {
          driver_id?: string
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_location_history_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          driver_id: string
          heading: number | null
          is_online: boolean
          last_updated_at: string
          latitude: number
          longitude: number
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          driver_id: string
          heading?: number | null
          is_online?: boolean
          last_updated_at?: string
          latitude: number
          longitude: number
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          driver_id?: string
          heading?: number | null
          is_online?: boolean
          last_updated_at?: string
          latitude?: number
          longitude?: number
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      home_banners: {
        Row: {
          cta_label: string | null
          cta_link: string | null
          eyebrow: string | null
          image_url: string | null
          is_visible: boolean
          key: string
          subtitle: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cta_label?: string | null
          cta_link?: string | null
          eyebrow?: string | null
          image_url?: string | null
          is_visible?: boolean
          key: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cta_label?: string | null
          cta_link?: string | null
          eyebrow?: string | null
          image_url?: string | null
          is_visible?: boolean
          key?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      internal_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_read: boolean
          recipient_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          recipient_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          company_name: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          features: Json
          id: string
          is_active: boolean
          license_key: string
          max_customers: number
          max_users: number
          notes: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          license_key: string
          max_customers?: number
          max_users?: number
          notes?: string | null
          starts_at?: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          license_key?: string
          max_customers?: number
          max_users?: number
          notes?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      login_banner_settings: {
        Row: {
          badge_label: string
          badge_title: string
          created_at: string
          features: Json
          hero_highlight: string
          hero_subtitle: string
          hero_title: string
          id: string
          is_visible: boolean
          stats: Json
          updated_at: string
        }
        Insert: {
          badge_label?: string
          badge_title?: string
          created_at?: string
          features?: Json
          hero_highlight?: string
          hero_subtitle?: string
          hero_title?: string
          id?: string
          is_visible?: boolean
          stats?: Json
          updated_at?: string
        }
        Update: {
          badge_label?: string
          badge_title?: string
          created_at?: string
          features?: Json
          hero_highlight?: string
          hero_subtitle?: string
          hero_title?: string
          id?: string
          is_visible?: boolean
          stats?: Json
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          metadata: Json
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          metadata?: Json
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          metadata?: Json
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          order_id: string
          product_id: string | null
          product_name: string
          qty: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          order_id: string
          product_id?: string | null
          product_name: string
          qty: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_delivery: string | null
          assigned_warehouse: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivered_at: string | null
          delivery_notes: string | null
          delivery_status: string | null
          delivery_status_history: Json
          id: string
          notes: string | null
          order_number: number
          payment_status: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_delivery?: string | null
          assigned_warehouse?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          delivery_status_history?: Json
          id?: string
          notes?: string | null
          order_number?: number
          payment_status?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_delivery?: string | null
          assigned_warehouse?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          delivery_status_history?: Json
          id?: string
          notes?: string | null
          order_number?: number
          payment_status?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_config: {
        Row: {
          badge_text: string | null
          currency: string | null
          features: Json
          id: string
          is_active: boolean
          limits: Json
          name: string
          name_ar: string
          price_monthly: number | null
          price_yearly: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          currency?: string | null
          features?: Json
          id: string
          is_active?: boolean
          limits?: Json
          name: string
          name_ar: string
          price_monthly?: number | null
          price_yearly?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          currency?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          limits?: Json
          name?: string
          name_ar?: string
          price_monthly?: number | null
          price_yearly?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_locations: {
        Row: {
          bin_location_id: string
          id: string
          is_primary: boolean
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          bin_location_id: string
          id?: string
          is_primary?: boolean
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          bin_location_id?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_locations_bin_location_id_fkey"
            columns: ["bin_location_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_locations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          carton_price: number
          category: string | null
          category_id: string | null
          created_at: string
          id: string
          image_url: string | null
          image_url_2: string | null
          is_active: boolean | null
          low_stock_threshold: number | null
          name: string
          sku: string | null
          stock_qty: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          carton_price?: number
          category?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          image_url_2?: string | null
          is_active?: boolean | null
          low_stock_threshold?: number | null
          name: string
          sku?: string | null
          stock_qty?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          carton_price?: number
          category?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          image_url_2?: string | null
          is_active?: boolean | null
          low_stock_threshold?: number | null
          name?: string
          sku?: string | null
          stock_qty?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          assigned_districts: string[]
          assigned_governorates: string[]
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          shop_name: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          address?: string | null
          assigned_districts?: string[]
          assigned_governorates?: string[]
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          shop_name?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          address?: string | null
          assigned_districts?: string[]
          assigned_governorates?: string[]
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          shop_name?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      purchase_invoice_items: {
        Row: {
          id: string
          invoice_id: string
          line_total: number
          product_id: string | null
          product_name: string
          qty: number
          unit_cost: number
        }
        Insert: {
          id?: string
          invoice_id: string
          line_total: number
          product_id?: string | null
          product_name: string
          qty: number
          unit_cost: number
        }
        Update: {
          id?: string
          invoice_id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          paid: number
          supplier_name: string
          total: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          paid?: number
          supplier_name: string
          total?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          paid?: number
          supplier_name?: string
          total?: number
        }
        Relationships: []
      }
      purchase_return_items: {
        Row: {
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          qty: number
          return_id: string
          unit_cost: number
        }
        Insert: {
          id?: string
          line_total: number
          product_id?: string | null
          product_name: string
          qty: number
          return_id: string
          unit_cost: number
        }
        Update: {
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          qty?: number
          return_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          return_date: string
          return_number: string
          supplier_name: string
          total: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          return_date?: string
          return_number: string
          supplier_name: string
          total?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          return_date?: string
          return_number?: string
          supplier_name?: string
          total?: number
        }
        Relationships: []
      }
      push_config: {
        Row: {
          endpoint_url: string | null
          id: number
          internal_secret: string | null
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          endpoint_url?: string | null
          id?: number
          internal_secret?: string | null
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          endpoint_url?: string | null
          id?: number
          internal_secret?: string | null
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      stock_alerts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_alerted_at: string | null
          min_quantity: number
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_alerted_at?: string | null
          min_quantity?: number
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_alerted_at?: string | null
          min_quantity?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          product_id: string
          qty: number
          qty_after: number | null
          qty_before: number | null
          reason: string | null
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          product_id: string
          qty: number
          qty_after?: number | null
          qty_before?: number | null
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          product_id?: string
          qty?: number
          qty_after?: number | null
          qty_before?: number | null
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktake_items: {
        Row: {
          counted_at: string | null
          counted_by: string | null
          counted_quantity: number | null
          discrepancy: number | null
          id: string
          notes: string | null
          product_id: string
          stocktake_id: string
          system_quantity: number
        }
        Insert: {
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          discrepancy?: number | null
          id?: string
          notes?: string | null
          product_id: string
          stocktake_id: string
          system_quantity?: number
        }
        Update: {
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          discrepancy?: number | null
          id?: string
          notes?: string | null
          product_id?: string
          stocktake_id?: string
          system_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "stocktake_items_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stocktake_items_stocktake_id_fkey"
            columns: ["stocktake_id"]
            isOneToOne: false
            referencedRelation: "stocktakes"
            referencedColumns: ["id"]
          },
        ]
      }
      stocktakes: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          discrepancies: number
          id: string
          notes: string | null
          status: string
          title: string
          total_items: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          discrepancies?: number
          id?: string
          notes?: string | null
          status?: string
          title: string
          total_items?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          discrepancies?: number
          id?: string
          notes?: string | null
          status?: string
          title?: string
          total_items?: number
        }
        Relationships: [
          {
            foreignKeyName: "stocktakes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          can_about: boolean
          can_accounting: boolean
          can_banners: boolean
          can_categories: boolean
          can_chatbot: boolean
          can_customers: boolean
          can_dashboard: boolean
          can_debts: boolean
          can_developer: boolean
          can_login_banner: boolean
          can_messages: boolean
          can_offers: boolean
          can_orders: boolean
          can_products: boolean
          can_purchases: boolean
          can_reports: boolean
          can_users: boolean
          can_warehouse: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          can_about?: boolean
          can_accounting?: boolean
          can_banners?: boolean
          can_categories?: boolean
          can_chatbot?: boolean
          can_customers?: boolean
          can_dashboard?: boolean
          can_debts?: boolean
          can_developer?: boolean
          can_login_banner?: boolean
          can_messages?: boolean
          can_offers?: boolean
          can_orders?: boolean
          can_products?: boolean
          can_purchases?: boolean
          can_reports?: boolean
          can_users?: boolean
          can_warehouse?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          can_about?: boolean
          can_accounting?: boolean
          can_banners?: boolean
          can_categories?: boolean
          can_chatbot?: boolean
          can_customers?: boolean
          can_dashboard?: boolean
          can_debts?: boolean
          can_developer?: boolean
          can_login_banner?: boolean
          can_messages?: boolean
          can_offers?: boolean
          can_orders?: boolean
          can_products?: boolean
          can_purchases?: boolean
          can_reports?: boolean
          can_users?: boolean
          can_warehouse?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_push_tokens: {
        Row: {
          created_at: string
          device_info: Json
          id: string
          is_active: boolean
          last_seen_at: string
          platform: string
          role: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: Json
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string
          role?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: Json
          id?: string
          is_active?: boolean
          last_seen_at?: string
          platform?: string
          role?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
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
      welcome_dismissals: {
        Row: {
          dismissed_at: string
          message_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          message_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welcome_dismissals_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "welcome_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_messages: {
        Row: {
          bg_color: string | null
          body: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          pinned: boolean
          target_customer_id: string | null
          text_color: string | null
          title: string
          updated_at: string
        }
        Insert: {
          bg_color?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          pinned?: boolean
          target_customer_id?: string | null
          text_color?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          bg_color?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          pinned?: boolean
          target_customer_id?: string | null
          text_color?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "welcome_messages_target_customer_id_fkey"
            columns: ["target_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_stock: {
        Args: {
          _delta: number
          _movement_type: string
          _product_id: string
          _reason?: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          product_id: string
          qty: number
          qty_after: number | null
          qty_before: number | null
          reason: string | null
          reference_id: string | null
          reference_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "stock_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_order_to_delivery: {
        Args: { _delivery_user_id: string; _note?: string; _order_id: string }
        Returns: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_delivery: string | null
          assigned_warehouse: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivered_at: string | null
          delivery_notes: string | null
          delivery_status: string | null
          delivery_status_history: Json
          id: string
          notes: string | null
          order_number: number
          payment_status: string | null
          status: string
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_username_available: { Args: { _username: string }; Returns: boolean }
      log_audit: {
        Args: {
          p_action: string
          p_actor_id: string
          p_changes?: Json
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
        }
        Returns: string
      }
      record_stock_movement: {
        Args: {
          p_actor_id?: string
          p_movement_type: string
          p_product_id: string
          p_quantity: number
          p_reason?: string
          p_reference_id?: string
          p_reference_type?: string
        }
        Returns: string
      }
      resolve_login_phone: { Args: { _identifier: string }; Returns: string }
      set_my_username: { Args: { _username: string }; Returns: string }
      update_delivery_status: {
        Args: { _new_status: string; _note?: string; _order_id: string }
        Returns: {
          assigned_at: string | null
          assigned_by: string | null
          assigned_delivery: string | null
          assigned_warehouse: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          delivered_at: string | null
          delivery_notes: string | null
          delivery_status: string | null
          delivery_status_history: Json
          id: string
          notes: string | null
          order_number: number
          payment_status: string | null
          status: string
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "merchant"
        | "delivery"
        | "warehouse"
        | "developer"
        | "accountant"
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
      app_role: [
        "admin",
        "merchant",
        "delivery",
        "warehouse",
        "developer",
        "accountant",
      ],
    },
  },
} as const
