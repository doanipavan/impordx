import { orderSchedule } from './utils'
import { Card } from '../types'

/**
 * Um pedido como uma linha na régua do tempo.
 *
 * Saiu de OrdersGantt.tsx em 19/set para que o relatório em PDF desenhe as
 * mesmas linhas, na mesma ordem e na mesma janela que a tela — e não uma
 * segunda leitura da régua, que é como dois pedidos já caíram do gráfico.
 * Nada aqui é React: só datas, contas e ordenação.
 */

export const DAY = 86_400_000

export function calendarDay(ymd?: string): Date | null {
  if (!ymd) return null
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

// Um instante vira o dia em que ele caiu em São Paulo. `slice(0,10)` daria o
// dia em UTC, e um card criado às 22h de Brasília nasceria "amanhã".
export function saoPauloDay(iso?: string | null): Date | null {
  if (!iso) return null
  try {
    return calendarDay(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
      .format(new Date(iso)))
  } catch { return null }
}

export function todayInSaoPaulo(): Date {
  return calendarDay(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()))!
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY)
}

export function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY)
}

// ORD-2026-10014 → 10014, keeping any -R2 that marks a repeat run.
export function shortRef(ref: string) {
  return ref.replace(/^[A-Z]{3}-\d{4}-/, '')
}

export function shortDate(date: Date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export interface Row {
  card: Card
  /** Quando a peça entrou em amostra. Null quando nunca foi uma. */
  sampleStart: Date | null
  sampleDays: number | null
  confirmed: Date
  /** Onde a perna do fornecedor termina: a data que ele deu, ou o dia 60 do plano. */
  handover: Date
  /** Onde a mercadoria chega: data dele + 50, ou o dia 120 do plano. */
  arrival: Date
  /** O dia 60 do plano, sempre — é contra ele que a data do fornecedor é julgada. */
  plannedReady: Date
  forecast: boolean   // a chegada é previsão (data do fornecedor + 50) e não plano
  delivery: Date | null
  arrivedAt: Date | null
  shipping: boolean
  shipped: boolean
  arrived: boolean
  totalLeft: number
  deqiLeft: number
  missedPromise: boolean
}

export function buildRow(card: Card, today: Date): Row | null {
  // Shared with the card panel on purpose. This used to read order_confirmed_at
  // directly, which is only stamped at PI Approved — so an order still waiting
  // on its proforma had no bar at all, however real it was.
  //
  // The rule is also the supplier's, not the hub's: DEQI counts from the sample
  // approval, Sconcept from the proforma. Reading the clock here rather than
  // assuming one is the same mistake this comment already describes, one level up.
  // Desde 14/set a régua tem duas leituras — plano (60 + 60) e previsão
  // (data do fornecedor + 50) — e as duas saem de orderSchedule. Somar os
  // dias aqui de novo seria a terceira cópia da regra, e a que ninguém testa.
  const sched = orderSchedule(card)
  const confirmed = sched ? calendarDay(sched.anchor.date) : null
  if (!sched || !confirmed) return null
  const anchor = sched.anchor

  const handover = calendarDay(sched.ready)!
  const arrival = calendarDay(sched.arrival)!
  const plannedReady = calendarDay(sched.plannedReady)!
  const delivery = calendarDay(card.delivery_date)
  const arrivedAt = calendarDay(card.arrived_at ?? undefined)
  const arrived = card.status === 'Arrived'
  const shipping = arrived || card.status === 'Ready to Ship' || card.status === 'Shipped'

  // A fase de amostra só existe se o relógio estiver ancorado numa aprovação de
  // amostra. Ancorado na proforma, não houve amostra a desenhar — e inventar
  // uma faixa a partir da criação do card seria desenhar outra coisa.
  const bornOn = anchor.kind === 'sample' ? saoPauloDay(card.created_at) : null
  const sampleStart = bornOn && bornOn < confirmed ? bornOn : null

  return {
    card,
    sampleStart,
    sampleDays: sampleStart ? daysBetween(sampleStart, confirmed) : null,
    confirmed, handover, arrival, plannedReady, delivery, arrivedAt, shipping,
    forecast: sched.arrivalKind === 'forecast',
    shipped: card.status === 'Shipped' || arrived,
    arrived,
    // Chegou: a barra não corre mais. O que sobra é o resultado, não a espera.
    totalLeft: arrived && arrivedAt ? daysBetween(arrivedAt, arrival) : daysBetween(today, arrival),
    deqiLeft: daysBetween(today, handover),
    // The supplier has already told us it will miss the 60 days — visible
    // before it slips. Judged against the PLAN's day 60, never against its own
    // date: otherwise a supplier who slips moves the ruler and is never late.
    missedPromise: !!delivery && delivery > plannedReady,
  }
}

/** Most urgent first; anything already shipped sinks to the bottom. */
export function sortRows(rows: Row[], deqiOnly: boolean): Row[] {
  return [...rows].sort((a, b) => {
    const aDone = deqiOnly ? a.shipping : a.shipped
    const bDone = deqiOnly ? b.shipping : b.shipped
    if (aDone !== bDone) return aDone ? 1 : -1
    return deqiOnly ? a.deqiLeft - b.deqiLeft : a.totalLeft - b.totalLeft
  })
}

export interface TimeWindow {
  start: Date
  end: Date
  months: Date[]
  /** Onde uma data cai na janela, em % da largura. */
  pct: (date: Date) => number
}

/** The window spans every bar on screen, padded to whole months. */
export function timeWindow(rows: Row[], today: Date, deqiOnly: boolean): TimeWindow {
  const starts = rows.map(r => (r.sampleStart ?? r.confirmed).getTime())
  // Delivery dates count toward the range: a date the supplier commits to
  // beyond day 120 is the one most worth seeing, and it would fall off the
  // right edge.
  const finish = (r: Row) => (deqiOnly ? r.handover : r.arrival).getTime()
  const ends = rows.flatMap(r => r.delivery ? [finish(r), r.delivery.getTime()] : [finish(r)])
  const min = new Date(Math.min(today.getTime(), ...(starts.length ? starts : [today.getTime()])))
  const max = new Date(Math.max(today.getTime(), ...(ends.length ? ends : [addDays(today, 120).getTime()])))

  const start = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1))
  const end = new Date(Date.UTC(max.getUTCFullYear(), max.getUTCMonth() + 1, 1))

  const months: Date[] = []
  let cur = new Date(start)
  while (cur < end) {
    months.push(new Date(cur))
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
  }
  const pct = (date: Date) => ((date.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100
  return { start, end, months, pct }
}
