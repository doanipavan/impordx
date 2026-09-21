// Migration 045 against the real database, inside a transaction that is
// always rolled back: categories on upload, the verdict following the
// category, and the PI Requested gate.
//
//   node scripts/check-attachment-kinds.mjs            # rules already applied
//   node scripts/check-attachment-kinds.mjs --apply    # apply 045 first (still rolled back)
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const { Client } = createRequire(join(homedir(), '.rdx-dbtool/db.mjs'))('pg')
const db = new Client({ connectionString: readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim(), ssl: { rejectUnauthorized: false } })

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// Runs a statement expected to fail, inside a savepoint so the transaction survives.
async function refused(sql, params = []) {
  await db.query('savepoint s')
  try { await db.query(sql, params); await db.query('release savepoint s'); return null }
  catch (e) { await db.query('rollback to savepoint s'); return e.message }
}

try {
  await db.connect()
  await db.query('begin')
  if (process.argv.includes('--apply')) {
    await db.query(readFileSync('supabase/migrations/045_every_upload_says_what_it_is.sql', 'utf8'))
    console.log('045 applied inside the transaction')
  }

  const { rows: [me] } = await db.query(`select id from users where email = 'doanipavan@me.com'`)
  const { rows: [deqi] } = await db.query(`select id from suppliers where short_name = 'DEQI'`)

  // A throwaway order at Commercial that satisfies every earlier gate, so the
  // only thing between it and PI Requested is the new rule.
  const { rows: [card] } = await db.query(`
    insert into cards (board, status, title, client_name, ref_number, supplier_id, purchase_order, sales_order, created_by)
    values ('orders', 'Commercial', 'gate test', 'TEST', 'ORD-2026-99999', $1, 'PO-TEST', 'SO-TEST', $2) returning id`, [deqi.id, me.id])
  const { rows: [item] } = await db.query(`
    insert into card_items (card_id, description, quantity, unit_price_usd, erp_code) values ($1, 'box', 1, 1.5, 'DEV-1') returning id`, [card.id])
  await db.query(`insert into card_item_pricing (item_id, sale_price_brl) values ($1, 10)`, [item.id])

  const file = (kind) => [card.id, me.id, `f-${kind}.png`, `${card.id}/f.png`, 'image/png', 10, kind]
  const INSERT = `insert into attachments (card_id, user_id, filename, file_url, file_type, file_size, kind) values ($1,$2,$3,$4,$5,$6,$7) returning id, kind, review_status`

  // ── categories ───────────────────────────────────────────────────────────
  const noKind = await refused(INSERT, file(null))
  check('upload without a category is refused', !!noKind && noKind.includes('needs a category'), noKind ?? 'accepted')

  const bad = await refused(INSERT, file('artwork'))
  check('an unknown category is refused', !!bad && bad.includes('attachments_kind_check'), bad ?? 'accepted')

  const { rows: [ref] } = await db.query(INSERT, file('reference'))
  check('reference is never under review', ref.review_status === null, String(ref.review_status))

  const { rows: [quo] } = await db.query(INSERT, file('quotation'))
  check('quotation is never under review', quo.review_status === null, String(quo.review_status))

  const { rows: [smp] } = await db.query(INSERT, file('sample'))
  check('sample arrives pending review', smp.review_status === 'pending', String(smp.review_status))

  const { rows: [pi] } = await db.query(INSERT, file('pi'))
  check('PI arrives pending review', pi.review_status === 'pending', String(pi.review_status))

  const unset = await refused(`update attachments set kind = null where id = $1`, [smp.id])
  check('a category cannot be removed', !!unset && unset.includes('keeps its category'), unset ?? 'accepted')

  await db.query(`update attachments set review_status = 'approved', reviewed_at = now(), reviewed_by = $2, review_note = 'fine' where id = $1`, [smp.id, me.id])
  const { rows: [demoted] } = await db.query(`update attachments set kind = 'quotation' where id = $1 returning review_status, reviewed_at, review_note`, [smp.id])
  check('changing a sample to quotation clears its verdict', demoted.review_status === null && demoted.reviewed_at === null && demoted.review_note === null)

  const { rows: [promoted] } = await db.query(`update attachments set kind = 'sample' where id = $1 returning review_status`, [smp.id])
  check('changing back to sample reopens the review', promoted.review_status === 'pending', String(promoted.review_status))

  // A file from before the rule: no category, and still editable otherwise.
  const { rows: [old] } = await db.query(`select id from attachments where kind is null limit 1`)
  if (old) {
    const touched = await refused(`update attachments set filename = filename where id = $1`, [old.id])
    check('an old uncategorised file can still be edited', touched === null, touched ?? '')
    const { rows: [stillNull] } = await db.query(`select kind from attachments where id = $1`, [old.id])
    check('…and stays uncategorised (forward-only rule)', stillNull.kind === null)
  }

  // ── the gate ─────────────────────────────────────────────────────────────
  const MOVE = `update cards set status = 'PI Requested' where id = $1`
  const blocked = await refused(MOVE, [card.id])
  check('PI Requested refused with the sample still pending', !!blocked && blocked.includes('approved sample'), blocked ?? 'accepted')

  await db.query(`update attachments set review_status = 'rejected' where id = $1`, [smp.id])
  const blocked2 = await refused(MOVE, [card.id])
  check('…and with the sample rejected', !!blocked2 && blocked2.includes('approved sample'), blocked2 ?? 'accepted')

  await db.query(`update attachments set review_status = 'approved' where id = $1`, [smp.id])
  const allowed = await refused(MOVE, [card.id])
  check('PI Requested allowed once a sample file is approved', allowed === null, allowed ?? '')

  const { rows: [moved] } = await db.query(`select status from cards where id = $1`, [card.id])
  check('the card actually moved', moved.status === 'PI Requested', moved.status)

  // Straight from Commercial to Placed skips nothing: the gate is "reaching 3 or beyond".
  await db.query(`update cards set status = 'Commercial' where id = $1`, [card.id])
  await db.query(`update attachments set review_status = 'pending' where id = $1`, [smp.id])
  const jump = await refused(`update cards set status = 'Placed' where id = $1`, [card.id])
  check('jumping straight to Placed hits the same gate', !!jump && jump.includes('approved sample'), jump ?? 'accepted')

  // The earlier gates are untouched.
  await db.query(`update cards set purchase_order = null, status = 'Purchasing' where id = $1`, [card.id])
  const po = await refused(`update cards set status = 'Commercial' where id = $1`, [card.id])
  check('the Purchasing gate still asks for the PO', !!po && po.includes('Purchase order number'), po ?? 'accepted')

  // ── review only for sample and PI ────────────────────────────────────────
  // Approving a PI moves the card to PI Approved, so put it back where every
  // earlier gate is satisfied first.
  await db.query(`update attachments set review_status = 'approved' where id = $1`, [smp.id])
  await db.query(`update cards set purchase_order = 'PO-TEST', status = 'PI Requested' where id = $1`, [card.id])
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: me.id, role: 'authenticated' })])
  const notReviewable = await refused(`select review_attachment($1, 'approved', null)`, [ref.id])
  check('a reference file cannot be reviewed', !!notReviewable && notReviewable.includes('sample or a PI'), notReviewable ?? 'accepted')
  const reviewable = await refused(`select review_attachment($1, 'approved', null)`, [pi.id])
  check('a PI can still be reviewed', reviewable === null, reviewable ?? '')

  console.log(failures ? `\n${failures} FAILED` : '\nall good')
} finally {
  await db.query('rollback').catch(() => {})
  await db.end()
}
process.exit(failures ? 1 : 0)
