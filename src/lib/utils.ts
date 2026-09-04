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

// The history tab used to lead with "7 days ago", which answers "how long"
// but not "which day" — and a card reopened after a week is exactly when
// someone needs the actual date, not a countdown from now. Weekday first,
// because "created Monday" reads before "created Aug 25" does.
export function formatWeekdayDateTime(date: string | null | undefined): string {
  if (!date) return '—'
  try {
    const at = parseISO(date)
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: SAO_PAULO, weekday: 'long' }).format(at)
    const day = new Intl.DateTimeFormat('en-US', {
      timeZone: SAO_PAULO, month: 'short', day: 'numeric', year: 'numeric',
    }).format(at)
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: SAO_PAULO, hour: 'numeric', minute: '2-digit',
    }).format(at)
    return `${weekday}, ${day} • ${time} BRT`
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

// An order runs on two consecutive 60-day legs from the day the sample was
// approved: DEQI has 60 days to have it ready, then Redantex has 60 to land it
// in Brazil. 120 days, counted from that approval and from nothing else.
export const ORDER_LEG_DAYS = 60

/**
 * A supplier's delivery rule.
 *
 * Both suppliers happen to run 60 + 60, but they start counting from different
 * events: DEQI from the day the sample was approved, Sconcept from the day the
 * proforma was approved — Sconcept quotes far more than it samples, so a sample
 * approval is not the moment anything is committed to.
 *
 * This stays in code rather than in the suppliers table, for the reason
 * migration 026 gave and 031 repeats: the rule has already changed three times
 * in one day, and a stored copy keeps answering with the dead version. It is
 * also the only version check-delivery-schedule.ts can reach.
 */
export interface SupplierClock {
  /** Which stamp starts the count. */
  anchor: 'sample' | 'proforma'
  /** Days for the supplier to have the goods ready. */
  productionDays: number
  /** Days from their hands to Brazil. */
  shippingDays: number
}

export const SUPPLIER_CLOCKS: Record<string, SupplierClock> = {
  DEQI: { anchor: 'sample', productionDays: ORDER_LEG_DAYS, shippingDays: ORDER_LEG_DAYS },
  Sconcept: { anchor: 'proforma', productionDays: ORDER_LEG_DAYS, shippingDays: ORDER_LEG_DAYS },
}

export const DEFAULT_CLOCK: SupplierClock = SUPPLIER_CLOCKS.DEQI

/**
 * A supplier's colour.
 *
 * Deliberately outside the status palette. Status colour is semantic here —
 * neutral, amber, green, and red for trouble — so a supplier painted green
 * would read as "done" on a board where green already means exactly that.
 * Blue and violet are unspoken for.
 */
export interface SupplierAccent {
  dot: string
  chip: string
  bar: string
  stroke: string
}

const SUPPLIER_ACCENTS: Record<string, SupplierAccent> = {
  DEQI: {
    dot: 'bg-sky-600',
    chip: 'bg-sky-50 text-sky-700 border-sky-200',
    bar: 'bg-sky-500',
    stroke: '#0284c7',
  },
  Sconcept: {
    dot: 'bg-violet-600',
    chip: 'bg-violet-50 text-violet-700 border-violet-200',
    bar: 'bg-violet-500',
    stroke: '#7c3aed',
  },
}

const UNKNOWN_ACCENT: SupplierAccent = {
  dot: 'bg-slate-400',
  chip: 'bg-slate-50 text-slate-600 border-slate-200',
  bar: 'bg-slate-400',
  stroke: '#94a3b8',
}

export function supplierAccent(shortName?: string | null): SupplierAccent {
  if (!shortName) return UNKNOWN_ACCENT
  return SUPPLIER_ACCENTS[shortName] ?? UNKNOWN_ACCENT
}

/** An unknown supplier reads as DEQI, which is what every card meant before 031. */
export function supplierClock(shortName?: string | null): SupplierClock {
  if (!shortName) return DEFAULT_CLOCK
  return SUPPLIER_CLOCKS[shortName] ?? DEFAULT_CLOCK
}

/** The short name to read a card's rule from, wherever the card came from. */
export function supplierNameOf(card: { supplier?: { short_name?: string } | null }): string | undefined {
  return card.supplier?.short_name
}

