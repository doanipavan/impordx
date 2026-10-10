import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * A carteira do vendedor, aberta por um link com token.
 *
 * Quem chama não tem conta: a função `sales_link_view` (062) é `security
 * definer` e `anon` pode executá-la. Ela confere o hash do token, registra a
 * abertura e devolve só os pedidos daquele vendedor.
 *
 * Token inválido, revogado ou ausente devolve `null` — e `null` aqui não é
 * erro de rede, é a resposta certa para um link que não vale mais.
 */
export interface LinkOrder {
  ref_number: string
  cliente: string
  status: string
  status_since?: string | null
  value_brl: number
  purchase_order?: string | null
  sample_approved_at?: string | null
  order_confirmed_at?: string | null
  delivery_date?: string | null
  delivery_date_promised?: string | null
  delivery_date_changed_at?: string | null
  arrived_at?: string | null
  /** Só para o cálculo do prazo; a página não o desenha. */
  fornecedor?: string | null
  cliente_tem_email: boolean
  itens: { size?: string | null; quantity: number }[]
}

export interface LinkView {
  vendedor: string
  pedidos: LinkOrder[]
}

export function useSalesLink(token?: string) {
  return useQuery({
    queryKey: ['sales-link', token],
    enabled: !!token,
    // Um token errado não melhora tentando de novo.
    retry: false,
    queryFn: async (): Promise<LinkView | null> => {
      const { data, error } = await supabase.rpc('sales_link_view', { p_token: token })
      if (error) throw error
      return (data as LinkView | null) ?? null
    },
  })
}
