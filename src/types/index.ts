export type BoardType = 'quotes' | 'samples' | 'orders'

export type QuoteStatus = 'Requested' | 'Quoted' | 'Confirmed' | 'Declined'
export type SampleStatus = 'Requested' | 'In Preparation' | 'Under RDX Revision'
  | 'Under DEQI Revision' | 'Approved' | 'Lost'
export type OrderStatus = 'Purchasing' | 'Commercial' | 'PI Requested'
  | 'PI In Preparation' | 'PI Approved' | 'Placed'
  | 'In Production' | 'Ready to Ship' | 'Shipped'
export type CardStatus = QuoteStatus | SampleStatus | OrderStatus

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface User {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'member' | 'viewer'
  avatar_url?: string
  created_at: string
}

export interface Card {
  id: string
  board: BoardType
  status: CardStatus
  title: string
  description?: string
  priority: Priority
  value_usd?: number
  deadline?: string
  // Two owners on the Redantex side: who sold it, and who is accountable for
  // it moving. Both are required when a card is created.
  salesperson_id?: string
  salesperson?: User
  salesperson_name?: string  // typed, when the salesperson has no account
  project_manager_id?: string
  project_manager?: User
  client_name?: string
  collection?: string
  size?: string
  quantity?: number
  outside_material?: string
  inside_material?: string
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
  sales_order?: string
  purchase_order?: string
  // Sale value in BRL. Hidden from DEQI in the UI only — see migration 021.
  value_brl?: number
  order_confirmed_at?: string  // day the order clock starts, 'YYYY-MM-DD'
  shipped_at?: string          // stamped by trigger when status becomes Shipped
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
  kind?: 'sample' | 'pi'
  review_status?: 'pending' | 'approved' | 'rejected'
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

// A salesperson is either a linked account or a typed name, never both.
export function salespersonLabel(card: Pick<Card, 'salesperson' | 'salesperson_name'>): string | null {
  return card.salesperson?.full_name ?? (card.salesperson_name?.trim() || null)
}

export const BOARD_COLUMNS: Record<BoardType, CardStatus[]> = {
  quotes: ['Requested', 'Quoted', 'Confirmed', 'Declined'],
  samples: ['Requested', 'In Preparation', 'Under RDX Revision', 'Under DEQI Revision', 'Approved', 'Lost'],
  orders: ['Purchasing', 'Commercial', 'PI Requested', 'PI In Preparation', 'PI Approved',
           'Placed', 'In Production', 'Ready to Ship', 'Shipped'],
}

// Purchasing and Commercial are Redantex's own intake — the supplier has no
// business seeing a card before it is a real order with a PI to raise.
export const REDANTEX_ONLY_STATUSES = ['Purchasing', 'Commercial']

export function visibleColumns(board: BoardType, isSupplier: boolean): CardStatus[] {
  const all = BOARD_COLUMNS[board]
  return isSupplier ? all.filter(s => !REDANTEX_ONLY_STATUSES.includes(s)) : all
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
  Shipped: DONE,
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
