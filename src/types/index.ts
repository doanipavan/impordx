export type BoardType = 'quotes' | 'samples' | 'orders'

export type QuoteStatus = 'Requested' | 'Quoted' | 'Confirmed' | 'Declined'
export type SampleStatus = 'Requested' | 'In Preparation' | 'Under Revision' | 'Approved'
export type OrderStatus = 'Placed' | 'In Production' | 'Ready to Ship' | 'Shipped'
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
  responsible_id?: string
  responsible?: User
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
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  card_id?: string
  card?: Pick<Card, 'id' | 'title' | 'board'>
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

export const BOARD_COLUMNS: Record<BoardType, CardStatus[]> = {
  quotes: ['Requested', 'Quoted', 'Confirmed', 'Declined'],
  samples: ['Requested', 'In Preparation', 'Under Revision', 'Approved'],
  orders: ['Placed', 'In Production', 'Ready to Ship', 'Shipped'],
}

export const BOARD_LABELS: Record<BoardType, string> = {
  quotes: 'Quotes',
  samples: 'Samples',
  orders: 'Orders',
}

export const STATUS_COLORS: Record<CardStatus, string> = {
  Requested: 'bg-slate-100 text-slate-700',
  Quoted: 'bg-blue-50 text-blue-700',
  Confirmed: 'bg-green-50 text-green-700',
  Declined: 'bg-red-50 text-red-700',
  'In Preparation': 'bg-purple-50 text-purple-700',
  'Under Revision': 'bg-amber-50 text-amber-700',
  Approved: 'bg-green-50 text-green-700',
  Placed: 'bg-slate-100 text-slate-700',
  'In Production': 'bg-blue-50 text-blue-700',
  'Ready to Ship': 'bg-teal-50 text-teal-700',
  Shipped: 'bg-green-50 text-green-700',
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
