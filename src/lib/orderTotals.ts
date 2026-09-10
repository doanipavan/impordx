import { salePrice, clockFor, deliveryAnchor } from './utils'
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

// ---------------------------------------------------------------------------
// Quando o dinheiro vira mercadoria no Brasil
// ---------------------------------------------------------------------------

export interface ArrivalMonth {
  /** 'YYYY-MM', chave estável para ordenar e casar. */
  key: string
  /** 'Dec 2026' — interface em inglês, mês em inglês. */
  label: string
  total: OrderTotal
}

export interface Arrivals {
  /** Até `horizon` meses a partir do primeiro com chegada, sem pular os vazios. */
  months: ArrivalMonth[]
  /** Tudo depois do horizonte, somado. Null quando não há nada depois. */
  later: OrderTotal | null
  /** Pedidos sem relógio — sem amostra aprovada nem proforma — que ficaram fora. */
  withoutClock: number
  total: OrderTotal
}

const DAY = 86_400_000

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1))
    .toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function nextMonth(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return d.toISOString().slice(0, 7)
}

/**
 * O valor que chega ao Brasil, mês a mês.
 *
 * O mês é o do dia 120 da mesma régua que o Gantt desenha — aprovação da
 * amostra para a DEQI, proforma para a Sconcept, via `deliveryAnchor` e
 * `clockFor`. Não é uma segunda regra: é a mesma, lida no mesmo lugar. Um
 * painel que dissesse "dezembro" enquanto a barra do Gantt terminasse em
 * janeiro seria pior do que nenhum painel.
 *
 * Meses vazios entre o primeiro e o último aparecem, com zero. Num fluxo de
 * caixa, um mês sem chegada é informação — escondê-lo faria dois meses
 * distantes parecerem consecutivos.
 */
export function arrivalsByMonth(
  cards: Card[],
  rows: OrderItemRow[],
  filter: string,
  horizon = 6
): Arrivals {
  const inScope = cards.filter(c => filter === 'all' || c.supplier_id === filter)

  // Primeiro cada card recebe o seu mês. Sem âncora não há mês — e o card é
  // contado à parte em vez de sumir, para o total do painel não discordar em
  // silêncio do número de cards no board.
  const monthOf = new Map<string, string>()
  let withoutClock = 0
  for (const card of inScope) {
    const clock = clockFor(card)
    const anchor = deliveryAnchor(card, clock)
    if (!anchor) { withoutClock += 1; continue }
    const [y, m, d] = anchor.date.slice(0, 10).split('-').map(Number)
    if (!y || !m || !d) { withoutClock += 1; continue }
    const arrival = new Date(Date.UTC(y, m - 1, d) + (clock.productionDays + clock.shippingDays) * DAY)
    monthOf.set(card.id, arrival.toISOString().slice(0, 7))
  }

  const byMonth = new Map<string, OrderTotal>()
  const bucket = (key: string) => {
    let t = byMonth.get(key)
    if (!t) { t = empty(); byMonth.set(key, t) }
    return t
  }

  for (const card of inScope) {
    const key = monthOf.get(card.id)
    if (key) bucket(key).orders += 1
  }

  for (const row of rows) {
    const key = monthOf.get(row.card_id)
    if (!key) continue
    const t = bucket(key)
    const qty = Number(row.quantity ?? 0)
    const unit = row.unit_price_usd == null ? null : Number(row.unit_price_usd)
    const sale = salePrice(row.pricing) ?? null
    t.items += 1
    t.pieces += qty
    if (unit != null && unit > 0) { t.itemsWithPurchase += 1; t.purchaseUsd += qty * unit }
    if (sale != null && sale > 0) { t.itemsWithSale += 1; t.saleBrl += qty * sale }
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

  const keys = [...byMonth.keys()].sort()
  if (keys.length === 0) {
    return { months: [], later: null, withoutClock, total: empty() }
  }

  // Do primeiro ao último, contíguo, até o horizonte. O que sobra vai para
  // "later" — somado, não escondido.
  const months: ArrivalMonth[] = []
  let key = keys[0]
  const last = keys[keys.length - 1]
  while (key <= last && months.length < horizon) {
    months.push({ key, label: monthLabel(key), total: byMonth.get(key) ?? empty() })
    key = nextMonth(key)
  }

  let later: OrderTotal | null = null
  for (const k of keys) {
    if (k >= key) later = add(later ?? empty(), byMonth.get(k)!)
  }

  let total = empty()
  for (const k of keys) total = add(total, byMonth.get(k)!)

  return { months, later, withoutClock, total }
}
