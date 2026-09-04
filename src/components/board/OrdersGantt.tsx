import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, X, ExternalLink } from 'lucide-react'
import { useCards } from '../../hooks/useCards'
import { useAuth } from '../../hooks/useAuth'
import { useCheckpoints, Checkpoint } from '../../hooks/useActivityLog'
import { useSupplierFilter, matchesSupplier } from '../../hooks/useSupplierFilter'
import { cn, ORDER_LEG_DAYS, deliveryAnchor, clockFor, supplierAccent, supplierNameOf, deliverySlip } from '../../lib/utils'
import { Card } from '../../types'

const DAY = 86_400_000
const LABEL_WIDTH = 150
const STORAGE_KEY = 'rdx.ordersGantt.open'

// localStorage throws in some in-app browsers and private modes. Remembering
// a panel is open is never worth taking the page down with it.
function readOpen(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== 'false' } catch { return true }
}
function writeOpen(value: boolean) {
  try { localStorage.setItem(STORAGE_KEY, String(value)) } catch { /* not worth failing over */ }
}

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

// ORD-2026-10014 → 10014, keeping any -R2 that marks a repeat run.
function shortRef(ref: string) {
  return ref.replace(/^[A-Z]{3}-\d{4}-/, '')
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
  // Shared with the card panel on purpose. This used to read order_confirmed_at
  // directly, which is only stamped at PI Approved — so an order still waiting
  // on its proforma had no bar at all, however real it was.
  //
  // The rule is also the supplier's, not the hub's: DEQI counts from the sample
  // approval, Sconcept from the proforma. Reading the clock here rather than
  // assuming one is the same mistake this comment already describes, one level up.
  const clock = clockFor(card)
  const anchor = deliveryAnchor(card, clock)
  const confirmed = calendarDay(anchor?.date)
  if (!confirmed) return null

  const handover = addDays(confirmed, clock.productionDays)
  const arrival = addDays(confirmed, clock.productionDays + clock.shippingDays)
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
  const [supplierFilter] = useSupplierFilter()
  // Where the order actually was, from the history already being recorded.
  const { data: checkpoints = [] } = useCheckpoints(cards.map(c => c.id))
  const [open, setOpen] = useState(readOpen)
  // Qual negócio está em foco. Null = o quadro inteiro.
  const [focusId, setFocusId] = useState<string | null>(null)
  const navigate = useNavigate()
  const chartRef = useRef<HTMLDivElement>(null)
  const [todayX, setTodayX] = useState<number | null>(null)

  const today = useMemo(() => todayInSaoPaulo(), [])

  const rows = useMemo(() => {
    return cards
      .filter(c => matchesSupplier(c, supplierFilter))
      .map(c => buildRow(c, today))
      .filter((r): r is Row => r !== null)
      // Most urgent first; anything already shipped sinks to the bottom.
      .sort((a, b) => {
        const aDone = deqiOnly ? a.shipping : a.shipped
        const bDone = deqiOnly ? b.shipping : b.shipped
        if (aDone !== bDone) return aDone ? 1 : -1
        return deqiOnly ? a.deqiLeft - b.deqiLeft : a.totalLeft - b.totalLeft
      })
  }, [cards, today, deqiOnly, supplierFilter])

  // Focar é filtrar: a janela de tempo abaixo é derivada das linhas visíveis,
  // então reduzir a uma linha faz o gráfico se abrir sobre ela sozinho. Um
  // zoom escrito à parte seria uma segunda régua para as duas discordarem.
  const focused = focusId ? rows.find(r => r.card.id === focusId) ?? null : null
  const drawn = focused ? [focused] : rows

  // The window spans every bar on screen, padded to whole months.
  const { start, end, months } = useMemo(() => {
    const starts = drawn.map(r => r.confirmed.getTime())
    // Delivery dates count toward the range: a date DEQI commits to beyond day
    // 120 is the one most worth seeing, and it would fall off the right edge.
    const finish = (r: Row) => (deqiOnly ? r.handover : r.arrival).getTime()
    const ends = drawn.flatMap(r => r.delivery ? [finish(r), r.delivery.getTime()] : [finish(r)])
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
  }, [drawn, today, deqiOnly])

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
  }, [open, drawn, start, end, today]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    setOpen(o => {
      writeOpen(!o)
      return !o
    })
  }

  if (rows.length === 0) return null

  return (
    <section className="mx-4 mb-3 border border-border rounded-lg bg-card overflow-hidden shrink-0">
      <div className="flex items-center gap-2.5 px-3 py-1.5 border-b border-border bg-muted/40">
        <button onClick={toggle} aria-expanded={open}
          className="flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {deqiOnly ? 'Production schedule' : 'Timeline'}
        </button>
        <span className="text-[11px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {rows.length} {rows.length === 1 ? 'order' : 'orders'}
        </span>

        {/* Sair do foco tem de estar sempre visível: um gráfico que mostra uma
            linha só, sem dizer por quê, parece um gráfico quebrado. */}
        {focused && (
          <button onClick={() => setFocusId(null)}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary
                       bg-primary/10 hover:bg-primary/20 rounded-full pl-2 pr-1.5 py-0.5 transition-colors">
            {focused.card.client_name || focused.card.title}
            <X className="h-3 w-3" />
          </button>
        )}

        <div className="ml-auto hidden md:flex items-center gap-3.5">
          <Key className="bg-amber-100 border-amber-500" label={deqiOnly ? 'In production' : 'DEQI · production'} />
          {!deqiOnly && <Key className="bg-slate-200 border-slate-400" label="RDX · to Brazil" />}
          <Key className="bg-green-100 border-green-600" label={deqiOnly ? 'Ready' : 'Done'} />
          <Key className="bg-red-100 border-red-500" label="Overdue" />
        </div>
      </div>

      {open && (
        <div className="overflow-x-auto scrollbar-thin">
          <div ref={chartRef} className="min-w-[620px] relative">

            {/* month axis */}
            <div className="grid border-b border-border bg-muted/40" style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}>
              <div className="px-2.5 py-1 border-r border-border">
                <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Order</span>
              </div>
              <div className="flex">
                {months.map(m => (
                  <div key={m.toISOString()}
                    className="flex-1 border-l border-border/60 first:border-l-0 px-2 py-1 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                    {m.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}
                  </div>
                ))}
              </div>
            </div>

            {drawn.map(row => (
              <GanttRow key={row.card.id} row={row} months={months.length} pct={pct} deqiOnly={deqiOnly}
                checkpoints={checkpoints.filter(c => c.card_id === row.card.id)}
                focused={!!focused}
                onFocus={() => setFocusId(focused ? null : row.card.id)}
                onOpenCard={row.card.ref_number
                  ? () => navigate(`/orders/${row.card.ref_number}`)
                  : undefined} />
            ))}

            {/* O detalhe do negócio em foco, embaixo da própria barra. */}
            {focused && <FocusDetail row={focused} deqiOnly={deqiOnly} />}

            {/* today */}
            {todayX !== null && (
              <>
                <div className="absolute top-0 bottom-0 w-0.5 bg-primary/80 pointer-events-none"
                  style={{ left: todayX }} />
                <div className="absolute top-0.5 -translate-x-1/2 text-[9px] font-bold tracking-wider uppercase
                                text-primary-foreground bg-primary px-1.5 rounded-full pointer-events-none"
                  style={{ left: todayX }}>
                  today
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}


/**
 * O negócio em foco, escrito por extenso.
 *
 * A barra diz quando; isto diz o quê. Sem ele, dar zoom mostraria a mesma
 * barra maior — e maior não é mais informação.
 *
 * Só datas e prazos: preço não entra aqui, porque o gráfico é uma das poucas
 * telas que a Ashley e o Carlos também abrem, e a régua de tempo não deve
 * carregar o que a régua de dinheiro protege.
 */
function FocusDetail({ row, deqiOnly }: { row: Row; deqiOnly: boolean }) {
  const slip = deliverySlip(row.card)
  const clock = clockFor(row.card)
  const anchor = deliveryAnchor(row.card, clock)

  const facts: Array<{ k: string; v: string; tone?: 'late' | 'ok' }> = [
    { k: 'Reference', v: row.card.ref_number ?? '—' },
    { k: 'Supplier', v: supplierNameOf(row.card) ?? '—' },
    { k: 'Status', v: row.card.status },
    {
      k: anchor?.kind === 'sample' ? 'Sample approved' : 'Proforma approved',
      v: shortDate(row.confirmed),
    },
    { k: `Ready (day ${clock.productionDays})`, v: shortDate(row.handover) },
  ]

  if (!deqiOnly) {
    facts.push({
      k: `Lands in Brazil (day ${clock.productionDays + clock.shippingDays})`,
      v: shortDate(row.arrival),
    })
  }

  if (row.delivery) {
    facts.push({
      k: 'Supplier says',
      v: shortDate(row.delivery),
      tone: row.missedPromise ? 'late' : 'ok',
    })
  }

  const left = deqiOnly ? row.deqiLeft : row.totalLeft
  facts.push({
    k: 'Days left',
    v: left < 0 ? `${Math.abs(left)} overdue` : String(left),
    tone: left < 0 ? 'late' : undefined,
  })

  return (
    <div className="grid border-b border-border/60 bg-muted/30"
      style={{ gridTemplateColumns: `${LABEL_WIDTH}px 1fr` }}>
      <div className="px-2.5 py-2 border-r border-border" />
      <div className="px-3 py-2.5">
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {facts.map(f => (
            <div key={f.k} className="min-w-0">
              <dt className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
                {f.k}
              </dt>
              <dd className={cn('text-[11.5px] font-semibold tabular-nums leading-tight',
                f.tone === 'late' ? 'text-red-600' : f.tone === 'ok' ? 'text-green-600' : 'text-foreground')}>
                {f.v}
              </dd>
            </div>
          ))}
        </dl>

        {/* A data que escorregou é o motivo de alguém estar olhando este card. */}
        {slip && (() => {
          // deliverySlip só devolve datas que já parseou, mas um `!` aqui
          // trocaria um campo estranho por uma exceção — e uma exceção neste
          // ponto leva o board inteiro, não só esta linha.
          const promised = calendarDay(slip.promised)
          return (
            <p className="mt-2 text-[10.5px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 inline-block">
              Moved {slip.days > 0 ? `+${slip.days}` : slip.days} days
              {promised ? ` from ${shortDate(promised)}` : ''}
              {slip.reason ? ` — ${slip.reason}` : ''}
            </p>
          )
        })()}
      </div>
    </div>
  )
}

function GanttRow({ row, months, pct, deqiOnly, checkpoints, focused, onFocus, onOpenCard }: {
  row: Row; months: number; pct: (d: Date) => number; deqiOnly: boolean; checkpoints: Checkpoint[]
  focused: boolean
  onFocus: () => void
  onOpenCard?: () => void
}) {
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
      {/* Client and number on one line. The prefix is ORD-2026- on every row,
          so it distinguishes nothing and costs the height of a second line;
          the full reference stays in the tooltip. */}
      {/* O nome abre o card; a faixa do tempo dá zoom. Dois alvos separados,
          porque são duas intenções diferentes — e um clique que faz as duas
          coisas sempre faz a errada. */}
      <div className="px-2.5 py-2 border-r border-border min-w-0">
        <button
          type="button"
          onClick={onOpenCard}
          disabled={!onOpenCard}
          title={onOpenCard
            ? `Open ${row.card.ref_number} · ${supplierNameOf(row.card) ?? 'supplier unset'} · counted from ${shortDate(row.confirmed)}`
            : 'This order has no reference number yet'}
          className={cn(
            'group/name w-full text-left text-[11.5px] font-semibold truncate leading-none',
            'flex items-center gap-1.5 rounded-sm',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
            onOpenCard && 'hover:text-primary cursor-pointer'
          )}>
          {/* Which supplier owns this bar, in the one place a bar is named.
              Two suppliers sharing one time axis is the reason this chart exists. */}
          <span className={cn('h-2 w-1 rounded-sm shrink-0', supplierAccent(supplierNameOf(row.card)).bar)}
            aria-hidden="true" />
          <span className="truncate">{row.card.client_name || row.card.title}</span>
          {row.card.ref_number && (
            <span className="font-mono font-normal text-[9px] text-muted-foreground/70 tabular-nums">
              {shortRef(row.card.ref_number)}
            </span>
          )}
          {onOpenCard && (
            <ExternalLink className="h-2.5 w-2.5 shrink-0 ml-auto opacity-0 group-hover/name:opacity-70 transition-opacity" />
          )}
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={onFocus}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFocus() } }}
        title={focused ? 'Back to every order' : 'Zoom in on this order'}
        className="relative py-2 cursor-zoom-in focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-primary focus-visible:-outline-offset-2"
        style={focused ? { cursor: 'zoom-out' } : undefined}>
        {/* month gridlines */}
        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: months }).map((_, i) => (
            <span key={i} className="flex-1 border-l border-border/50 first:border-l-0" />
          ))}
        </div>

        <div className="absolute top-1/2 -translate-y-1/2 h-3 rounded-sm border border-border flex overflow-hidden"
          style={{ left: `${left}%`, width: `${right - left}%` }}
          title={`${shortDate(row.confirmed)} → ${shortDate(deqiOnly ? row.handover : row.arrival)}`}>
          <div className={cn('h-full flex items-center justify-center min-w-0', segment[deqiState])}
            style={{ width: `${deqiWidth}%` }}>
            <span className="text-[9px] font-bold tracking-wide px-1 truncate">DEQI</span>
          </div>
          {!deqiOnly && (
            <>
              <div className="w-px bg-card" />
              <div className={cn('h-full flex items-center justify-center min-w-0', segment[rdxState])}
                style={{ width: `${100 - deqiWidth}%` }}>
                <span className="text-[9px] font-bold tracking-wide px-1 truncate">RDX</span>
              </div>
            </>
          )}
        </div>

        {/* Each status change, on the day it happened. No planned marker:
            there is no agreed schedule inside the 60 days to compare against,
            and drawing an invented one would be worse than drawing nothing. */}
        {checkpoints.map(cp => {
          const day = calendarDay(cp.at.slice(0, 10))
          if (!day) return null
          const x = pct(day)
          if (x < 0 || x > 100) return null
          return (
            <div
              key={cp.at}
              className="absolute top-1/2 h-2 w-2 rounded-full bg-foreground border-2 border-card z-10"
              style={{ left: `${x}%`, transform: 'translate(-50%, -50%)' }}
              title={`${cp.status} · ${shortDate(day)} · ${cp.by}`}
            />
          )
        })}

        {/* the date DEQI committed to */}
        {row.delivery && (
          <div
            className={cn('absolute top-1/2 h-2 w-2 rotate-45 rounded-[2px] bg-card border-2 z-10',
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
