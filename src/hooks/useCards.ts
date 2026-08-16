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

  // Realtime subscription. Two components can read the same board at once —
  // the Orders timeline sits above the board that renders the same cards — and
  // subscribing twice to one channel name is what took the page white before
  // (see 4042d96, same failure on notifications). First mount owns the channel.
  useEffect(() => {
    const channelName = `cards:${board}`
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) return

    const channel = supabase
      .channel(channelName)
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

export function useCreateCard() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (card: Omit<Card, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
      const { source_card_id, ...rest } = card

      // Allocated server-side: the sequence makes it collision-free, and a card
      // generated from another inherits that family's number (see 005 migration).
      const { data: ref, error: refError } = await supabase
        .rpc('allocate_card_ref', {
          p_board: card.board,
          p_source_card_id: source_card_id ?? null,
        })
        .single<{ ref_number: string; ref_root: string }>()
      if (refError) throw refError

      const { data, error } = await supabase
        .from('cards')
        .insert({
          ...rest,
          created_by: user!.id,
          ref_number: ref.ref_number,
          ref_root: ref.ref_root,
          source_card_id: source_card_id ?? null,
        })
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

// Promoting a quote or sample moves the card itself onto the Orders board
// rather than copying it, so the approved artwork, the conversation and the
// history stay attached to the piece the factory is about to produce.
export function usePromoteToOrder() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, fromBoard }: { id: string; fromBoard: BoardType }) => {
      // Re-number under the Orders prefix, keeping the family key. Passing the
      // card as its own source is what makes it inherit its own ref_root.
      const { data: ref, error: refError } = await supabase
        .rpc('allocate_card_ref', { p_board: 'orders', p_source_card_id: id })
        .single<{ ref_number: string; ref_root: string }>()
      if (refError) throw refError

      const { data, error } = await supabase
        .from('cards')
        .update({
          board: 'orders',
          status: 'Placed',
          ref_number: ref.ref_number,
          ref_root: ref.ref_root,
          // Promotion is the confirmation, so this is where the 60+60 starts.
          order_confirmed_at: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      const uid = (await supabase.auth.getUser()).data.user?.id ?? ''
      await supabase.from('activity_logs').insert({
        card_id: id, user_id: uid, action: 'promoted_to_order',
        old_value: fromBoard, new_value: ref.ref_number,
      })

      return data as Card
    },
    onSuccess: (_d, vars) => {
      // Both boards change: the card leaves one and arrives on the other.
      qc.invalidateQueries({ queryKey: CARDS_QUERY(vars.fromBoard) })
      qc.invalidateQueries({ queryKey: CARDS_QUERY('orders') })
      qc.invalidateQueries({ queryKey: ['card', vars.id] })
      qc.invalidateQueries({ queryKey: ['activity', vars.id] })
    },
  })
}

// PI number and delivery date are DEQI's to supply, but DEQI is the `viewer`
// role and RLS blocks them from updating cards. This function is the narrow
// opening: those two columns, on an order, and nothing else.
export function useSetDeliveryInfo() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ cardId, piNumber, deliveryDate }: { cardId: string; piNumber: string; deliveryDate: string }) => {
      const { error } = await supabase.rpc('set_order_delivery_info', {
        p_card_id: cardId,
        p_pi_number: piNumber || null,
        p_delivery_date: deliveryDate || null,
      })
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: CARDS_QUERY('orders') })
      qc.invalidateQueries({ queryKey: ['card', vars.cardId] })
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
