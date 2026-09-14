// The delivery clock, checked against the cases that actually cost money.
//
//   node_modules/.bin/jiti scripts/check-delivery-schedule.ts
//
// Run it under TZ=Asia/Shanghai too. These are plain calendar days and must not
// shift with the reader's clock — the supplier reads the same number we do.

import {
  orderSchedule, logisticsOutcome, LOGISTICS_TARGET_DAYS,
  orderClock, deliveryAnchor, ORDER_LEG_DAYS,
  supplierClock, DEFAULT_CLOCK, collectionsFor,
  errorText,
} from '../src/lib/utils'
import { statusLabel } from '../src/types'

let bad = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${got}${ok ? '' : ` (expected ${want})`}`)
}

check('two legs make 120', ORDER_LEG_DAYS * 2, 120)

// 120 days from the approval itself. A day later approved is a day later
// delivered — no cut-off, no batch, nothing to miss.
const tenth = orderClock({ sample_approved_at: '2026-09-10', status: 'Placed' })!
const eleventh = orderClock({ sample_approved_at: '2026-09-11', status: 'Placed' })!
check('approved 10 Sep delivers', tenth.total.target, '2027-01-08')
check('approved 11 Sep delivers', eleventh.total.target, '2027-01-09')
check('ready date is half way', tenth.deqi.target, '2026-11-09')
check('anchor kind', tenth.anchor, 'sample')
check('anchor date is the approval', tenth.anchorDate, '2026-09-10')

// Month lengths and the year boundary are the calendar's problem, not ours.
check('crosses the new year',
  orderClock({ sample_approved_at: '2026-12-31', status: 'Placed' })!.total.target,
  '2027-04-30')
check('starts on a 31st',
  orderClock({ sample_approved_at: '2026-01-31', status: 'Placed' })!.total.target,
  '2026-05-31')
check('runs through February',
  orderClock({ sample_approved_at: '2027-01-15', status: 'Placed' })!.total.target,
  '2027-05-15')

// A confirmed quote promoted straight to Orders was never a sample.
const noSample = orderClock({ order_confirmed_at: '2026-08-18', status: 'Placed' })!
check('fallback anchor kind', noSample.anchor, 'confirmation')
check('fallback anchor date', noSample.anchorDate, '2026-08-18')
check('fallback still delivers at 120', noSample.total.target, '2026-12-16')

// The sample wins whenever both are present: it is the promise to the client.
const both = orderClock({
  sample_approved_at: '2026-09-10', order_confirmed_at: '2026-09-20', status: 'Placed',
})!
check('sample beats confirmation', both.anchorDate, '2026-09-10')

// Nothing to anchor on means no clock at all, not a clock starting today.
check('no anchor at all', orderClock({ status: 'Placed' }), null)

// An order sitting in PI Requested has no order_confirmed_at — that stamp only
// lands at PI Approved. It still has a schedule, and every view of it must
// agree. The Gantt kept its own copy of this rule and dropped two live orders.
const awaitingPi = { sample_approved_at: '2026-08-25', status: 'PI Requested' }
check('PI Requested still anchors', deliveryAnchor(awaitingPi)?.date, '2026-08-25')
check('and the clock agrees', orderClock(awaitingPi)?.anchorDate, '2026-08-25')
check('anchor kind matches clock',
  deliveryAnchor(awaitingPi)?.kind, orderClock(awaitingPi)?.anchor)
check('no sample, no PI stamp', deliveryAnchor({ status: 'Purchasing' }), null)

// ---------------------------------------------------------------------------
// Two suppliers, two anchors.
//
// DEQI counts from the sample approval; Sconcept counts from the proforma,
// because Sconcept quotes far more than it samples and a sample approval there
// commits to nothing. Both run 60 + 60, so a card that carries the wrong
// supplier gives a plausible date on the wrong day — which is exactly the kind
// of error that survives a glance.

const deqi = { supplier: { short_name: 'DEQI' } }
const scon = { supplier: { short_name: 'Sconcept' } }

check('DEQI clock anchors on the sample',
  supplierClock('DEQI').anchor, 'sample')
check('Sconcept clock anchors on the proforma',
  supplierClock('Sconcept').anchor, 'proforma')
check('an unknown supplier falls back to DEQI',
  supplierClock('Nobody').anchor, DEFAULT_CLOCK.anchor)
check('a missing supplier falls back to DEQI',
  supplierClock(undefined).anchor, DEFAULT_CLOCK.anchor)

// The case the two rules disagree on: both stamps present.
const twoStamps = {
  sample_approved_at: '2026-09-10',
  order_confirmed_at: '2026-10-01',
  status: 'Placed',
}
check('DEQI reads the sample stamp',
  orderClock({ ...twoStamps, ...deqi })!.anchorDate, '2026-09-10')
check('Sconcept reads the proforma stamp',
  orderClock({ ...twoStamps, ...scon })!.anchorDate, '2026-10-01')
check('and they land 21 days apart',
  orderClock({ ...twoStamps, ...scon })!.total.target, '2027-01-29')
check('DEQI lands earlier',
  orderClock({ ...twoStamps, ...deqi })!.total.target, '2027-01-08')

// Sconcept with no proforma yet still shows a schedule rather than vanishing
// from the Gantt — and says which stamp it fell back to.
const sconNoPi = { sample_approved_at: '2026-09-10', status: 'PI Requested', ...scon }
check('Sconcept falls back to the sample', orderClock(sconNoPi)?.anchorDate, '2026-09-10')
check('and reports the fallback', orderClock(sconNoPi)?.anchor, 'sample')

// Both legs are still 60, so the totals stay 120 for either supplier.
check('Sconcept is still 120 end to end',
  supplierClock('Sconcept').productionDays + supplierClock('Sconcept').shippingDays, 120)

// Collections belong to the supplier, not to the hub.
check('DEQI keeps its catalogue', collectionsFor('DEQI').includes('Parma'), true)
check('Sconcept has no Parma', collectionsFor('Sconcept').includes('Parma'), false)
// `check` compares with ===, so an array has to be flattened to be compared.
check('Sconcept quotes custom', collectionsFor('Sconcept').join(','), 'Custom')
check('no supplier means the full list', collectionsFor(undefined).includes('Parma'), true)

// 'Under DEQI Revision' is a samples column every supplier sees. Sconcept must
// not read DEQI's name off its own board — that is the one fact the isolation
// exists to withhold, and it would be leaking through a column header.
check('Sconcept sees its own name',
  statusLabel('Under DEQI Revision', 'Sconcept'), 'Under Sconcept Revision')
check('DEQI still sees its own',
  statusLabel('Under DEQI Revision', 'DEQI'), 'Under DEQI Revision')
check('no supplier reads generic',
  statusLabel('Under DEQI Revision', undefined), 'Under Supplier Revision')
check('every other status is untouched',
  statusLabel('Approved', 'Sconcept'), 'Approved')
check('including on orders',
  statusLabel('In Production', 'Sconcept'), 'In Production')


// As duas falhas que um usuário não deve ler no original. A segunda é a que o
// Carlos recebeu ao tentar criar um card em 04/09.
check('recusa de política vira frase',
  errorText({ code: '42501', message: 'new row violates row-level security policy for table "cards"' }),
  'You do not have permission for this — ask Redantex to do it')
check('recusa sem código, pelo texto',
  errorText(new Error('new row violates row-level security policy')),
  'You do not have permission for this — ask Redantex to do it')
check('rede caída vira frase',
  errorText(new TypeError('Load failed')),
  'The connection dropped before this could be saved — check your internet and try again')
check('e o equivalente no Chrome',
  errorText(new TypeError('Failed to fetch')),
  'The connection dropped before this could be saved — check your internet and try again')
check('erro normal passa intacto',
  errorText(new Error('Purchase order number is required before leaving Purchasing')),
  'Purchase order number is required before leaving Purchasing')
check('nada continua nada', errorText(null), null)

// ---------------------------------------------------------------------------
// A meta de logística: 50 dias a partir da data que o fornecedor deu
// ---------------------------------------------------------------------------
// Duas réguas, medindo pessoas diferentes. O plano (60 + 60) mede o fornecedor
// contra o dia 60; a previsão (data dele + 50) mede a Redantex contra a data
// dele. Doani manteve os 120 como fallback: enquanto o fornecedor não fala, a
// promessa feita ao cliente é a de antes.

console.log('\n— a meta de logística —')
check('a meta é 50', LOGISTICS_TARGET_DAYS, 50)

const semData = orderSchedule({ sample_approved_at: '2026-08-12', status: 'Placed' })!
check('sem data do fornecedor: pronto no dia 60', semData.ready, '2026-10-11')
check('sem data do fornecedor: é o plano', semData.readyKind, 'plan')
check('sem data do fornecedor: chega no dia 120', semData.arrival, '2026-12-10')
check('sem data do fornecedor: janela de 60', semData.shippingDays, 60)

// o RIZZI de verdade: aprovado 12/08, DEQI disse 28/10
const rizzi = orderSchedule({ sample_approved_at: '2026-08-12', delivery_date: '2026-10-28', status: 'Placed' })!
check('com data: pronto é a data do fornecedor', rizzi.ready, '2026-10-28')
check('com data: é dele', rizzi.readyKind, 'supplier')
check('com data: chega 50 dias depois', rizzi.arrival, '2026-12-17')
check('com data: é previsão', rizzi.arrivalKind, 'forecast')
check('com data: janela de 50', rizzi.shippingDays, 50)
// e o dia 60 do plano continua existindo, para medir o atraso dele
check('o dia 60 do plano não some', rizzi.plannedReady, '2026-10-11')

// fornecedor que promete ANTES do dia 60 (DAVANZO: 24/08 → disse 12/10)
const cedo = orderSchedule({ sample_approved_at: '2026-08-24', delivery_date: '2026-10-12', status: 'Placed' })!
check('promessa antes do dia 60: chega antes do dia 120', cedo.arrival, '2026-12-01')

// o painel do card lê a mesma régua
const clk = orderClock({ sample_approved_at: '2026-08-12', delivery_date: '2026-10-28', status: 'Placed' })!
check('orderClock: alvo total = previsão', clk.total.target, '2026-12-17')
check('orderClock: perna do fornecedor termina na data dele', clk.deqi.target, '2026-10-28')
check('orderClock: janela da RDX é 50', clk.rdx.windowDays, 50)
check('orderClock sem data: janela da RDX é 60',
  orderClock({ sample_approved_at: '2026-08-12', status: 'Placed' })!.rdx.windowDays, 60)

console.log('\n— chegou de verdade —')
check('sem chegada: nada a medir', logisticsOutcome({ delivery_date: '2026-10-28' }), null)
check('sem data do fornecedor: nada a medir', logisticsOutcome({ arrived_at: '2026-12-10' }), null)
const dentro = logisticsOutcome({ delivery_date: '2026-10-28', arrived_at: '2026-12-10' })!
check('43 dias: dentro da meta', dentro.days, 43)
check('43 dias: onTarget', dentro.onTarget, true)
check('43 dias: nada acima', dentro.over, 0)
const limite = logisticsOutcome({ delivery_date: '2026-10-28', arrived_at: '2026-12-17' })!
check('50 em ponto: ainda dentro', limite.onTarget, true)
const fora = logisticsOutcome({ delivery_date: '2026-10-28', arrived_at: '2026-12-25' })!
check('58 dias: fora', fora.onTarget, false)
check('58 dias: 8 acima', fora.over, 8)
check('Arrived: perna da RDX concluída',
  orderClock({ sample_approved_at: '2026-08-12', delivery_date: '2026-10-28', arrived_at: '2026-12-10', status: 'Arrived' })!.rdx.done, true)
check('Shipped ainda não é concluída',
  orderClock({ sample_approved_at: '2026-08-12', delivery_date: '2026-10-28', status: 'Shipped' })!.rdx.done, false)

console.log(bad === 0 ? '\nAll good.' : `\n${bad} failure(s).`)
process.exit(bad === 0 ? 0 : 1)
