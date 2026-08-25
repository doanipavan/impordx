/**
 * Checks the Excel import parser. There is no test runner in this project, so
 * run it directly:
 *
 *   node_modules/.bin/jiti scripts/check-import-parser.ts
 *
 * Run it under a few timezones too — the date handling is the fragile part:
 *
 *   for tz in America/Sao_Paulo Asia/Shanghai UTC; do TZ=$tz node_modules/.bin/jiti scripts/check-import-parser.ts; done
 *
 * It has already caught two bugs that would have reached production: "1.000"
 * parsed as 1, and every deadline landing a day early.
 */
import * as XLSX from 'xlsx'
import { parseCardWorkbook, toCardFields, templateRows } from '../src/lib/cardSheet'

let pass = 0, fail = 0
const ok = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) { pass++; console.log('  ok  ', name) }
  else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : '') }
}
const build = (card: any[][], items: any[][] | null) => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(card), 'Card Info')
  if (items) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(items), 'Line Items')
  return parseCardWorkbook(wb as never, XLSX.utils as never)
}

// ---- 1. exactly what Export RFQ writes, round-tripped back in
console.log('\n1. round trip from the RFQ export shape')
const exported = [
  ['RDX SUPPLIER HUB — REQUEST FOR QUOTATION'],
  ['Ref: SMP-2026-10029', '', 'Date: 24 Aug 2026'],
  [],
  ['PRODUCT SPECIFICATIONS'],
  ['Title', 'MALFATI - BASED ON VELVET BOX'],
  ['Client', 'MALFATI'],
  ['Collection', 'Capri'],
  ['Deadline', '20 Aug 2026'],
  ['Description', 'Outside material code: velvet 17'],
  [],
  ['OUTSIDE MATERIAL'],
  ['Material', 'Velvet'],
  [],
  ['INSIDE MATERIAL'],
  ['Material', 'Suede'],
  [],
  ['OUTSIDE LOGO'],
  ['Technique', 'Debossing'],
  ['Text', '—'],
  ['Color', '—'],
  [],
  ['INSIDE LOGO'],
  ['Technique', 'Hot Stamping'],
  ['Text', '—'],
  ['Color', 'GOLD'],
]
const items = [
  ['INTERNAL REF', 'DESCRIPTION', 'SIZE', 'QTY', 'UNIT PRICE (USD)', 'REFERENCE FILE'],
  ['E27', 'Ring insert', '5 x 6 x 4,5', 400, '0.415', 'drawing.png'],
  ['P75', '—', '9 x 9 x 3,7', 300, '', ''],
  ['', 'TOTAL', '', 700, ''],
]
const r = build(exported, items)
ok('no errors', r.errors.length === 0, r.errors)
ok('title', r.title === 'MALFATI - BASED ON VELVET BOX', r.title)
ok('client', r.client_name === 'MALFATI')
ok('collection', r.collection === 'Capri')
ok('deadline parsed', r.deadline === '2026-08-20', r.deadline)
ok('OUTSIDE material not confused with INSIDE', r.outside_material === 'Velvet' && r.inside_material === 'Suede',
   [r.outside_material, r.inside_material])
ok('outside technique vs inside technique',
   r.logo_technique_outside === 'Debossing' && r.logo_technique_inside === 'Hot Stamping',
   [r.logo_technique_outside, r.logo_technique_inside])
ok('em-dash becomes empty', r.logo_text_outside === '' && r.logo_color_outside === '')
ok('inside colour kept', r.logo_color_inside === 'GOLD')
ok('TOTAL row skipped', r.items.length === 2, r.items.map(i => i.reference_code))
ok('price with dot', r.items[0].unit_price_usd === 0.415, r.items[0].unit_price_usd)
ok('em-dash description blanked', r.items[1].description === '', r.items[1].description)
ok('file column warns', r.warnings.some(w => w.includes('REFERENCE FILE')), r.warnings)
ok('quantity rolls up to the card', toCardFields(r).quantity === 700, toCardFields(r).quantity)

