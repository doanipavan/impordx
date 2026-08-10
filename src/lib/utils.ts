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

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—'
  try {
    return format(parseISO(date), 'MMM d, yyyy • h:mm a')
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
  'Custom',
]

export const INSIDE_MATERIALS = ['Velvet', 'Suede', 'Satin', 'Foam', 'EVA', 'Custom']

export const COLLECTIONS = ['Parma', 'Capri', 'Barcelona', 'Genova', 'Trento', 'Turim', 'Monza', 'Custom']