export function clockFor(card: { supplier?: { short_name?: string } | null }): SupplierClock {
  return supplierClock(supplierNameOf(card))
}

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

// Samples get two business days per stage. Weekends are excluded; holidays
// are not, so this over-reports around Chinese New Year and Carnival until a
// holiday calendar per side exists.
export const SAMPLE_SLA_DAYS = 2

const SLA_STAGES = ['Requested', 'In Preparation', 'Under RDX Revision', 'Under DEQI Revision']

export interface SlaState {
  used: number
  limit: number
  state: 'ok' | 'due' | 'breached'
}

function businessDaysSince(iso: string): number {
  const start = calendarDay(
    new Intl.DateTimeFormat('en-CA', { timeZone: SAO_PAULO }).format(parseISO(iso)))
  if (!start) return 0
  const today = todayInSaoPaulo()

  let days = 0
  for (let d = start.getTime(); d < today.getTime(); d += MS_PER_DAY) {
    const dow = new Date(d).getUTCDay()
    if (dow !== 0 && dow !== 6) days++
  }
  return days
}

// Null where the clock does not apply: other boards, and the terminal
// statuses, where a card is finished rather than late.
export function sampleSla(card: {
  board?: string
  status?: string
  status_since?: string
}): SlaState | null {
  if (card.board !== 'samples' || !card.status || !card.status_since) return null
  if (!SLA_STAGES.includes(card.status)) return null

  const used = businessDaysSince(card.status_since)
  return {
    used,
    limit: SAMPLE_SLA_DAYS,
    state: used > SAMPLE_SLA_DAYS ? 'breached' : used === SAMPLE_SLA_DAYS ? 'due' : 'ok',
  }
}

export interface CardAge {
  days: number
  done: boolean   // shipped — the count is final
}

// A card keeps its creation date through promotion, so this is the whole
// journey from the day it was opened to the day it shipped, not the age of the
// current stage. Counted in São Paulo calendar days.
export function cardAge(createdAt?: string, shippedAt?: string | null): CardAge | null {
  if (!createdAt) return null
  const sp = (iso: string) =>
    calendarDay(new Intl.DateTimeFormat('en-CA', { timeZone: SAO_PAULO }).format(parseISO(iso)))

  const start = sp(createdAt)
  const end = shippedAt ? sp(shippedAt) : todayInSaoPaulo()
  if (!start || !end) return null

  return {
    days: Math.max(0, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)),
    done: !!shippedAt,
  }
}

export interface LegClock {
  daysLeft: number   // negative once the leg is blown
  target: string     // 'YYYY-MM-DD'
  started: boolean
  done: boolean
}

export interface OrderClock {
  activeLeg: 'deqi' | 'rdx'
  // Which date the count starts from. 'sample' is the real one; 'confirmation'
  // is the fallback for a card that reached Orders without ever being a sample.
  anchor: 'sample' | 'confirmation'
  anchorDate: string
  total: { daysLeft: number; target: string }
  deqi: LegClock
  rdx: LegClock
}

export interface DeliveryAnchor {
  date: string                        // 'YYYY-MM-DD'
  kind: 'sample' | 'confirmation'
}

/**
 * The day an order's 120 starts counting from.
 *
 * Which stamp leads depends on the supplier. For DEQI the sample approval is
 * the promise made to the client, so it wins, and a quote promoted straight to
 * Orders falls back to the stamp left at PI Approved. Sconcept counts from the
 * proforma instead, and only falls back to a sample if one happens to exist.
 *
 * Either way the fallback is never silent: `kind` reports which stamp was
 * actually used, and the panel prints it.
 *
 * Every view of the schedule must call this. The card panel and the Gantt each
 * had their own copy of the rule once, and the Gantt was still demanding
 * order_confirmed_at after the panel had moved on — so two live orders sitting
 * in PI Requested simply vanished from the chart.
 */
