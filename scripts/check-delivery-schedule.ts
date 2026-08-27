// The delivery clock, checked against the cases that actually cost money.
//
//   node_modules/.bin/jiti scripts/check-delivery-schedule.ts
//
// Run it under TZ=Asia/Shanghai too. These are plain calendar days and must not
// shift with the reader's clock — the supplier reads the same number we do.

import { orderClock, ORDER_LEG_DAYS } from '../src/lib/utils'

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

console.log(bad === 0 ? '\nAll good.' : `\n${bad} failure(s).`)
process.exit(bad === 0 ? 0 : 1)
