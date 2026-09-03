// The delivery clock, checked against the cases that actually cost money.
//
//   node_modules/.bin/jiti scripts/check-delivery-schedule.ts
//
// Run it under TZ=Asia/Shanghai too. These are plain calendar days and must not
// shift with the reader's clock — the supplier reads the same number we do.

import {
  orderClock, deliveryAnchor, ORDER_LEG_DAYS,
  supplierClock, DEFAULT_CLOCK, collectionsFor,
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

console.log(bad === 0 ? '\nAll good.' : `\n${bad} failure(s).`)
process.exit(bad === 0 ? 0 : 1)
