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
    mutationFn: async ({ cardId, body, parentId, mentionedUserIds = [] }: { cardId: string; body: string; parentId?: string; mentionedUserIds?: string[] }) => {
      const { data, error } = await supabase
        .from('comments')
        .insert({ card_id: cardId, user_id: user!.id, body, parent_id: parentId ?? null })
        .select('*, user:users(id, full_name, email, avatar_url, role, created_at)')
        .single()
      if (error) throw error
      return { comment: data as Comment, mentionedUserIds }
    },
    onSuccess: ({ mentionedUserIds }, vars) => {
      qc.invalidateQueries({ queryKey: ['comments', vars.cardId] })
      supabase.from('activity_logs').insert({ card_id: vars.cardId, user_id: user!.id, action: 'commented' })

      const targets = [...new Set(mentionedUserIds)].filter(id => id !== user!.id)
      if (targets.length > 0) {
        supabase.from('notifications').insert(
          targets.map(uid => ({
            user_id: uid,
            card_id: vars.cardId,
            actor_id: user!.id,
            type: 'mention',
            message: `${user!.full_name} mentioned you in a comment`,
          }))
        )
      }
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
