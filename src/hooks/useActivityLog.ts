import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface ActivityEntry {
  id: string
  card_id: string
  user_id: string
  user?: { full_name: string; avatar_url?: string }
  action: string
  old_value?: string
  new_value?: string
  created_at: string
}

export function useActivityLog(cardId: string) {
  return useQuery({
    queryKey: ['activity', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*, user:users(full_name, avatar_url)')
        .eq('card_id', cardId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ActivityEntry[]
    },
    enabled: !!cardId,
  })
}
