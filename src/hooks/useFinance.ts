import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type Tranche = 'deposit' | 'balance'
export type Channel = 'bank' | 'other'

export interface Payment {
  id: string
  card_id: string
  tranche: Tranche
  share: number
  due_date?: string | null
  amount_usd?: number | null
  paid_at?: string | null
  amount_brl?: number | null
  fx_rate?: number | null
  channel?: Channel | null
  note?: string | null
}

/** One order, what it is worth, and which proforma groups it. */
export interface FinanceCard {
  id: string
  ref_number?: string
  title: string
  client_name?: string
  status: string
  pi_number?: string
  delivery_date?: string
  valueUsd: number
}

const KEY = ['finance']

export function useFinance() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const [cards, items, pays] = await Promise.all([
        supabase.from('cards')
          .select('id, ref_number, title, client_name, status, pi_number, delivery_date')
          .eq('board', 'orders').eq('archived', false),
        supabase.from('card_items').select('card_id, quantity, unit_price_usd'),
        supabase.from('card_payments').select('*'),
      ])
      for (const r of [cards, items, pays]) if (r.error) throw r.error

      // O valor de compra do card é a soma dos itens dele. Não há rateio a
      // inventar — a proforma é só a soma dos cards que a carregam.
      const usdByCard = new Map<string, number>()
      for (const it of (items.data ?? []) as Array<{ card_id: string; quantity: number | null; unit_price_usd: number | null }>) {
        usdByCard.set(it.card_id,
          (usdByCard.get(it.card_id) ?? 0) + Number(it.quantity ?? 0) * Number(it.unit_price_usd ?? 0))
      }

      return {
        cards: ((cards.data ?? []) as FinanceCard[]).map(c => ({ ...c, valueUsd: usdByCard.get(c.id) ?? 0 })),
        payments: (pays.data ?? []) as Payment[],
      }
    },
    staleTime: 30_000,
  })
}

export function useCloseCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.rpc('close_card_payment', { p_card_id: cardId })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }) },
  })
}

/**
 * Desfaz o fecho. A regra de quando é permitido está no banco: com pagamento
 * registrado ele recusa, porque apagar as linhas destruiria o registro de
 * dinheiro que saiu de verdade.
 */
export function useReopenCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cardId: string) => {
      const { error } = await supabase.rpc('reopen_card_payment', { p_card_id: cardId })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }) },
  })
}

export interface RecordPaymentInput {
  id: string
  paid_at: string | null
  amount_brl: number | null
  fx_rate: number | null
  channel: Channel | null
  note: string | null
}

export function useRecordPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...fields }: RecordPaymentInput) => {
      const { error } = await supabase
        .from('card_payments')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }) },
  })
}
