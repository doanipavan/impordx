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
  // What the Brazilian client pays per piece. It lives in card_item_pricing,
  // not here, because card_items is readable by every authenticated account —
  // DEQI included. Flattened onto the item for convenience; a supplier's query
  // simply returns nothing to flatten.
  sale_price_brl?: number
  erp_code?: string        // the item's code in DEV, Redantex's ERP
  file_url?: string
  file_name?: string
  notes?: string
  sort_order: number
  created_at: string
}

// PostgREST returns a one-to-one embed as an object, but the same query can
// come back as a single-element array depending on how it reads the keys, and
// guessing wrong would drop every price without a word.
function salePrice(pricing: unknown): number | undefined {
  const row = Array.isArray(pricing) ? pricing[0] : pricing
  const value = (row as { sale_price_brl?: number } | null | undefined)?.sale_price_brl
  return value == null ? undefined : Number(value)
}

export function useCardItems(cardId: string) {
  return useQuery({
    queryKey: ['card_items', cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_items')
        .select('*, pricing:card_item_pricing(sale_price_brl)')
        .eq('card_id', cardId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []).map(({ pricing, ...item }: Record<string, any>) => ({
        ...item,
        sale_price_brl: salePrice(pricing),
      })) as CardItem[]
    },
    enabled: !!cardId,
  })
}

export function useAddCardItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sale_price_brl, ...item }: Omit<CardItem, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('card_items').insert(item).select().single()
      if (error) throw error
      const created = data as CardItem
      // The price is a second write by design: it is the one field a supplier
      // must never read, so it lives behind its own policy.
      if (sale_price_brl != null) {
        const { error: priceError } = await supabase
          .from('card_item_pricing')
          .upsert({ item_id: created.id, sale_price_brl })
        if (priceError) throw priceError
      }
      return created
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['card_items', vars.card_id] }),
  })
}

export function useUpdateCardItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, cardId, sale_price_brl, ...updates }:
      Partial<CardItem> & { id: string; cardId: string }) => {
      const { error } = await supabase.from('card_items').update(updates).eq('id', id)
      if (error) throw error
      if (sale_price_brl !== undefined) {
        const { error: priceError } = await supabase
          .from('card_item_pricing')
          .upsert({ item_id: id, sale_price_brl, updated_at: new Date().toISOString() })
        if (priceError) throw priceError
      }
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
