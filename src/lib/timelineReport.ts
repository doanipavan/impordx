import { ORDER_LEG_DAYS, LOGISTICS_TARGET_DAYS, logisticsOutcome, supplierNameOf, orderSchedule } from './utils'
import { Row, timeWindow, shortRef, shortDate } from './orderRows'
import { OrderStatus } from '../types'

/**
 * O relatório da timeline, em HTML pronto para imprimir (Cmd+P → PDF).
 *
 * Recebe as mesmas linhas que a tela desenha, já na ordem da tela, e a mesma
 * janela de meses. Não lê o banco nem soma dias: tudo isso já veio feito de
 * orderRows/orderSchedule. Se o gráfico e o PDF um dia discordarem, o erro
 * está em quem passou as linhas — não aqui.
 *
 * Sem dinheiro, de propósito: é a régua do tempo, e ela é uma das poucas
 * coisas que o fornecedor também recebe. Preço mora no Export Orders.
 */

export interface ReportOptions {
  today: Date
  /** Conta de fornecedor: só a perna dele, sem chegada no Brasil nem nomes. */
  deqiOnly: boolean
  /** O que foi filtrado, por extenso — vai no subtítulo. Ver describeFilter. */
  scope: string
  generatedBy: string
  /** Data e hora por extenso, já em BRT. */
  generatedAt: string
  /** O logo, como data URL, para a página não depender da rede. */
  logoDataUrl?: string | null
  /** Quais partes imprimir. Sem nada marcado sai só o cabeçalho e o resumo. */
  sections?: { chart: boolean; table: boolean }
}

// ── Filtros ──────────────────────────────────────────────────────────────────
//
// As dez colunas do board são demais para uma caixa de diálogo; quatro grupos
// dizem o que alguém quer saber: ainda sem proforma, em produção, embarcado,
// chegado. A ordem dos statuses aqui é a do board.

export type StageGroup = 'before' | 'production' | 'shipped' | 'arrived'

export const STAGE_GROUPS: Array<{ id: StageGroup; label: string; statuses: OrderStatus[] }> = [
  { id: 'before', label: 'Waiting on the proforma',
    statuses: ['Purchasing', 'Commercial', 'PI Requested', 'PI In Preparation', 'PI Approved'] },
  { id: 'production', label: 'Placed · in production', statuses: ['Placed', 'In Production'] },
  { id: 'shipped', label: 'Ready · shipped', statuses: ['Ready to Ship', 'Shipped'] },
  { id: 'arrived', label: 'Arrived', statuses: ['Arrived'] },
]

export interface ReportFilter {
  /** 'all' ou o id do fornecedor. */
  supplier: string
  /** '' = todos. Compara com client_name exato. */
  client: string
  stages: StageGroup[]
  /** 'YYYY-MM' ou '' = sem limite. Mês de chegada no Brasil (ou de pronto, para o fornecedor). */
  monthFrom: string
  monthTo: string
  /** Só quem precisa de atenção: atrasado, ou fornecedor além do dia 60. */
  attentionOnly: boolean
  sections: { chart: boolean; table: boolean }
}

export const DEFAULT_FILTER: ReportFilter = {
  supplier: 'all', client: '', stages: STAGE_GROUPS.map(g => g.id),
  monthFrom: '', monthTo: '', attentionOnly: false,
  sections: { chart: true, table: true },
}

/** O mês em que a linha "acaba": chegada no Brasil, ou pronto, para o fornecedor. */
export function rowMonth(row: Row, deqiOnly: boolean): string {
  const d = deqiOnly ? row.handover : (row.arrivedAt ?? row.arrival)
  return d.toISOString().slice(0, 7)
}

export function needsAttention(row: Row, deqiOnly: boolean): boolean {
  const finished = deqiOnly ? row.shipping : row.arrived
  if (finished) return false
  const left = deqiOnly ? row.deqiLeft : row.totalLeft
  return left < 0 || row.missedPromise
}

