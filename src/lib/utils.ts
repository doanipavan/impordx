import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isAfter, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  try {
    return format(parseISO(date), 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

// Timestamps are pinned to São Paulo rather than the viewer's clock: Redantex
// and the supplier are ten-plus hours apart, and the same event rendering as
// two different times is how people end up arguing about when something landed.
const SAO_PAULO = 'America/Sao_Paulo'

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—'
  try {
    const at = parseISO(date)
    const day = new Intl.DateTimeFormat('en-US', {
      timeZone: SAO_PAULO, month: 'short', day: 'numeric', year: 'numeric',
    }).format(at)
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: SAO_PAULO, hour: 'numeric', minute: '2-digit',
    }).format(at)
    return `${day} • ${time} BRT`
  } catch {
    return '—'
  }
}

export function formatRelative(date: string | null | undefined): string {
  if (!date) return '—'
  try {
    return formatDistanceToNow(parseISO(date), { addSuffix: true })
  } catch {
    return '—'
  }
}

// An order runs on two consecutive 60-day legs from the day it is confirmed:
// DEQI has 60 days to have it ready, then Redantex has 60 to land it in Brazil.
export const ORDER_LEG_DAYS = 60

const MS_PER_DAY = 86_400_000

// 'YYYY-MM-DD' -> a UTC midnight instant. Day counts are done on plain calendar
// days so the number never changes with the reader's clock.
function calendarDay(ymd: string): Date | null {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

function todayInSaoPaulo(): Date {
  // en-CA formats as YYYY-MM-DD.
  return calendarDay(new Intl.DateTimeFormat('en-CA', { timeZone: SAO_PAULO }).format(new Date()))!
}

export interface OrderCountdown {
  leg: 'deqi' | 'brazil'
  daysLeft: number   // negative once the leg is blown
  targetDate: string // 'YYYY-MM-DD'
}

export function orderCountdown(
  confirmedAt: string | null | undefined,
  status: string,
): OrderCountdown | null {
  if (!confirmedAt) return null
  const start = calendarDay(confirmedAt)
  if (!start) return null

  // Once the goods are ready the clock belongs to shipping, not to the factory.
  const shipping = status === 'Ready to Ship' || status === 'Shipped'
  const target = new Date(start.getTime() + (shipping ? ORDER_LEG_DAYS * 2 : ORDER_LEG_DAYS) * MS_PER_DAY)

  return {
    leg: shipping ? 'brazil' : 'deqi',
    daysLeft: Math.round((target.getTime() - todayInSaoPaulo().getTime()) / MS_PER_DAY),
    targetDate: target.toISOString().slice(0, 10),
  }
}

// What the red "Overdue" flag actually measures. On an order that is the
// delivery date DEQI committed to; the deadline it inherited from the sample
// describes a milestone that has already passed and would flag every order.
export function dueDateFor(card: { board?: string; deadline?: string; delivery_date?: string }): string | undefined {
  return card.board === 'orders' ? card.delivery_date : card.deadline
}

export function isOverdue(deadline: string | null | undefined): boolean {
  if (!deadline) return false
  try {
    return !isAfter(parseISO(deadline), new Date())
  } catch {
    return false
  }
}

export function isDueSoon(deadline: string | null | undefined, days = 7): boolean {
  if (!deadline) return false
  try {
    const d = parseISO(deadline)
    const now = new Date()
    const soon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    return isAfter(d, now) && !isAfter(d, soon)
  } catch {
    return false
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export function generateId(): string {
  return crypto.randomUUID()
}

export const LOGO_TECHNIQUES = [
  'UV Spot',
  'Hot Stamping',
  'Embossing',
  'Debossing',
  'Silk Print',
  'Laser Engraving',
  'Foil Print',
]

export const LOGO_POSITIONS = ['Inside', 'Outside', 'Inside lid', 'Bottom', 'All sides']

export const OUTSIDE_MATERIALS = [
  'Paper',
  'Velvet',
  'PU Leather',
  'Suede',
  'Linen',
  'Cotton',
  'Microfiber',
  'Satin',
  'Foam',
  'EVA',
  'Custom',
]

export const INSIDE_MATERIALS = OUTSIDE_MATERIALS

export const COLLECTIONS = ['Parma', 'Capri', 'Barcelona', 'Genova', 'Trento', 'Turim', 'Monza', 'Custom']
