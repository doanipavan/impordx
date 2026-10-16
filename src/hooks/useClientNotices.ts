import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Ver o aviso antes do cliente, e alcançar quem foi cadastrado tarde.
 *
 * As duas coisas são funções do banco (065) e não escritas diretas na fila:
 * `email_outbox` não tem política de escrita, de propósito. E, no caso da
 * prévia, o destinatário sai de `auth.uid()` lá dentro — não é parâmetro.
 * É o que impede isto de virar um jeito de mandar um email de cliente, com
 * nome, valor e prazo dentro, para qualquer endereço.
 */
export function usePreviewNotice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ cardId, kind }: { cardId: string; kind: string }) => {
      const { data, error } = await supabase.rpc('preview_queue', {
        p_card: cardId, p_kind: kind,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['outbox'] }),
  })
}

export function useClientCatchup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await supabase.rpc('client_catchup', { p_client: clientId })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbox'] })
      queryClient.invalidateQueries({ queryKey: ['sales', 'notices'] })
    },
  })
}

/**
 * Quantos pedidos deste cliente estão em andamento e ele nunca ouviu falar.
 *
 * É o que decide se vale oferecer o alcance. Um cliente cadastrado hoje cujo
 * pedido entrou em produção semana passada nunca recebeu nada — e, sem isto,
 * o primeiro email que ele receberia da Redantex poderia ser "sua mercadoria
 * chegou ao Brasil".
 */
export function useClientSilentOrders(clientId?: string | null) {
  return useQuery({
    queryKey: ['client', clientId, 'silent'],
    enabled: !!clientId,
    queryFn: async (): Promise<number> => {
      const { data: cards, error } = await supabase
        .from('cards')
        .select('id')
        .eq('client_id', clientId!)
        .eq('board', 'orders')
        .eq('archived', false)
        .in('status', ['Placed', 'In Production', 'Ready to Ship', 'Collected', 'Shipped'])
      if (error) throw error
      const ids = (cards ?? []).map((c) => (c as { id: string }).id)
      if (ids.length === 0) return 0

      // Prévia não conta: ela não foi para o cliente.
      const { data: avisados, error: erro2 } = await supabase
        .from('email_outbox')
        .select('card_id')
        .in('card_id', ids)
        .eq('preview', false)
      if (erro2) throw erro2

      const ouviram = new Set((avisados ?? []).map((o) => (o as { card_id: string }).card_id))
      return ids.filter((id) => !ouviram.has(id)).length
    },
  })
}