export function deliveryAnchor(
  card: {
    sample_approved_at?: string | null
    order_confirmed_at?: string | null
  },
  clock: SupplierClock = DEFAULT_CLOCK
): DeliveryAnchor | null {
  const sample = card.sample_approved_at
  const proforma = card.order_confirmed_at

  if (clock.anchor === 'proforma') {
    if (proforma) return { date: proforma, kind: 'confirmation' }
    if (sample) return { date: sample, kind: 'sample' }
    return null
  }

  if (sample) return { date: sample, kind: 'sample' }
  if (proforma) return { date: proforma, kind: 'confirmation' }
  return null
}

export interface DeliverySlip {
  promised: string   // 'YYYY-MM-DD' — the first date DEQI gave
  current: string    // 'YYYY-MM-DD' — where it stands now
  days: number       // positive when it moved later, negative when it came in
  reason?: string
}

/**
 * How far a committed delivery date has moved, or null if it hasn't.
 *
 * Shared so the board card, the order panel and anything added later read the
 * same rule from one place — the Gantt and the card panel each keeping their
 * own copy of the delivery anchor is what silently dropped two live orders
 * off the chart.
 */
export function deliverySlip(card: {
  delivery_date?: string | null
  delivery_date_promised?: string | null
  delivery_date_change_reason?: string | null
}): DeliverySlip | null {
  const promised = card.delivery_date_promised
  const current = card.delivery_date
  if (!promised || !current || promised === current) return null
  const a = calendarDay(promised)
  const b = calendarDay(current)
  if (!a || !b) return null
  return {
    promised,
    current,
    days: Math.round((b.getTime() - a.getTime()) / MS_PER_DAY),
    reason: card.delivery_date_change_reason ?? undefined,
  }
}

