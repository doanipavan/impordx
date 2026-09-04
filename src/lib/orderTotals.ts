import { salePrice } from './utils'
import { Card, isPlacedOnward } from '../types'

// Aqui não entra nada que fale com o Supabase: são números de dinheiro, e
// eles precisam poder ser conferidos por um teste que roda no terminal.

export interface OrderTotal {
  orders: number
  pieces: number
  /** What the supplier charged, in USD. */
  purchaseUsd: number
  /** What the client pays, in BRL. */
  saleBrl: number
}

export interface OrderTotals {
  /** Proforma approved — the supplier's price has stopped moving. */
  placed: OrderTotal
  /** Still a proposal. */
  pending: OrderTotal
  total: OrderTotal
}

const EMPTY: OrderTotal = { orders: 0, pieces: 0, purchaseUsd: 0, saleBrl: 0 }

export interface OrderItemRow {
  card_id: string
  quantity: number | null
  unit_price_usd: number | null
  pricing: unknown
}

/**
 * Totals for the orders board, split at Placed and summed.
 *
 * The supplier filter is applied here rather than by the caller so the figures
 * and the board can never disagree about what is being counted.
 */
export function orderTotals(
  cards: Card[],
  rows: OrderItemRow[],
  filter: string
): OrderTotals {
  // Mesma regra do filtro no topo do board, escrita aqui para a conta não
  // depender de um módulo que importa o cliente do Supabase.
  const inScope = cards.filter(c => filter === 'all' || c.supplier_id === filter)
  const byId = new Map(inScope.map(c => [c.id, c]))

  const placed: OrderTotal = { ...EMPTY }
  const pending: OrderTotal = { ...EMPTY }

  // Orders are counted from the cards, not from the rows: a card with no line
  // items yet is still an order, and counting it through its items would make
  // it vanish from the tally while sitting on the board in plain sight.
  for (const card of inScope) {
    const bucket = isPlacedOnward(card.status) ? placed : pending
    bucket.orders += 1
  }

  for (const row of rows) {
    const card = byId.get(row.card_id)
    if (!card) continue
    const bucket = isPlacedOnward(card.status) ? placed : pending
    const qty = Number(row.quantity ?? 0)
    const unit = Number(row.unit_price_usd ?? 0)
    const sale = salePrice(row.pricing) ?? 0
    bucket.pieces += qty
    bucket.purchaseUsd += qty * unit
    bucket.saleBrl += qty * sale
  }

  return {
    placed,
    pending,
    total: {
      orders: placed.orders + pending.orders,
      pieces: placed.pieces + pending.pieces,
      purchaseUsd: placed.purchaseUsd + pending.purchaseUsd,
      saleBrl: placed.saleBrl + pending.saleBrl,
    },
  }
}
