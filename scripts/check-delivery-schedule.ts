// The batch cut-off, checked against the cases that actually cost money.
//
//   node_modules/.bin/jiti scripts/check-delivery-schedule.ts
//
// Run it under TZ=Asia/Shanghai too. The dates here are plain calendar days and
// must not shift with the reader's clock — the supplier reads the same number.

import { batchCutoff, orderClock } from '../src/lib/utils'

let bad = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${got}${ok ? '' : ` (expected ${want})`}`)
}

// The 10th catches the batch; the 11th waits a whole month for the next one.
check('approved 01 Sep', batchCutoff('2026-09-01'), '2026-09-10')
check('approved 10 Sep', batchCutoff('2026-09-10'), '2026-09-10')
check('approved 11 Sep', batchCutoff('2026-09-11'), '2026-10-10')

// December rolls the year over; February is short but the cut-off is a fixed day.
check('approved 05 Dec', batchCutoff('2026-12-05'), '2026-12-10')
check('approved 15 Dec', batchCutoff('2026-12-15'), '2027-01-10')
check('approved 31 Jan', batchCutoff('2026-01-31'), '2026-02-10')
check('approved 11 Feb', batchCutoff('2026-02-11'), '2026-03-10')

check('no approval', batchCutoff(null), null)

// One day apart, thirty days apart on delivery. This is the whole point.
const onTime = orderClock({ sample_approved_at: '2026-09-10', status: 'Placed' })!
const missed = orderClock({ sample_approved_at: '2026-09-11', status: 'Placed' })!
check('delivery, approved the 10th', onTime.total.target, '2027-01-08')
check('delivery, approved the 11th', missed.total.target, '2027-02-07')
check('ready date, approved the 10th', onTime.deqi.target, '2026-11-09')
check('anchor kind', onTime.anchor, 'batch')

// A confirmed quote promoted straight to Orders was never a sample.
const noSample = orderClock({ order_confirmed_at: '2026-08-18', status: 'Placed' })!
check('fallback anchor kind', noSample.anchor, 'confirmation')
check('fallback anchor date', noSample.anchorDate, '2026-08-18')

// Nothing to anchor on means no clock at all, not a clock starting today.
check('no anchor at all', orderClock({ status: 'Placed' }), null)

console.log(bad === 0 ? '\nAll good.' : `\n${bad} failure(s).`)
process.exit(bad === 0 ? 0 : 1)