export function orderClock(
  card: {
    sample_approved_at?: string | null
    order_confirmed_at?: string | null
    status?: string
    supplier?: { short_name?: string } | null
  },
  clock: SupplierClock = clockFor(card)
): OrderClock | null {
  const status = card.status ?? ''
  const found = deliveryAnchor(card, clock)
  if (!found) return null
  const { date: anchorDate, kind: anchor } = found
  const start = calendarDay(anchorDate)
  if (!start) return null

  const today = todayInSaoPaulo().getTime()
  const daysUntil = (offset: number) =>
    Math.round((start.getTime() + offset * MS_PER_DAY - today) / MS_PER_DAY)
  const dateAt = (offset: number) =>
    new Date(start.getTime() + offset * MS_PER_DAY).toISOString().slice(0, 10)

  // Status is the truth about which leg is running: goods that are ready have
  // left the factory's hands even if the calendar disagrees.
  const shipping = status === 'Ready to Ship' || status === 'Shipped'
  const handover = clock.productionDays
  const arrival = clock.productionDays + clock.shippingDays
  const deqiDaysLeft = daysUntil(handover)
  const deqiDone = shipping

  return {
    activeLeg: shipping ? 'rdx' : 'deqi',
    anchor,
    anchorDate,
    total: { daysLeft: daysUntil(arrival), target: dateAt(arrival) },
    deqi: {
      daysLeft: deqiDaysLeft,
      target: dateAt(handover),
      started: true,
      done: deqiDone,
    },
    rdx: {
      // Before the factory hands over, shipping has its full window untouched.
      daysLeft: shipping ? daysUntil(arrival) : clock.shippingDays,
      target: dateAt(arrival),
      started: shipping,
      done: status === 'Shipped' && daysUntil(arrival) >= 0,
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

/**
 * Collections belong to a supplier, not to Redantex.
 *
 * Parma, Capri and the rest are DEQI's catalogue, with DEQI's tooling behind
 * them. Sconcept is a quoting relationship — far more quotes than samples, and
 * nothing off a shelf — so it starts with Custom alone and free-text sizes.
 * Add a named collection here once one actually exists.
 */
const SUPPLIER_COLLECTIONS: Record<string, string[]> = {
  DEQI: COLLECTIONS,
  Sconcept: ['Custom'],
}

export function collectionsFor(supplierShortName?: string | null): string[] {
  if (!supplierShortName) return COLLECTIONS
  return SUPPLIER_COLLECTIONS[supplierShortName] ?? ['Custom']
}

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

const TURIM_SIZES = [
  [5, 6, 4.5], [7.5, 6.5, 5.2], [7, 7, 3.5], [7, 10, 3.3],
  [9, 9, 3.7], [21.7, 5.5, 2.6], [11, 16, 3.8], [19, 19, 3.8],
] as const

const TRENTO_SIZES = [
  [7, 7, 4.5], [9, 9, 4.5], [20, 5.5, 4.5], [13.5, 16, 4.5],
  [10, 10, 4.5], [12, 12, 9.5], [20, 25.5, 4.5],
] as const

// A collection missing from this map keeps the free-text size field.
export const COLLECTION_SIZES: Record<string, string[]> = {
  Parma: PARMA_SIZES.map(formatSize),
  Turim: TURIM_SIZES.map(formatSize),
  Trento: TRENTO_SIZES.map(formatSize),
}

// Material codes have no columns of their own — they live as labelled lines
// inside the card description. Create wrote them; Edit had inputs for them and
// silently dropped them on save. Both go through these two functions now, so
// the round trip is lossless and the importer can speak the same format.
const MATERIAL_CODE_LINE = /^\s*(outside|inside)\s+material\s+code\s*:\s*(.*)$/i

export function splitMaterialCodes(description?: string | null): {
  notes: string
  outside_material_code: string
  inside_material_code: string
} {
  let outside = ''
  let inside = ''
  const rest: string[] = []
  for (const line of (description ?? '').split('\n')) {
    const m = line.match(MATERIAL_CODE_LINE)
    if (!m) { rest.push(line); continue }
    if (m[1].toLowerCase() === 'outside') outside = m[2].trim()
    else inside = m[2].trim()
  }
  return {
    notes: rest.join('\n').trim(),
    outside_material_code: outside,
    inside_material_code: inside,
  }
}

export function mergeMaterialCodes(
  notes?: string | null, outside?: string | null, inside?: string | null,
): string | undefined {
  const codes = [
    outside?.trim() ? `Outside material code: ${outside.trim()}` : '',
    inside?.trim() ? `Inside material code: ${inside.trim()}` : '',
  ].filter(Boolean).join('\n')
  return [notes?.trim(), codes].filter(Boolean).join('\n\n') || undefined
}

/**
 * The reason behind a failed request, ready to show.
 *
 * The stage gates say precisely what is missing — "Every item needs a purchase
 * price in USD — 2 still without one" — and every catch block was throwing that
 * away and printing "Failed to update status". People were left to guess at a
 * rule the database was already spelling out.
 */
/**
 * Duas falhas que o usuário não deve ler no original.
 *
 * `42501` é a recusa da política de segurança do Postgres. Chega como "new row
 * violates row-level security policy for table cards", que descreve a mecânica
 * e não o que a pessoa fez de errado.
 *
 * "Load failed" é o que o Safari diz quando a requisição não chegou ao
 * servidor — rede caída, aba suspensa no celular, bloqueador. Não é erro do
 * hub, e mandar alguém procurar defeito no formulário é mandá-lo para o lugar
 * errado. Carlos recebeu exatamente essa, tentando criar um card que a regra
 * nunca teria deixado passar de qualquer forma.
 */
function friendlyError(code: string | undefined, message: string): string {
  if (code === '42501' || /row-level security/i.test(message)) {
    return 'You do not have permission for this — ask Redantex to do it'
  }
  if (/^(TypeError: )?Load failed$/i.test(message.trim()) || /Failed to fetch/i.test(message)) {
    return 'The connection dropped before this could be saved — check your internet and try again'
  }
  return message
}

export function errorText(err: unknown): string | null {
  if (!err) return null
  const code = typeof err === 'object' && err && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined
  if (err instanceof Error) return err.message ? friendlyError(code, err.message) : null
  if (typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message
    return typeof m === 'string' && m ? friendlyError(code, m) : null
  }
  return typeof err === 'string' && err ? friendlyError(code, err) : null
}

// PostgREST devolve um embed um-para-um às vezes como objeto e às vezes como
// array de um elemento, dependendo de como lê as chaves. Errar o palpite
// derrubaria todo preço de venda sem dizer nada.
export function salePrice(pricing: unknown): number | undefined {
  const row = Array.isArray(pricing) ? pricing[0] : pricing
  const value = (row as { sale_price_brl?: number } | null | undefined)?.sale_price_brl
  return value == null ? undefined : Number(value)
}
