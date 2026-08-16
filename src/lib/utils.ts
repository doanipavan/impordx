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

export interface LegClock {
  daysLeft: number   // negative once the leg is blown
  target: string     // 'YYYY-MM-DD'
  started: boolean
  done: boolean
}

export interface OrderClock {
  activeLeg: 'deqi' | 'rdx'
  total: { daysLeft: number; target: string }
  deqi: LegClock
  rdx: LegClock
}

export function orderClock(
  confirmedAt: string | null | undefined,
  status: string,
): OrderClock | null {
  if (!confirmedAt) return null
  const start = calendarDay(confirmedAt)
  if (!start) return null

  const today = todayInSaoPaulo().getTime()
  const daysUntil = (offset: number) =>
    Math.round((start.getTime() + offset * MS_PER_DAY - today) / MS_PER_DAY)
  const dateAt = (offset: number) =>
    new Date(start.getTime() + offset * MS_PER_DAY).toISOString().slice(0, 10)

  // Status is the truth about which leg is running: goods that are ready have
  // left the factory's hands even if the calendar disagrees.
  const shipping = status === 'Ready to Ship' || status === 'Shipped'
  const deqiDaysLeft = daysUntil(ORDER_LEG_DAYS)
  const deqiDone = shipping

  return {
    activeLeg: shipping ? 'rdx' : 'deqi',
    total: { daysLeft: daysUntil(ORDER_LEG_DAYS * 2), target: dateAt(ORDER_LEG_DAYS * 2) },
    deqi: {
      daysLeft: deqiDaysLeft,
      target: dateAt(ORDER_LEG_DAYS),
      started: true,
      done: deqiDone,
    },
    rdx: {
      // Before the factory hands over, shipping has its full window untouched.
      daysLeft: shipping ? daysUntil(ORDER_LEG_DAYS * 2) : ORDER_LEG_DAYS,
      target: dateAt(ORDER_LEG_DAYS * 2),
      started: shipping,
      done: status === 'Shipped' && daysUntil(ORDER_LEG_DAYS * 2) >= 0,
    },
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

// Comprimento x Largura x Altura, in cm. Rendered in the format line items
// already use, so the RFQ the supplier receives does not change shape.
function formatSize([comp, larg, alt]: readonly [number, number, number]): string {
  const br = (n: number) => String(n).replace('.', ',')
  return `${br(comp)} x ${br(larg)} x ${br(alt)} cm`
}

const PARMA_SIZES = [
  [4.6, 5.2, 3.8], [5.9, 5.9, 4.5], [7, 7, 4.5], [7, 8, 3.2], [7, 10, 3.3],
  [6, 6.5, 5.3], [7.5, 5, 3.7], [8.8, 9.1, 3.3], [9, 9, 5.2], [7.1, 9.2, 3.7],
  [22, 5.2, 2.5], [10.2, 10.2, 3.8], [10.2, 10.2, 5.6], [11, 16, 3.5],
  [16, 16, 3.5], [15.5, 11, 3.8], [19, 19.5, 3.5],
] as const

// A collection missing from this map keeps the free-text size field.
export const COLLECTION_SIZES: Record<string, string[]> = {
  Parma: PARMA_SIZES.map(formatSize),
}
