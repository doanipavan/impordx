import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface CardItem {
  id: string
  card_id: string
  reference_code?: string
  collection?: string
  description?: string
  outside_color?: string
  inside_color?: string
  size?: string
  quantity: number
  unit_price_usd?: number
  notes?: string
  sort_order: number
  created_at: string
}

export function useCardItems(cardId: string) {
  return useQuery({
    queryKey: ['card_items', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_items')
        .select('*')
        .eq('card_id', cardId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data as CardItem[]
    },
    enabled: !!cardId,
  })
}

export function useAddCardItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: Omit<CardItem, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('card_items').insert(item).select().single()
      if (error) throw error
      return data as CardItem
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['card_items', vars.card_id] }),
  })
}

export function useUpdateCardItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, cardId, ...updates }: Partial<CardItem> & { id: string; cardId: string }) => {
      const { error } = await supabase.from('card_items').update(updates).eq('id', id)
      if (error) throw error
      return cardId
    },
    onSuccess: (cardId) => qc.invalidateQueries({ queryKey: ['card_items', cardId] }),
  })
}

export function useDeleteCardItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, cardId }: { id: string; cardId: string }) => {
      const { error } = await supabase.from('card_items').delete().eq('id', id)
      if (error) throw error
      return cardId
    },
    onSuccess: (cardId) => qc.invalidateQueries({ queryKey: ['card_items', cardId] }),
  })
}
