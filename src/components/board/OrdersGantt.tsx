import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCards } from '../../hooks/useCards'
import { useAuth } from '../../hooks/useAuth'
import { cn, ORDER_LEG_DAYS } from '../../lib/utils'
import { Card } from '../../types'

const DAY = 86_400_000
const LABEL_WIDTH = 210
const STORAGE_KEY = 'rdx.ordersGantt.open'

function calendarDay(ymd?: string): Date | null {
  if (!ymd) return null
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

function todayInSaoPaulo(): Date {
  return calendarDay(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()))!
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY)
}

function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY)
}

function shortDate(date: Date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

interface Row {
  card: Card
  confirmed: Date
  handover: Date   // day 60 — DEQI hands over
  arrival: Date    // day 120 — lands in Brazil
  delivery: Date | null
  shipping: boolean
  shipped: boolean
  totalLeft: number
  deqiLeft: number
  missedPromise: boolean
}

function buildRow(card: Card, today: Date): Row | null {
  const confirmed = calendarDay(card.order_confirmed_at)
  if (!confirmed) return null

  const handover = addDays(confirmed, ORDER_LEG_DAYS)
  const arrival = addDays(confirmed, ORDER_LEG_DAYS * 2)
  const delivery = calendarDay(card.delivery_date)
  const shipping = card.status === 'Ready to Ship' || card.status === 'Shipped'

  return {
    card, confirmed, handover, arrival, delivery, shipping,
    shipped: card.status === 'Shipped',
    totalLeft: daysBetween(today, arrival),
    deqiLeft: daysBetween(today, handover),
    // DEQI has already told us it will miss the 60 days — visible before it slips.
    missedPromise: !!delivery && delivery > handover,
  }
}

export function OrdersGantt() {
  const { data: cards = [] } = useCards('orders')
  const { user } = useAuth()
  // Shipping to Brazil is Redantex's leg. The supplier sees its own 60 days
  // and nothing past the handover.
  const deqiOnly = user?.role === 'viewer'
  const [open, setOpen] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'false')
  const chartRef = useRef<HTMLDivElement>(null)
  const [todayX, setTodayX] = useState<number | null>(null)

  const today = useMemo(() => todayInSaoPaulo(), [])

  const rows = useMemo(() => {
    return cards
      .map(c => buildRow(c, today))
      .filter((r): r is Row => r !== null)
      // Most urgent first; anything already shipped sinks to the bottom.
      .sort((a, b) => {
        const aDone = deqiOnly ? a.shipping : a.shipped
        const bDone = deqiOnly ? b.shipping : b.shipped
        if (aDone !== bDone) return aDone ? 1 : -1
        return deqiOnly ? a.deqiLeft - b.deqiLeft : a.totalLeft - b.totalLeft
      })
  }, [cards, today, deqiOnly])

  // The window spans every bar on screen, padded to whole months.
  const { start, end, months } = useMemo(() => {
    const starts = rows.map(r => r.confirmed.getTime())
    // Delivery dates count toward the range: a date DEQI commits to beyond day
    // 120 is the one most worth seeing, and it would fall off the right edge.
    const finish = (r: Row) => (deqiOnly ? r.handover : r.arrival).getTime()
    const ends = rows.flatMap(r => r.delivery ? [finish(r), r.delivery.getTime()] : [finish(r)])
    const min = new Date(Math.min(today.getTime(), ...(starts.length ? starts : [today.getTime()])))
    const max = new Date(Math.max(today.getTime(), ...(ends.length ? ends : [addDays(today, 120).getTime()])))

    const from = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1))
    const to = new Date(Date.UTC(max.getUTCFullYear(), max.getUTCMonth() + 1, 1))

    const list: Date[] = []
    let cur = new Date(from)
    while (cur < to) {
      list.push(new Date(cur))
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
    }
    return { start: from, end: to, months: list }
  }, [rows, today, deqiOnly])

  const pct = (date: Date) => ((date.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100

  // The today line spans the whole chart, so it is positioned in pixels once
  // the tracks have a measured width rather than per row.
  useEffect(() => {
    if (!open) return
    function place() {
      const el = chartRef.current
      if (!el) return
      const trackWidth = el.offsetWidth - LABEL_WIDTH
      setTodayX(LABEL_WIDTH + (pct(today) / 100) * trackWidth)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, rows, start, end, today]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    setOpen(o => {
      localStorage.setItem(STORAGE_KEY, String(!o))
      return !o
    })
  }

  if (rows.length === 0) return null

  return (
    <section className="mx-4 mb-3 border border-border rounded-lg bg-card overflow-hidden shrink-0">
      <div className="flex items-center gap-2.5 px-3.5 py-2 border-b border-border bg-muted/40">
        <button onClick={toggle} aria-expanded={open}
          className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {deqiOnly ? 'Production schedule' : 'Timeline'}
        </button>
        <span className="text-[11px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {rows.length} {rows.length === 1 ? 'order' : 'orders'}
        </span>

        <div className="ml-auto hidden md:flex items-center gap-3.5">
          <Key className="bg-amber-100 border-amber-500" label={deqiOnly ? 'In production' : 'DEQI · production'} />
          {!deqiOnly && <Key className="bg-slate-200 border-slate-400" label="RDX · to Brazil" />}
          <Key className="bg-green-100 border-green-600" label={deqiOnly ? 'Ready' : 'Done'} />
          <Key className="bg-red-100 border-red-500" label="Overdue" />
        </div>
      </div>

      {open && (
        <div className="overflow-x-auto scrollbar-thin">
          <div ref={chartRef} className="min-w-[860px] relative">

            {/* month axis */}
            <div className="grid border-b border-border bg-muted/40" style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}>
              <div className="px-3 py-1.5 border-r border-border">
                <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Order</span>
              </div>
              <div className="flex">
                {months.map(m => (
                  <div key={m.toISOString()}
                    className="flex-1 border-l border-border/60 first:border-l-0 px-2 py-1.5 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    {m.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
                  </div>
                ))}
              </div>
            </div>

            {rows.map(row => (
              <GanttRow key={row.card.id} row={row} months={months.length} pct={pct} deqiOnly={deqiOnly} />
            ))}

            {/* today */}
            {todayX !== null && (
              <>
                <div className="absolute top-0 bottom-0 w-0.5 bg-primary/80 pointer-events-none"
                  style={{ left: todayX }} />
                <div className="absolute top-0.5 -translate-x-1/2 text-[9px] font-bold tracking-wider uppercase
                                text-primary-foreground bg-primary px-1.5 rounded-full pointer-events-none"
                  style={{ left: todayX }}>
                  hoje
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function GanttRow({ row, months, pct, deqiOnly }: { row: Row; months: number; pct: (d: Date) => number; deqiOnly: boolean }) {
  const left = pct(row.confirmed)
  const right = pct(deqiOnly ? row.handover : row.arrival)
  const mid = pct(row.handover)
  const deqiWidth = deqiOnly ? 100 : ((mid - left) / (right - left)) * 100

  const deqiState = row.shipping ? 'done' : row.deqiLeft < 0 ? 'late' : 'deqi'
  const rdxState = row.shipped ? 'done' : row.totalLeft < 0 ? 'late' : 'rdx'

  const segment = {
    deqi: 'bg-amber-100 text-amber-700',
    rdx: 'bg-slate-200 text-slate-600',
    done: 'bg-green-100 text-green-700',
    late: 'bg-red-100 text-red-700',
  }

  const daysLeft = deqiOnly ? row.deqiLeft : row.totalLeft
  const finished = deqiOnly ? row.shipping : row.shipped
  const chip = finished ? 'bg-green-100 text-green-700'
    : daysLeft < 0 ? 'bg-red-100 text-red-700'
    : daysLeft <= 21 ? 'bg-amber-100 text-amber-700'
    : 'bg-muted text-muted-foreground'

  return (
    <div className="grid border-b border-border/60 last:border-b-0 hover:bg-muted/30 transition-colors"
      style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}>
      <div className="px-3 py-2.5 border-r border-border min-w-0">
        <p className="text-[11px] font-mono text-muted-foreground tabular-nums">{row.card.ref_number}</p>
        <p className="text-[13px] font-semibold truncate">
          {row.card.client_name || row.card.title}
          {row.card.collection && <span className="text-muted-foreground font-normal"> · {row.card.collection}</span>}
        </p>
        <p className="text-[11px] text-muted-foreground/80">confirmed {shortDate(row.confirmed)}</p>
      </div>

      <div className="relative py-3.5">
        {/* month gridlines */}
        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: months }).map((_, i) => (
            <span key={i} className="flex-1 border-l border-border/50 first:border-l-0" />
          ))}
        </div>

        <div className="absolute top-1/2 -translate-y-1/2 h-5 rounded border border-border flex overflow-hidden"
          style={{ left: `${left}%`, width: `${right - left}%` }}
          title={`${shortDate(row.confirmed)} → ${shortDate(deqiOnly ? row.handover : row.arrival)}`}>
          <div className={cn('h-full flex items-center justify-center min-w-0', segment[deqiState])}
            style={{ width: `${deqiWidth}%` }}>
            <span className="text-[10px] font-bold tracking-wide px-1.5 truncate">DEQI</span>
          </div>
          {!deqiOnly && (
            <>
              <div className="w-px bg-card" />
              <div className={cn('h-full flex items-center justify-center min-w-0', segment[rdxState])}
                style={{ width: `${100 - deqiWidth}%` }}>
                <span className="text-[10px] font-bold tracking-wide px-1.5 truncate">RDX</span>
              </div>
            </>
          )}
        </div>

        {/* the date DEQI committed to */}
        {row.delivery && (
          <div
            className={cn('absolute top-1/2 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-card border-2',
              row.missedPromise ? 'border-red-500' : 'border-foreground')}
            style={{ left: `${pct(row.delivery)}%`, transform: 'translate(-50%, -50%) rotate(45deg)' }}
            title={row.missedPromise
              ? `DEQI gave ${shortDate(row.delivery)} — past the ${ORDER_LEG_DAYS}-day window`
              : `Delivery date from DEQI: ${shortDate(row.delivery)}`}
          />
        )}

        <div className={cn('absolute top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap', chip)}
          style={{ left: `calc(${right}% + 10px)` }}>
          {finished ? (deqiOnly ? 'ready' : 'delivered')
            : daysLeft < 0 ? `${Math.abs(daysLeft)}d over`
            : `${daysLeft}d`}
        </div>
      </div>
    </div>
  )
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <i className={cn('block h-1.5 w-4 rounded-sm border', className)} />
      {label}
    </span>
  )
}
