import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Comment } from '../types'
import { useAuth } from './useAuth'

export function useComments(cardId: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['comments', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*, user:users(id, full_name, email, avatar_url, role, created_at)')
        .eq('card_id', cardId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as Comment[]
    },
    enabled: !!cardId,
  })

  useEffect(() => {
    const channel = supabase
      .channel(`comments:${cardId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `card_id=eq.${cardId}` },
        () => qc.invalidateQueries({ queryKey: ['comments', cardId] })
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [cardId, qc])

  return query
}

export function useAddComment() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ cardId, body }: { cardId: string; body: string }) => {
      const { data, error } = await supabase
        .from('comments')
        .insert({ card_id: cardId, user_id: user!.id, body })
        .select('*, user:users(id, full_name, email, avatar_url, role, created_at)')
        .single()
      if (error) throw error
      return data as Comment
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['comments', vars.cardId] })
    },
  })
}

export function useEditComment() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, cardId, body }: { id: string; cardId: string; body: string }) => {
      const { error } = await supabase
        .from('comments')
        .update({ body, edited: true, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['comments', vars.cardId] })
    },
  })
}

export function useDeleteComment() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, cardId }: { id: string; cardId: string }) => {
      const { error } = await supabase.from('comments').delete().eq('id', id)
      if (error) throw error
      return cardId
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['comments', vars.cardId] })
    },
  })
}
