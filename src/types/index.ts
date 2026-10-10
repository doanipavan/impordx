export type BoardType = 'quotes' | 'samples' | 'orders'

export type QuoteStatus = 'Requested' | 'Quoted' | 'Confirmed' | 'Declined'
export type SampleStatus = 'Requested' | 'In Preparation' | 'Under RDX Revision'
  | 'Under DEQI Revision' | 'Approved' | 'Lost'
export type OrderStatus = 'Purchasing' | 'Commercial' | 'PI Requested'
  | 'PI In Preparation' | 'PI Approved' | 'Placed'
  | 'In Production' | 'Ready to Ship' | 'Collected' | 'Shipped' | 'Arrived'
export type CardStatus = QuoteStatus | SampleStatus | OrderStatus

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface User {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'member' | 'viewer'
  // May send a card from Orders back to Samples. Not tied to role on purpose —
  // the people who have it do not map onto admin/member (migration 029).
  can_return_orders?: boolean
  // Qual fornecedor esta pessoa representa. Preenchido só para `viewer`
  // (migração 031); é o que diz o nome no crachá de um comentário.
  supplier_id?: string
  avatar_url?: string
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  short_name: string
  active?: boolean
}

export interface Card {
  id: string
  board: BoardType
  status: CardStatus
  title: string
  // Who is making this piece. Set by the database (migration 032 defaults it to
  // DEQI) until the create form offers a picker. It is what the delivery clock
  // and the collection list are read from — and, in the database, what decides
  // whether a supplier can see this row at all.
  supplier_id?: string
  supplier?: Supplier
  description?: string
  priority: Priority
  value_usd?: number
  deadline?: string
  // Two owners on the Redantex side: who sold it, and who is accountable for
  // it moving. Both are required when a card is created.
  // A real column since long before this interface mentioned it — the boards
  // and the archive page have always filtered on it in SQL.
  archived?: boolean
  // Points at `salespeople`, the register of the twenty-five people who sell.
  // The two fields below it are the ladder behind: a hub login, or a name
  // somebody typed before the register existed. Migration 056.
  salesperson_ref_id?: string
  sold_by?: Salesperson
  salesperson_id?: string
  salesperson?: User
  salesperson_name?: string  // typed, when the salesperson has no account
  project_manager_id?: string
  project_manager?: User
  client_name?: string
  // Aponta para `clients`, onde mora o email. O nome continua aqui porque é
  // o que a tela e os relatórios sempre leram. Migração 051.
  client_id?: string
  collection?: string
  size?: string
  quantity?: number
  outside_material?: string
  inside_material?: string
  // Colunas de verdade desde a migração 041. Antes eram linhas rotuladas dentro
  // de `description`, empacotadas e desempacotadas por um par de funções — e o
  // Editar card descartava em silêncio o que se digitava nelas.
  outside_material_code?: string | null
  inside_material_code?: string | null
  logo_color?: string
  logo_technique?: string
  logo_positions?: string[]
  reference_code?: string
  supplier_ref?: string
  ref_number?: string
  ref_root?: string        // shared across the quote/sample/order family
  source_card_id?: string  // the card this one was generated from
  // Order fulfilment. pi_number and delivery_date come from DEQI; the two
  // Redantex order numbers are ours. delivery_date is a plain 'YYYY-MM-DD'.
  pi_number?: string
  delivery_date?: string
  // The first date DEQI ever gave, frozen on arrival. The gap between this and
  // delivery_date is the slip, and it is why both are kept (migration 030).
  delivery_date_promised?: string
  delivery_date_changed_at?: string
  delivery_date_change_reason?: string
  sales_order?: string
  purchase_order?: string
  // Sale value in BRL. Hidden from DEQI in the UI only — see migration 021.
  value_brl?: number
  // The day the sample was approved. Anchors the delivery promise through the
  // monthly cut-off on the 10th; survives promotion to Orders (migration 026).
  sample_approved_at?: string
  order_confirmed_at?: string  // fallback anchor when there was no sample
  shipped_at?: string          // stamped by trigger when status becomes Shipped
  // O dia em que chegou ao Brasil, carimbado ao entrar em Arrived (migração
  // 042). É o que fecha a meta de logística: arrived_at − delivery_date ≤ 50.
  arrived_at?: string | null
  // Quem assinou a arte pelo cliente, e quando (migração 046).
  client_approved_at?: string | null
  client_approved_by?: string | null
  status_since?: string        // stamped by trigger on every status change
  logo_technique_outside?: string
  logo_technique_inside?: string
  logo_text_outside?: string
  logo_text_inside?: string
  logo_color_outside?: string
  logo_color_inside?: string
  tags?: string[]
  created_by: string
  created_at: string
  updated_at: string
  comments_count?: number
  attachments_count?: number
  watchers?: string[]
}

