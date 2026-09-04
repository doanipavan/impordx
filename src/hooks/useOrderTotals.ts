import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { OrderItemRow } from '../lib/orderTotals'

/**
 * The line items behind a set of order cards, with their sale price.
 *
 * Fetched separately from the cards rather than embedded in the board query:
 * every board would pay for it, and only Orders shows the totals.
 *
 * `card_item_pricing` carries its own policy (migration 025) and answers only
 * Redantex. A supplier running this query would get every row with a null sale
 * price — which is why the component that uses it is not rendered for them at
 * all, rather than rendered with zeroes that would read as "we sell at cost".
 */
export function useOrderItemRows(cardIds: string[], enabled: boolean) {
  const key = [...cardIds].sort().join(',')
  return useQuery({
    queryKey: ['order_item_rows', key],
    queryFn: async () => {
      if (cardIds.length === 0) return [] as OrderItemRow[]
      const { data, error } = await supabase
        .from('card_items')
        .select('card_id, quantity, unit_price_usd, pricing:card_item_pricing(sale_price_brl)')
        .in('card_id', cardIds)
      if (error) throw error
      return (data ?? []) as unknown as OrderItemRow[]
    },
    enabled: enabled && cardIds.length > 0,
    staleTime: 30 * 1000,
  })
}

