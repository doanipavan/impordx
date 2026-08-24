import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'admin' | 'member' | 'viewer'
          avatar_url: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      cards: {
        Row: {
          id: string
          board: string
          status: string
          title: string
          description: string | null
          priority: string
          value_usd: number | null
          deadline: string | null
          salesperson_id: string | null
          salesperson_name: string | null
          project_manager_id: string | null
          client_name: string | null
          collection: string | null
          size: string | null
          quantity: number | null
          outside_material: string | null
          inside_material: string | null
          logo_color: string | null
          logo_technique: string | null
          logo_positions: string[] | null
          reference_code: string | null
          supplier_ref: string | null
          tags: string[] | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['cards']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['cards']['Insert']>
      }
      comments: {
        Row: {
          id: string
          card_id: string
          user_id: string
          body: string
          edited: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['comments']['Row'], 'id' | 'created_at' | 'updated_at' | 'edited'>
        Update: Partial<Pick<Database['public']['Tables']['comments']['Row'], 'body' | 'edited'>>
      }
      attachments: {
        Row: {
          id: string
          card_id: string
          user_id: string
          filename: string
          file_url: string
          file_type: string
          file_size: number
          thumbnail_url: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['attachments']['Row'], 'id' | 'created_at'>
        Update: never
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          card_id: string | null
          actor_id: string | null
          type: string
          message: string
          read: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at' | 'read'>
        Update: Pick<Database['public']['Tables']['notifications']['Row'], 'read'>
      }
      activity_logs: {
        Row: {
          id: string
          card_id: string
          user_id: string
          action: string
          old_value: string | null
          new_value: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['activity_logs']['Row'], 'id' | 'created_at'>
        Update: never
      }
    }
  }
}
