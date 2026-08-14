import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Card, BoardType, CardStatus } from '../types'
import { useAuth } from './useAuth'

const CARDS_QUERY = (board: BoardType) => ['cards', board]

export function useCards(board: BoardType) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: CARDS_QUERY(board),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cards')
        .select(`
          *,
          responsible:users!cards_responsible_id_fkey(id, full_name, email, avatar_url, role, created_at),
          comments:comments(count),
          attachments:attachments(count)
        `)
        .eq('board', board)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((c: Record<string, unknown>) => ({
        ...c,
        comments_count: (c.comments as Array<{ count: number }>)?.[0]?.count ?? 0,
        attachments_count: (c.attachments as Array<{ count: number }>)?.[0]?.count ?? 0,
      })) as Card[]
    },
  })

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`cards:${board}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards', filter: `board=eq.${board}` },
        () => { qc.invalidateQueries({ queryKey: CARDS_QUERY(board) }) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [board, qc])

  return query
}

export function useCard(id: string) {
  return useQuery({
    queryKey: ['card', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cards')
        .select(`
          *,
          responsible:users!cards_responsible_id_fkey(id, full_name, email, avatar_url, role, created_at)
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Card
    },
    enabled: !!id,
  })
}

// Pre-005 ref: four random digits, which could collide with an existing card.
// TEMPORARY — delete this and the fallback below once migration 005 has run.
function legacyRef(board: string) {
  const prefixes: Record<string, string> = { quotes: 'QUO', samples: 'SMP', orders: 'ORD' }
  const prefix = prefixes[board] ?? 'REF'
  const rand = String(Math.floor(Math.random() * 9000) + 1000)
  return `${prefix}-${new Date().getFullYear()}-${rand}`
}

export function useCreateCard() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (card: Omit<Card, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
      const { source_card_id, ...rest } = card

      // Allocated server-side: the sequence makes it collision-free, and a card
      // generated from another inherits that family's number (see 005 migration).
      const { data: ref } = await supabase
        .rpc('allocate_card_ref', {
          p_board: card.board,
          p_source_card_id: source_card_id ?? null,
        })
        .single<{ ref_number: string; ref_root: string }>()

      // Where 005 has not run there is no function and no ref_root/source_card_id
      // column, so fall back to the old ref and omit the columns that don't exist.
      const lineage = ref
        ? { ref_number: ref.ref_number, ref_root: ref.ref_root, source_card_id: source_card_id ?? null }
        : { ref_number: legacyRef(card.board) }

      const { data, error } = await supabase
        .from('cards')
        .insert({ ...rest, created_by: user!.id, ...lineage })
        .select()
        .single()
      if (error) throw error
      return data as Card
    },
    onSuccess: async (card) => {
      qc.invalidateQueries({ queryKey: CARDS_QUERY(card.board as BoardType) })
      // Log creation
      await supabase.from('activity_logs').insert({
        card_id: card.id,
        user_id: card.created_by,
        action: 'created',
        new_value: card.title,
      })
    },
  })
}

export function useUpdateCard() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Card> & { id: string }) => {
      const { data, error } = await supabase
        .from('cards')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Card
    },
    onSuccess: async (card) => {
      qc.invalidateQueries({ queryKey: CARDS_QUERY(card.board as BoardType) })
      qc.invalidateQueries({ queryKey: ['card', card.id] })
      qc.invalidateQueries({ queryKey: ['activity', card.id] })
      const uid = (await supabase.auth.getUser()).data.user?.id ?? ''
      await supabase.from('activity_logs').insert({ card_id: card.id, user_id: uid, action: 'updated' })
    },
  })
}

export function useMoveCard() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status, board }: { id: string; status: CardStatus; board: BoardType }) => {
      const { error } = await supabase
        .from('cards')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error

      // Log activity
      await supabase.from('activity_logs').insert({
        card_id: id,
        user_id: (await supabase.auth.getUser()).data.user!.id,
        action: 'moved',
        new_value: status,
      })
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: CARDS_QUERY(vars.board) })
      qc.invalidateQueries({ queryKey: ['card', vars.id] })
      qc.invalidateQueries({ queryKey: ['activity', vars.id] })
    },
  })
}

export function useDeleteCard() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, board }: { id: string; board: BoardType }) => {
      const { error } = await supabase.from('cards').delete().eq('id', id)
      if (error) throw error
      return board
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: CARDS_QUERY(vars.board) })
    },
  })
}
