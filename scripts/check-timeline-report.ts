// Os filtros do relatório da timeline, e o HTML que ele gera.
//   node_modules/.bin/jiti scripts/check-timeline-report.ts
import { buildRow, sortRows, Row } from '../src/lib/orderRows'
import {
  DEFAULT_FILTER, applyReportFilter, describeFilter, needsAttention, rowMonth, timelineReportHtml,
} from '../src/lib/timelineReport'
import { Card } from '../src/types'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const today = new Date(Date.UTC(2026, 8, 19))
const DEQI = { id: 'd', name: 'DEQI', short_name: 'DEQI' }
const SCO = { id: 's', name: 'Sconcept', short_name: 'Sconcept' }

function card(over: Partial<Card> & { supplier?: typeof DEQI }): Card {
  return {
    id: over.ref_number ?? 'x', board: 'orders', created_at: '2026-08-01T12:00:00Z',
    supplier_id: (over.supplier ?? DEQI).id, supplier: over.supplier ?? DEQI,
    title: 'box', ...over,
  } as unknown as Card
}

const cards: Card[] = [
  // Em produção, no prazo, chega em dezembro
  card({ ref_number: 'ORD-2026-10001', client_name: 'MJK', status: 'Placed', sample_approved_at: '2026-08-22', delivery_date: '2026-10-15' }),
  // Fornecedor passou do dia 60 (amostra 22/ago → dia 60 = 21/out; ele deu 28/out)
  card({ ref_number: 'ORD-2026-10002', client_name: 'RIZZI', status: 'Placed', sample_approved_at: '2026-08-22', delivery_date: '2026-10-28' }),
  // Ainda sem proforma, plano de 120 dias → chega em janeiro
  card({ ref_number: 'ORD-2026-10003', client_name: 'LIKALU', status: 'PI Requested', sample_approved_at: '2026-09-09' }),
  // Embarcado, Sconcept
  card({ ref_number: 'ORD-2026-10004', client_name: 'PRIVATE', status: 'Shipped', order_confirmed_at: '2026-09-14', delivery_date: '2026-09-08', supplier: SCO }),
  // Chegou, dentro da meta (45 dias)
  card({ ref_number: 'ORD-2026-10005', client_name: 'OFIRA', status: 'Arrived', sample_approved_at: '2026-05-01', delivery_date: '2026-07-01', arrived_at: '2026-08-15' }),
  // Atrasado: plano de 120 dias a partir de 1/mai já venceu em 29/ago
  card({ ref_number: 'ORD-2026-10006', client_name: 'MICCE', status: 'In Production', sample_approved_at: '2026-05-01' }),
]

const rows = sortRows(cards.map(c => buildRow(c, today)).filter((r): r is Row => !!r), false)
check('every synthetic card becomes a row', rows.length === 6, String(rows.length))

const refs = (rs: Row[]) => rs.map(r => r.card.ref_number!.slice(-5)).sort().join(',')

// ── sem filtro ────────────────────────────────────────────────────────────────
check('default filter keeps everything', applyReportFilter(rows, DEFAULT_FILTER, false).length === 6)

// ── fornecedor ────────────────────────────────────────────────────────────────
check('supplier filter keeps only Sconcept', refs(applyReportFilter(rows, { ...DEFAULT_FILTER, supplier: 's' }, false)) === '10004')
check('supplier filter: DEQI gets the other five', applyReportFilter(rows, { ...DEFAULT_FILTER, supplier: 'd' }, false).length === 5)

// ── cliente ───────────────────────────────────────────────────────────────────
check('client filter is exact', refs(applyReportFilter(rows, { ...DEFAULT_FILTER, client: 'MJK' }, false)) === '10001')
check('client filter: unknown client matches nothing', applyReportFilter(rows, { ...DEFAULT_FILTER, client: 'NOBODY' }, false).length === 0)

// ── etapa ─────────────────────────────────────────────────────────────────────
check('stage: before proforma', refs(applyReportFilter(rows, { ...DEFAULT_FILTER, stages: ['before'] }, false)) === '10003')
check('stage: in production', refs(applyReportFilter(rows, { ...DEFAULT_FILTER, stages: ['production'] }, false)) === '10001,10002,10006')
check('stage: shipped', refs(applyReportFilter(rows, { ...DEFAULT_FILTER, stages: ['shipped'] }, false)) === '10004')
check('stage: arrived', refs(applyReportFilter(rows, { ...DEFAULT_FILTER, stages: ['arrived'] }, false)) === '10005')
check('stage: none selected → nothing', applyReportFilter(rows, { ...DEFAULT_FILTER, stages: [] }, false).length === 0)

