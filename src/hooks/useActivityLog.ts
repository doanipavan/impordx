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

export interface Checkpoint {
  card_id: string
  status: string
  at: string
  by: string
}

// Status changes across a set of cards, for the timeline dots. Reads the
// history that is already being written — nothing new is captured for this.
// No realtime subscription on purpose: the board already has one, and a second
// reader of the same channel is what took the page white before.
export function useCheckpoints(cardIds: string[]) {
  const key = [...cardIds].sort().join(',')

  return useQuery({
    queryKey: ['checkpoints', key],
    queryFn: async () => {
      if (cardIds.length === 0) return [] as Checkpoint[]
      const { data, error } = await supabase
        .from('activity_logs')
        .select('card_id, new_value, created_at, user:users(full_name)')
        .in('card_id', cardIds)
        .eq('action', 'moved')
        .order('created_at', { ascending: true })
      if (error) throw error

      return (data ?? []).map((r: Record<string, unknown>) => ({
        card_id: r.card_id as string,
        status: (r.new_value as string) ?? '',
        at: r.created_at as string,
        by: (r.user as { full_name?: string } | null)?.full_name ?? 'someone',
      })).filter(c => c.status) as Checkpoint[]
    },
    enabled: cardIds.length > 0,
  })
}
