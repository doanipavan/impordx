import { salePrice } from './utils'
import { BoardType, Card, CardStatus, isPlacedOnward } from '../types'

// Aqui não entra nada que fale com o Supabase: são números de dinheiro, e
// eles precisam poder ser conferidos por um teste que roda no terminal.

export interface OrderTotal {
  orders: number
  pieces: number
  /** What the supplier charged, in USD. */
  purchaseUsd: number
  /** What the client pays, in BRL. */
  saleBrl: number
  /**
   * How many line items carry each price, out of how many exist.
   *
   * A sum is only as true as its coverage. On Orders every item is priced on
   * both sides, so this says 57/57 and can be ignored. On Samples the supplier
   * has usually not quoted yet: 31 of 33 items have no purchase price, and
   * without this the column would read "US$ 935" as though that were the cost
   * of the board rather than the cost of two lines out of thirty-three.
   */
  items: number
  itemsWithPurchase: number
  itemsWithSale: number
}

export interface BoardTotals {
  /** Won: the price is settled and it is going ahead. */
  won: OrderTotal
  /** Still moving, still able to change. */
  open: OrderTotal
  /** Dead. Deliberately outside `total`. */
  lost: OrderTotal
  /** won + open. Never includes lost — money that fell through is not at stake. */
  total: OrderTotal
}

function empty(): OrderTotal {
  return {
    orders: 0, pieces: 0, purchaseUsd: 0, saleBrl: 0,
    items: 0, itemsWithPurchase: 0, itemsWithSale: 0,
  }
}

export interface OrderItemRow {
  card_id: string
  quantity: number | null
  unit_price_usd: number | null
  pricing: unknown
}

export type Bucket = 'won' | 'open' | 'lost'

/**
 * Which of the three a card belongs to, per board.
 *
 * Orders settle at Placed — the proforma is approved and the supplier's price
 * stops moving. Samples settle at Approved and quotes at Confirmed, which is
 * the same event one board earlier. Lost and Declined are the same thing under
 * two names, and neither is money at stake.
 */
export function bucketFor(board: BoardType, status: CardStatus): Bucket {
  if (board === 'orders') return isPlacedOnward(status) ? 'won' : 'open'
  if (status === 'Lost' || status === 'Declined') return 'lost'
  if (status === 'Approved' || status === 'Confirmed') return 'won'
  return 'open'
}

/**
 * Totals for a board, split three ways and summed.
 *
 * The supplier filter is applied here rather than by the caller so the figures
 * and the board can never disagree about what is being counted.
 */
export function boardTotals(
  board: BoardType,
  cards: Card[],
  rows: OrderItemRow[],
  filter: string
): BoardTotals {
  // Mesma regra do filtro no topo do board, escrita aqui para a conta não
  // depender de um módulo que importa o cliente do Supabase.
  const inScope = cards.filter(c => filter === 'all' || c.supplier_id === filter)
  const byId = new Map(inScope.map(c => [c.id, c]))

  const buckets: Record<Bucket, OrderTotal> = { won: empty(), open: empty(), lost: empty() }

  // Counted from the cards, not from the rows: a card with no line items yet is
  // still a card, and counting it through its items would make it vanish from
  // the tally while sitting on the board in plain sight.
  for (const card of inScope) {
    buckets[bucketFor(board, card.status)].orders += 1
  }

  for (const row of rows) {
    const card = byId.get(row.card_id)
    if (!card) continue
    const b = buckets[bucketFor(board, card.status)]
    const qty = Number(row.quantity ?? 0)
    const unit = row.unit_price_usd == null ? null : Number(row.unit_price_usd)
    const sale = salePrice(row.pricing) ?? null

    b.items += 1
    b.pieces += qty
    if (unit != null && unit > 0) { b.itemsWithPurchase += 1; b.purchaseUsd += qty * unit }
    if (sale != null && sale > 0) { b.itemsWithSale += 1; b.saleBrl += qty * sale }
  }

  const add = (a: OrderTotal, c: OrderTotal): OrderTotal => ({
    orders: a.orders + c.orders,
    pieces: a.pieces + c.pieces,
    purchaseUsd: a.purchaseUsd + c.purchaseUsd,
    saleBrl: a.saleBrl + c.saleBrl,
    items: a.items + c.items,
    itemsWithPurchase: a.itemsWithPurchase + c.itemsWithPurchase,
    itemsWithSale: a.itemsWithSale + c.itemsWithSale,
  })

  return { ...buckets, total: add(buckets.won, buckets.open) }
}