// ---- 2. what a person actually types
console.log('\n2. hand-typed values')
const typed = build(
  [['PRODUCT SPECIFICATIONS'], ['Title', 'J FORT case'], ['Collection', 'Parma'], ['Deadline', '25/12/2026']],
  [['INTERNAL REF', 'DESCRIPTION', 'SIZE', 'QTY', 'UNIT PRICE (USD)'],
   ['R1', 'Aliança', '5 x 6', '1.000', '0,415'],
   ['', '', '', '', ''],
   ['R2', 'Anel', '', 250.4, '$0.37']])
ok('dd/mm/yyyy read as December', typed.deadline === '2026-12-25', typed.deadline)
ok('thousands separator', typed.items[0].quantity === 1000, typed.items[0].quantity)
ok('comma decimal', typed.items[0].unit_price_usd === 0.415, typed.items[0].unit_price_usd)
ok('blank row skipped', typed.items.length === 2, typed.items.length)
ok('fractional qty rounded', typed.items[1].quantity === 250, typed.items[1].quantity)
ok('currency symbol stripped', typed.items[1].unit_price_usd === 0.37, typed.items[1].unit_price_usd)

// ---- 3. real Excel date cells
console.log('\n3. native Excel date cell')
const wbDate = XLSX.utils.book_new()
const wsDate = XLSX.utils.aoa_to_sheet([
  ['PRODUCT SPECIFICATIONS'], ['Title', 'Native date'], ['Deadline', new Date(2026, 8, 9)]])
XLSX.utils.book_append_sheet(wbDate, wsDate, 'Card Info')
const rd = parseCardWorkbook(
  XLSX.read(XLSX.write(wbDate, { type: 'array', bookType: 'xlsx' }), { type: 'array', cellDates: true }) as never,
  XLSX.utils as never)
ok('serial date keeps its calendar day', rd.deadline === '2026-09-09', rd.deadline)
ok('typed ISO date is taken as written',
   build([['PRODUCT SPECIFICATIONS'], ['Title', 'iso'], ['Deadline', '2026-09-09']], null).deadline === '2026-09-09')

// ---- 4. things that should be refused or flagged
console.log('\n4. refusals and warnings')
ok('missing title blocks',
   build([['PRODUCT SPECIFICATIONS'], ['Client', 'X']], null).errors.some(e => e.includes('Title')))
ok('wrong sheet name blocks', (() => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Title', 'x']]), 'Sheet1')
  return parseCardWorkbook(wb as never, XLSX.utils as never).errors.some(e => e.includes('Card Info'))
})())
ok('bad quantity names its row',
   build([['PRODUCT SPECIFICATIONS'], ['Title', 'Bad qty']],
         [['INTERNAL REF', 'QTY'], ['R1', 'abc']]).errors.some(e => e.includes('Row 2')))
ok('zero quantity refused',
   build([['PRODUCT SPECIFICATIONS'], ['Title', 'Zero']],
         [['INTERNAL REF', 'QTY'], ['R1', 0]]).errors.length === 1)
ok('unknown collection warns, does not block', (() => {
  const x = build([['PRODUCT SPECIFICATIONS'], ['Title', 'Odd'], ['Collection', 'Atlantis']], null)
  return x.errors.length === 0 && x.warnings.some(w => w.includes('Atlantis'))
})())
ok('unreadable deadline warns',
   build([['PRODUCT SPECIFICATIONS'], ['Title', 'Bad date'], ['Deadline', 'next tuesday']], null)
     .warnings.some(w => w.includes('Deadline')))
ok('no items sheet warns',
   build([['PRODUCT SPECIFICATIONS'], ['Title', 'No items']], null)
     .warnings.some(w => w.includes('Line Items')))

// ---- 5. the template we hand out
console.log('\n5. the shipped template')
const t = templateRows()
const tr = build(t.card, t.items)
ok('template parses', tr.errors.some(e => e.includes('Title')), tr.errors)
ok('template example row survives', tr.items.length === 1 && tr.items[0].quantity === 300, tr.items)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