export interface Comment {
  id: string
  card_id: string
  user_id: string
  user?: User
  parent_id?: string
  body: string
  edited: boolean
  created_at: string
  updated_at: string
}

export interface Attachment {
  id: string
  card_id: string
  user_id: string
  user?: User
  comment_id?: string
  filename: string
  file_url: string
  file_type: string
  file_size: number
  thumbnail_url?: string
  approved_at?: string
  approved_by?: string
  approved_by_user?: { full_name: string }
  approval_note?: string
  // One review mechanic for two kinds of document: a digital sample, and the
  // proforma invoice. Redantex judges; a rejection carries its reason.
  // Every upload since 21 Sep 2026 carries one of four (migration 045); older
  // files may have none. Only sample and pi get a review_status.
  kind?: 'reference' | 'sample' | 'pi' | 'quotation' | null
  review_status?: 'pending' | 'approved' | 'rejected' | null
  reviewed_at?: string
  reviewed_by?: string
  reviewer?: { full_name: string }
  review_note?: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  card_id?: string
  card?: Pick<Card, 'id' | 'title' | 'board' | 'ref_number'>
  actor_id?: string
  actor?: User
  type: 'comment' | 'status_change' | 'assignment' | 'mention' | 'due_soon'
  message: string
  read: boolean
  created_at: string
}

export interface ActivityLog {
  id: string
  card_id: string
  user_id: string
  user?: User
  action: string
  old_value?: string
  new_value?: string
  created_at: string
}

// Somebody who sells for Redantex. `user_id` is set only for the few who also
// have a hub login; the rest exist here and nowhere else. Migration 056.
export interface Salesperson {
  id: string
  name: string
  email?: string | null
  user_id?: string | null
  active: boolean
}

/**
 * One name for the salesperson, from the first source that has one.
 *
 * The register comes first: `JULIA`, `Júlia` and `Julia` were the same person
 * in three rows of every report until it existed, and anything that groups by
 * this string — the sales panel, the timeline filter, the spreadsheet — would
 * keep splitting her in three if it read the typed name first.
 */
export function salespersonLabel(
  card: Pick<Card, 'sold_by' | 'salesperson' | 'salesperson_name'>,
): string | null {
  return card.sold_by?.name
    ?? card.salesperson?.full_name
    ?? (card.salesperson_name?.trim() || null)
}

export const BOARD_COLUMNS: Record<BoardType, CardStatus[]> = {
  quotes: ['Requested', 'Quoted', 'Confirmed', 'Declined'],
  samples: ['Requested', 'In Preparation', 'Under RDX Revision', 'Under DEQI Revision', 'Approved', 'Lost'],
  orders: ['Purchasing', 'Commercial', 'PI Requested', 'PI In Preparation', 'PI Approved',
           'Placed', 'In Production', 'Ready to Ship', 'Collected', 'Shipped', 'Arrived'],
}

// Purchasing and Commercial are Redantex's own intake — the supplier has no
// business seeing a card before it is a real order with a PI to raise. Arrived
// is the other end: the supplier's leg ends at Shipped, and the day the goods
// land would reveal the transit time the shipping leg deliberately withholds.
export const REDANTEX_ONLY_STATUSES = ['Purchasing', 'Commercial', 'Arrived']