// ── mês ───────────────────────────────────────────────────────────────────────
const byRef = Object.fromEntries(rows.map(r => [r.card.ref_number!.slice(-5), r]))
check('rowMonth: forecast = supplier date + 50 → Dec', rowMonth(byRef['10001'], false) === '2026-12', rowMonth(byRef['10001'], false))
check('rowMonth: plan = anchor + 120 → Jan', rowMonth(byRef['10003'], false) === '2027-01', rowMonth(byRef['10003'], false))
check('rowMonth: arrived uses the real arrival month', rowMonth(byRef['10005'], false) === '2026-08', rowMonth(byRef['10005'], false))
check('rowMonth for the supplier is the ready month', rowMonth(byRef['10001'], true) === '2026-10', rowMonth(byRef['10001'], true))
check('month window Dec–Dec', refs(applyReportFilter(rows, { ...DEFAULT_FILTER, monthFrom: '2026-12', monthTo: '2026-12' }, false)) === '10001,10002')
check('month from Jan onward', refs(applyReportFilter(rows, { ...DEFAULT_FILTER, monthFrom: '2027-01' }, false)) === '10003')
check('month until Aug', refs(applyReportFilter(rows, { ...DEFAULT_FILTER, monthTo: '2026-08' }, false)) === '10005,10006')

// ── atenção ───────────────────────────────────────────────────────────────────
check('needsAttention: on time → no', !needsAttention(byRef['10001'], false))
check('needsAttention: supplier past day 60 → yes', needsAttention(byRef['10002'], false))
check('needsAttention: overdue plan → yes', needsAttention(byRef['10006'], false))
check('needsAttention: arrived is never attention', !needsAttention(byRef['10005'], false))
check('attention filter', refs(applyReportFilter(rows, { ...DEFAULT_FILTER, attentionOnly: true }, false)) === '10002,10006')

// ── combinação ────────────────────────────────────────────────────────────────
check('filters combine with AND',
  refs(applyReportFilter(rows, { ...DEFAULT_FILTER, supplier: 'd', stages: ['production'], attentionOnly: true }, false)) === '10002,10006')

// ── descrição ─────────────────────────────────────────────────────────────────
check('describe: default', describeFilter(DEFAULT_FILTER, undefined, false) === 'All suppliers', describeFilter(DEFAULT_FILTER, undefined, false))
check('describe: everything set',
  describeFilter({ ...DEFAULT_FILTER, supplier: 'd', client: 'MJK', stages: ['production'], monthFrom: '2026-10', monthTo: '2026-12', attentionOnly: true }, 'DEQI', false)
    === 'DEQI · MJK · Placed · in production · Landing Oct 2026 – Dec 2026 · Needing attention',
  describeFilter({ ...DEFAULT_FILTER, supplier: 'd', client: 'MJK', stages: ['production'], monthFrom: '2026-10', monthTo: '2026-12', attentionOnly: true }, 'DEQI', false))
check('describe: one month reads as one month',
  describeFilter({ ...DEFAULT_FILTER, monthFrom: '2026-12', monthTo: '2026-12' }, undefined, false) === 'All suppliers · Landing Dec 2026',
  describeFilter({ ...DEFAULT_FILTER, monthFrom: '2026-12', monthTo: '2026-12' }, undefined, false))
check('describe: supplier login never names a supplier',
  !describeFilter({ ...DEFAULT_FILTER, supplier: 'd' }, 'DEQI', true).includes('DEQI'))

// ── HTML ──────────────────────────────────────────────────────────────────────
const opts = { today, deqiOnly: false, scope: 'All suppliers', generatedBy: 'Test', generatedAt: '19 Sept 2026, 10:00 BRT' }
const html = timelineReportHtml(rows, opts)
check('html names every order', cards.every(c => html.includes(c.ref_number!)))
check('html: supplier names appear for Redantex', html.includes('Sconcept') && html.includes('DEQI'))
check('html: no money anywhere', !/R\$|USD|\$\s?\d/.test(html))
check('html: sections can be dropped', !timelineReportHtml(rows, { ...opts, sections: { chart: false, table: true } }).includes('class="gantt"'))
check('html: table can be dropped', !timelineReportHtml(rows, { ...opts, sections: { chart: true, table: false } }).includes('class="list"'))
check('html: client names are escaped',
  timelineReportHtml([{ ...rows[0], card: { ...rows[0].card, client_name: 'A<b>&' } }], opts).includes('A&lt;b&gt;&amp;'))

const supplierHtml = timelineReportHtml(sortRows(rows, true), { ...opts, deqiOnly: true, scope: '' })
check('supplier html: no supplier names', !supplierHtml.includes('Sconcept') && !supplierHtml.includes('DEQI'))
check('supplier html: no Brazil leg', !supplierHtml.includes('Lands in Brazil') && !supplierHtml.includes('>RDX<'))

console.log(failures ? `\n${failures} FAILED` : '\nall good')
process.exit(failures ? 1 : 0)
