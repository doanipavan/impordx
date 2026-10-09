import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Card } from '../types'

/**
 * Os dados do painel de vendas.
 *
 * Consulta própria, não `useCards`, por dois motivos. O primeiro é que o
 * painel precisa dos itens e do email do cliente, que o quadro não carrega. O
 * segundo é o que importa: `clients` é tabela só da Redantex, e embutir uma
 * tabela dessas na consulta do quadro faria o fornecedor pedir algo que a
 * política dele recusa. Este painel não abre para `viewer`, então aqui é
 * seguro.
 */
export interface SalesCard extends Card {
  client?: { name: string; email?: string | null } | null
  card_items?: { size?: string | null; quantity: number; sort_order?: number }[]
}

const FIELDS = `
  id, board, status, title, archived, collection, priority, created_at,
  client_id, client_name, value_brl, purchase_order, pi_number,
  salesperson_ref_id, salesperson_name, salesperson_id,
  sample_approved_at, order_confirmed_at, status_since,
  delivery_date, delivery_date_promised, delivery_date_changed_at,
  delivery_date_change_reason, shipped_at, arrived_at,
  supplier:suppliers(id, name, short_name),
  client:clients(name, email),
  card_items(size, quantity, sort_order)
`

export function useSalesOrders() {
  return useQuery({
    queryKey: ['sales', 'orders'],
    queryFn: async (): Promise<SalesCard[]> => {
      const { data, error } = await supabase
        .from('cards')
        .select(FIELDS)
        .eq('board', 'orders')
        .eq('archived', false)
        .neq('status', 'Lost')
      if (error) throw error
      return (data ?? []) as unknown as SalesCard[]
    },
  })
}

export interface Notice {
  id: string
  kind: string
  subject?: string | null
  /** O que o aviso informou, gravado no envio. Migração 057. */
  summary?: string | null
  sent_at: string
}

/**
 * Os avisos que já saíram para o cliente deste pedido.
 *
 * `summary` é lido, nunca recalculado: a previsão de hoje em cima de uma
 * mensagem de outubro diria ao vendedor que o cliente soube de algo que
 * ninguém lhe disse.
 */
export function useCardNotices(cardId?: string | null) {
  return useQuery({
    queryKey: ['sales', 'notices', cardId],
    enabled: !!cardId,
    queryFn: async (): Promise<Notice[]> => {
      const { data, error } = await supabase
        .from('email_outbox')
        .select('id, kind, subject, summary, sent_at')
        .eq('card_id', cardId!)
        .eq('status', 'sent')
        .order('sent_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Notice[]
    },
  })
}