// From Placed onward the supplier's price is settled: the proforma is approved
// and the number stops moving. Before it, everything is still a proposal. The
// two halves are counted separately because they answer different questions —
// one is money committed, the other is money at stake.
export const PLACED_ONWARD: CardStatus[] = ['Placed', 'In Production', 'Ready to Ship',
  'Collected', 'Shipped', 'Arrived']

export function isPlacedOnward(status: CardStatus): boolean {
  return PLACED_ONWARD.includes(status)
}

// Once the goods are ready, the clock that matters is Redantex's: the factory
// has done its part and what remains is collection, shipping and customs.
// `Collected` belongs here by definition — the carrier has the cargo. The Gantt
// and the card panel both ask this question, and each keeping its own list of
// statuses is how a stage gets forgotten in one of them.
const RDX_LEG: CardStatus[] = ['Ready to Ship', 'Collected', 'Shipped', 'Arrived']

// Aceita `string` de propósito: `orderClock` recebe o card numa forma solta,
// com `status?: string`, e um valor que não seja etapa simplesmente não está
// na lista. Melhor isso que um cast que esconderia uma incompatibilidade real.
export function isRdxLeg(status: string): boolean {
  return (RDX_LEG as string[]).includes(status)
}

export function visibleColumns(board: BoardType, isSupplier: boolean): CardStatus[] {
  const all = BOARD_COLUMNS[board]
  return isSupplier ? all.filter(s => !REDANTEX_ONLY_STATUSES.includes(s)) : all
}

/**
 * What a status is called on screen.
 *
 * 'Under DEQI Revision' was named when DEQI was the only supplier there was.
 * Sconcept sees that column too, and it would be reading the other supplier's
 * name off its own board — the one fact the isolation exists to withhold. So
 * the stored value stays (it is in a CHECK constraint and on 32 rows) and only
 * the label moves: each supplier sees its own name, Redantex sees whichever
 * supplier the card belongs to.
 */
// O segundo parâmetro fica por compatibilidade com quem chama e é ignorado:
// desde 14 Sep o hub se refere ao fornecedor genericamente, por decisão. O
// banco faz o mesmo em status_label() (migração 044).
export function statusLabel(status: CardStatus, _supplierShortName?: string | null): string {
  if (status === 'Under DEQI Revision') return 'Under Supplier Revision'
  return status
}

export const BOARD_LABELS: Record<BoardType, string> = {
  quotes: 'Quotes',
  samples: 'Samples',
  orders: 'Orders',
}

// Every status across every board resolves to one of three meanings, so the
// same colour always says the same thing: WAITING is on someone else / not
// started, ACTIVE is in progress on our side, DONE is settled. The column a
// card sits in already says which stage it is — colour only says how it's going.
const WAITING = 'bg-slate-100 text-slate-700'
const ACTIVE = 'bg-amber-50 text-amber-700'
const DONE = 'bg-green-50 text-green-700'

export const STATUS_COLORS: Record<CardStatus, string> = {
  // Quotes
  Requested: WAITING,
  Quoted: ACTIVE,
  Confirmed: DONE,
  Declined: WAITING,
  // Samples
  'In Preparation': ACTIVE,
  'Under RDX Revision': ACTIVE,
  'Under DEQI Revision': ACTIVE,
  Approved: DONE,
  // Closed and out of the pipeline, like a declined quote — not a warning.
  Lost: WAITING,
  // Orders — intake
  Purchasing: ACTIVE,
  Commercial: ACTIVE,
  'PI Requested': WAITING,
  'PI In Preparation': ACTIVE,
  'PI Approved': ACTIVE,
  // Orders — production
  Placed: WAITING,
  'In Production': ACTIVE,
  'Ready to Ship': ACTIVE,
  // Coletado ainda é trabalho em curso: a carga saiu da fábrica mas não
  // embarcou, e está na mão do transportador.
  Collected: ACTIVE,
  // Embarcado é "feito" para o fornecedor; chegado é "feito" para a Redantex.
  // Os dois são verdes: no vocabulário de cor do hub, verde é concluído.
  Shipped: DONE,
  Arrived: DONE,
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'text-slate-400',
  medium: 'text-amber-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}
