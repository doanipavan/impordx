import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export interface CardView {
  user_id: string
  viewed_at: string
  user: { full_name: string; avatar_url?: string; role: string }
}

export function useCardViews(cardId: string) {
  return useQuery({
    queryKey: ['card_views', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_views')
        .select('user_id, viewed_at, user:users(full_name, avatar_url, role)')
        .eq('card_id', cardId)
        .order('viewed_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(d => ({ ...d, user: Array.isArray(d.user) ? d.user[0] : d.user })) as CardView[]
    },
    enabled: !!cardId,
  })
}

export function useRecordView(cardId: string) {
  const { user } = useAuth()
  useEffect(() => {
    if (!user || !cardId) return
    // Upsert: insert or update viewed_at timestamp
    supabase.from('card_views').upsert(
      { card_id: cardId, user_id: user.id, viewed_at: new Date().toISOString() },
      { onConflict: 'card_id,user_id' }
    ).then(() => {})
  }, [cardId, user])
}