export function applyReportFilter(rows: Row[], f: ReportFilter, deqiOnly: boolean): Row[] {
  const statuses = new Set(STAGE_GROUPS.filter(g => f.stages.includes(g.id)).flatMap(g => g.statuses))
  return rows.filter(row => {
    if (f.supplier !== 'all' && row.card.supplier_id !== f.supplier) return false
    if (f.client && (row.card.client_name ?? '') !== f.client) return false
    if (!statuses.has(row.card.status as OrderStatus)) return false
    const m = rowMonth(row, deqiOnly)
    if (f.monthFrom && m < f.monthFrom) return false
    if (f.monthTo && m > f.monthTo) return false
    if (f.attentionOnly && !needsAttention(row, deqiOnly)) return false
    return true
  })
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** O filtro por extenso, para o subtítulo do relatório. */
export function describeFilter(f: ReportFilter, supplierName: string | undefined, deqiOnly: boolean): string {
  const parts: string[] = []
  if (!deqiOnly) parts.push(f.supplier === 'all' ? 'All suppliers' : supplierName ?? 'One supplier')
  if (f.client) parts.push(f.client)
  const all = f.stages.length === STAGE_GROUPS.length
  if (!all) parts.push(STAGE_GROUPS.filter(g => f.stages.includes(g.id)).map(g => g.label).join(', ') || 'No stage')
  const what = deqiOnly ? 'Ready' : 'Landing'
  if (f.monthFrom && f.monthFrom === f.monthTo) parts.push(`${what} ${monthLabel(f.monthFrom)}`)
  else if (f.monthFrom && f.monthTo) parts.push(`${what} ${monthLabel(f.monthFrom)} – ${monthLabel(f.monthTo)}`)
  else if (f.monthFrom) parts.push(`${what} from ${monthLabel(f.monthFrom)}`)
  else if (f.monthTo) parts.push(`${what} until ${monthLabel(f.monthTo)}`)
  if (f.attentionOnly) parts.push('Needing attention')
  return parts.join(' · ')
}

const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

// As cores do Tailwind que o gráfico usa, por valor: a página impressa não
// carrega a folha de estilos do hub.
const C = {
  amber: ['#fef3c7', '#b45309'], slate: ['#e2e8f0', '#475569'],
  green: ['#dcfce7', '#15803d'], red: ['#fee2e2', '#b91c1c'],
  sky: '#0ea5e9', violet: '#8b5cf6', unknown: '#cbd5e1',
  muted: '#64748b', line: '#e5e7eb', ink: '#0f172a',
} as const

function edgeColour(row: Row) {
  const name = supplierNameOf(row.card)?.toLowerCase() ?? ''
  return name.includes('deqi') ? C.sky : name.includes('sconcept') ? C.violet : C.unknown
}

function plural(n: number, one: string, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`
}

interface Summary { k: string; v: string; tone?: 'late' | 'ok' }

function summarise(rows: Row[], deqiOnly: boolean, today: Date): Summary[] {
  const open = rows.filter(r => !(deqiOnly ? r.shipping : r.arrived))
  const overdue = open.filter(r => (deqiOnly ? r.deqiLeft : r.totalLeft) < 0)
  const missed = rows.filter(r => r.missedPromise && !r.shipping)
  const month = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth()
  const thisMonth = open.filter(r => month(deqiOnly ? r.handover : r.arrival) === month(today))
  const nextMonth = open.filter(r => month(deqiOnly ? r.handover : r.arrival) === month(today) + 1)

  const out: Summary[] = [
    { k: deqiOnly ? 'In production' : 'On the clock', v: String(open.length) },
    { k: 'Overdue', v: String(overdue.length), tone: overdue.length ? 'late' : undefined },
    { k: `Supplier past day ${ORDER_LEG_DAYS}`, v: String(missed.length), tone: missed.length ? 'late' : undefined },
    { k: deqiOnly ? 'Ready this month' : 'Landing this month', v: String(thisMonth.length) },
    { k: deqiOnly ? 'Ready next month' : 'Landing next month', v: String(nextMonth.length) },
  ]

  if (!deqiOnly) {
    const atSea = rows.filter(r => r.shipped && !r.arrived)
    const arrived = rows.filter(r => r.arrived)
    const onTarget = arrived.filter(r => logisticsOutcome(r.card)?.onTarget).length
    out.push({ k: 'Shipped, at sea', v: String(atSea.length) })
    out.push({
      k: 'Arrived',
      v: arrived.length ? `${arrived.length} · ${onTarget} on target` : '0',
      tone: arrived.length && onTarget < arrived.length ? 'late' : arrived.length ? 'ok' : undefined,
    })
  }
  return out
}

function ganttRow(row: Row, deqiOnly: boolean, pct: (d: Date) => number, todayPct: number, months: number) {
  const anchorX = pct(row.confirmed)
  const left = row.sampleStart ? pct(row.sampleStart) : anchorX
  const right = pct(deqiOnly ? row.handover : row.arrival)
  const mid = pct(row.handover)
  const span = right - left
  const sampleW = span > 0 ? ((anchorX - left) / span) * 100 : 0
  const rest = 100 - sampleW
  const supplierW = deqiOnly ? rest : (span > 0 ? ((mid - anchorX) / span) * 100 : rest)

  const outcome = logisticsOutcome(row.card)
  const supplierState = row.shipping ? C.green : row.deqiLeft < 0 ? C.red : C.amber
  const rdxState = row.arrived ? (outcome && !outcome.onTarget ? C.red : C.green)
    : row.totalLeft < 0 ? C.red : C.slate

  const daysLeft = deqiOnly ? row.deqiLeft : row.totalLeft
  const finished = deqiOnly ? row.shipping : row.arrived
  const chipText = finished
    ? (deqiOnly ? 'ready' : outcome ? `arrived · ${outcome.days}d${outcome.onTarget ? '' : ` (${outcome.over} over)`}` : 'arrived')
    : row.shipped && !deqiOnly ? `shipped · ${daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d`}`
    : daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d`
  const chipTone = finished ? (outcome && !outcome.onTarget ? C.red : C.green)
    : daysLeft < 0 ? C.red : daysLeft <= 21 ? C.amber : ['#f1f5f9', C.muted]

  // Um pedido antigo inserido hoje tem a perna do fornecedor colapsada num
  // fio; "SUPPLIER" cortado ao meio parece defeito. Sem espaço, sem rótulo.
  const trackW = right - left
  const label = (w: number, text: string) => (w / 100) * trackW >= 6 ? text : ''

  const gridlines = Array.from({ length: months }, (_, i) =>
    `<i class="gl" style="left:${(i / months) * 100}%"></i>`).join('')

  const diamond = row.delivery
    ? `<i class="dm" style="left:${pct(row.delivery)}%;${row.missedPromise ? `border-color:${C.red[1]};background:${C.red[0]}` : ''}"></i>`
    : ''

  return `<tr>
    <td class="lbl" style="border-left-color:${edgeColour(row)}">
      <b>${esc(row.card.client_name || row.card.title)}</b>
      <span class="ref">${esc(row.card.ref_number ? shortRef(row.card.ref_number) : '')}</span>
    </td>
    <td class="trk" colspan="${months}">
      ${gridlines}
      <i class="today" style="left:${todayPct}%"></i>
      <div class="bar" style="left:${left}%;width:${right - left}%">
        ${row.sampleStart && sampleW > 0 ? `<span class="seg sample" style="width:${sampleW}%"></span>` : ''}
        <span class="seg" style="width:${supplierW}%;background:${supplierState[0]};color:${supplierState[1]}">${label(supplierW, 'SUPPLIER')}</span>
        ${deqiOnly ? '' : `<span class="seg" style="width:${rest - supplierW}%;background:${rdxState[0]};color:${rdxState[1]}">${label(rest - supplierW, 'RDX')}</span>`}
      </div>
      ${diamond}
      <span class="chip" style="left:calc(${right}% + 6px);background:${chipTone[0]};color:${chipTone[1]}">${chipText}</span>
    </td>
  </tr>`
}

function tableRow(row: Row, deqiOnly: boolean) {
  const sched = orderSchedule(row.card)
  const anchorKind = sched?.anchor.kind === 'sample' ? 'Sample' : 'Proforma'
  const outcome = logisticsOutcome(row.card)
  const daysLeft = deqiOnly ? row.deqiLeft : row.totalLeft
  const finished = deqiOnly ? row.shipping : row.arrived

  const result = finished
    ? (deqiOnly ? 'Ready'
      : outcome ? `Arrived ${shortDate(row.arrivedAt!)} · ${outcome.days}d${outcome.onTarget ? ' · on target' : ` · ${outcome.over} over`}`
      : 'Arrived')
    : daysLeft < 0 ? `${Math.abs(daysLeft)} overdue` : `${daysLeft}`
  const resultTone = finished ? (outcome && !outcome.onTarget ? 'late' : 'ok') : daysLeft < 0 ? 'late' : ''

  return `<tr>
    <td style="border-left-color:${edgeColour(row)}"><b>${esc(row.card.client_name || row.card.title)}</b></td>
    <td class="mono">${esc(row.card.ref_number)}</td>
    <td class="mono">${esc(row.card.purchase_order) || '—'}</td>
    ${deqiOnly ? '' : `<td>${esc(supplierNameOf(row.card)) || '—'}</td>`}
    <td>${esc(row.card.status)}</td>
    <td>${anchorKind} · ${shortDate(row.confirmed)}</td>
    <td>${shortDate(row.plannedReady)}</td>
    <td class="${row.missedPromise ? 'late' : row.delivery ? 'ok' : ''}">${row.delivery ? shortDate(row.delivery) : '—'}</td>
    ${deqiOnly ? '' : `<td>${shortDate(row.arrival)} <small>${row.forecast ? 'forecast' : 'plan'}</small></td>`}
    <td class="${resultTone}">${result}</td>
  </tr>`
}

export function timelineReportHtml(rows: Row[], o: ReportOptions): string {
  const { months, pct } = timeWindow(rows, o.today, o.deqiOnly)
  const todayPct = pct(o.today)
  const summary = summarise(rows, o.deqiOnly, o.today)
  const title = o.deqiOnly ? 'Production schedule' : 'Orders timeline'
  const sections = o.sections ?? { chart: true, table: true }

  const rule = o.deqiOnly
    ? `Each order has ${ORDER_LEG_DAYS} days from its anchor to be ready. The diamond is the date you gave.`
    : `Plan: ${ORDER_LEG_DAYS * 2} days from the anchor — ${ORDER_LEG_DAYS} for the supplier, ${ORDER_LEG_DAYS} to Brazil. ` +
      `Forecast: the supplier's date + ${LOGISTICS_TARGET_DAYS}. The diamond is the supplier's date; red when past day ${ORDER_LEG_DAYS}.`

  const monthHeads = months.map(m =>
    `<th class="m" style="width:${100 / months.length}%">${m.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</th>`).join('')

  const tableHead = [
    'Client', 'Reference', 'PO', ...(o.deqiOnly ? [] : ['Supplier']), 'Status', 'Anchor',
    `Planned ready (day ${ORDER_LEG_DAYS})`, 'Supplier says',
    ...(o.deqiOnly ? [] : ['Lands in Brazil']),
    o.deqiOnly ? 'Days left' : 'Days left / result',
  ].map(h => `<th>${h}</th>`).join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} — ${esc(o.generatedAt)}</title>
<style>
  @page { size: A4 landscape; margin: 11mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 10px/1.35 -apple-system, "Segoe UI", Inter, Arial, sans-serif; color: ${C.ink}; }
  h1 { font-size: 18px; margin: 0; letter-spacing: -.01em; }
  .head { display: flex; align-items: flex-start; gap: 16px; padding-bottom: 8px; border-bottom: 2px solid ${C.ink}; }
  .head img { height: 26px; margin-top: 2px; }
  .head .sub { color: ${C.muted}; margin-top: 2px; }
  .head .rule { margin-left: auto; max-width: 46%; color: ${C.muted}; font-size: 9px; text-align: right; }
  .sum { display: flex; gap: 8px; margin: 10px 0 12px; }
  .sum div { flex: 1; border: 1px solid ${C.line}; border-radius: 6px; padding: 6px 8px; }
  .sum dt { font-size: 8px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: ${C.muted}; margin: 0; }
  .sum dd { font-size: 15px; font-weight: 700; margin: 1px 0 0; font-variant-numeric: tabular-nums; }
  .late { color: ${C.red[1]}; } .ok { color: ${C.green[1]}; }
  h2 { font-size: 11px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .08em; color: ${C.muted}; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .06em; color: ${C.muted};
       padding: 3px 6px; border-bottom: 1px solid ${C.ink}; }
  td { padding: 3px 6px; border-bottom: 1px solid ${C.line}; vertical-align: middle; }

  /* gantt */
  .gantt td.lbl { width: 150px; border-left: 3px solid; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
  .gantt .ref { font-family: ui-monospace, Menlo, monospace; font-size: 8px; color: ${C.muted}; margin-left: 4px; }
  .gantt th.m { border-left: 1px solid ${C.line}; }
  .gantt td.trk { position: relative; height: 19px; padding: 0; }
  .gl { position: absolute; top: 0; bottom: 0; border-left: 1px solid ${C.line}; }
  .today { position: absolute; top: -1px; bottom: -1px; border-left: 1.5px solid #b91c1c; z-index: 2; }
  .bar { position: absolute; top: 4px; height: 11px; display: flex; border: 1px solid #d4d4d8; border-radius: 2px; overflow: hidden; }
  .seg { display: inline-flex; align-items: center; justify-content: center; height: 100%; font-size: 6.5px; font-weight: 700;
         letter-spacing: .06em; overflow: hidden; white-space: nowrap; border-right: 1px solid #fff; }
  .seg:last-child { border-right: 0; }
  .seg.sample { background: rgb(237 233 246) repeating-linear-gradient(45deg, transparent 0 2px, rgba(124,58,237,.3) 2px 4px); }
  .dm { position: absolute; top: 50%; width: 7px; height: 7px; border: 1.5px solid ${C.ink}; background: #fff; z-index: 3;
        transform: translate(-50%, -50%) rotate(45deg); }
  .chip { position: absolute; top: 50%; transform: translateY(-50%); font-size: 7.5px; font-weight: 700; padding: 1px 5px;
          border-radius: 8px; white-space: nowrap; }
  .key { display: flex; gap: 12px; margin-top: 6px; color: ${C.muted}; font-size: 8px; }
  .key i { display: inline-block; width: 14px; height: 6px; border-radius: 2px; border: 1px solid; vertical-align: middle; margin-right: 4px; }

  /* table */
  .list td:first-child { border-left: 3px solid; }
  .list .mono { font-family: ui-monospace, Menlo, monospace; font-size: 9px; }
  .list small { font-size: 7.5px; color: ${C.muted}; }
  .foot { display: flex; justify-content: space-between; margin-top: 12px; padding-top: 6px; border-top: 1px solid ${C.line};
          color: ${C.muted}; font-size: 8px; }
</style></head><body>

<div class="head">
  ${o.logoDataUrl ? `<img src="${o.logoDataUrl}" alt="Redantex">` : ''}
  <div>
    <h1>${title}</h1>
    <div class="sub">${esc(o.scope)} · ${plural(rows.length, 'order')} · ${esc(o.generatedAt)} · by ${esc(o.generatedBy)}</div>
  </div>
  <div class="rule">${rule}</div>
</div>

<dl class="sum">
  ${summary.map(s => `<div><dt>${s.k}</dt><dd class="${s.tone ?? ''}">${s.v}</dd></div>`).join('')}
</dl>

${sections.chart ? `<table class="gantt">
  <thead><tr><th style="width:150px">Order</th>${monthHeads}</tr></thead>
  <tbody>
    ${rows.map(r => ganttRow(r, o.deqiOnly, pct, todayPct, months.length)).join('')}
  </tbody>
</table>
<div class="key">
  <span><i style="background:rgb(237 233 246);border-color:#a78bfa"></i>Sample</span>
  <span><i style="background:${C.amber[0]};border-color:#f59e0b"></i>${o.deqiOnly ? 'In production' : 'Supplier · production'}</span>
  ${o.deqiOnly ? '' : `<span><i style="background:${C.slate[0]};border-color:#94a3b8"></i>RDX · to Brazil (${LOGISTICS_TARGET_DAYS}d from the supplier's date)</span>`}
  <span><i style="background:${C.green[0]};border-color:#16a34a"></i>${o.deqiOnly ? 'Ready' : 'Done'}</span>
  <span><i style="background:${C.red[0]};border-color:#ef4444"></i>Overdue</span>
  <span><i style="border-color:#b91c1c;border-left-width:1.5px;width:0;height:8px;border-radius:0"></i>Today</span>
</div>` : ''}

${sections.table ? `<h2>${sections.chart ? 'Every order' : 'Orders'}</h2>
<table class="list">
  <thead><tr>${tableHead}</tr></thead>
  <tbody>${rows.map(r => tableRow(r, o.deqiOnly)).join('')}</tbody>
</table>` : ''}

<div class="foot"><span>impordx.netlify.app</span><span>${esc(o.generatedAt)}</span></div>
</body></html>`
}
