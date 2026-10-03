import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Destination, DestinationSummary, destinationSummary } from '../lib/itemDestination'

/**
 * Para onde vão os itens de cada card do quadro, numa consulta só.
 *
 * O card do quadro não carrega os seus itens — trinta e quatro pedidos abertos
 * seriam trinta e quatro consultas para desenhar uma etiqueta. Esta busca os
 * destinos de todos os cards de uma vez e devolve o resumo pronto por card,
 * calculado pela mesma função que a tabela e o painel usam.
 *
 * Só a Redantex chama: para onde a peça vai não muda nada na fábrica, e a
 * etiqueta não aparece na visão do fornecedor.
 */
export function useBoardDestinations(cardIds: string[], enabled: boolean) {
  const key = [...cardIds].sort().join(',')
  return useQuery({
    queryKey: ['item_destinations', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_items')
        .select('card_id, destination')
        .in('card_id', cardIds)
      if (error) throw error

      const byCard = new Map<string, Array<{ destination?: Destination | null }>>()
      for (const row of (data ?? []) as Array<{ card_id: string; destination: Destination | null }>) {
        const list = byCard.get(row.card_id) ?? []
        list.push({ destination: row.destination })
        byCard.set(row.card_id, list)
      }

      const summaries = new Map<string, DestinationSummary>()
      for (const [cardId, items] of byCard) summaries.set(cardId, destinationSummary(items))
      return summaries
    },
    enabled: enabled && cardIds.length > 0,
    staleTime: 30 * 1000,
  })
}
