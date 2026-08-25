import { COLLECTIONS } from './utils'

// The import template is not a new format — it is exactly what Export RFQ
// writes. Export a card, edit it in Excel, import it back: the round trip is
// the whole point, and it means there is only one layout to keep correct.

export interface ParsedItem {
  reference_code: string
  description: string
  size: string
  quantity: number
  unit_price_usd?: number
  row: number          // the Excel row, so an error can point at it
}

export interface ParsedSheet {
  title: string
  client_name: string
  collection: string
  deadline: string
  description?: string
  outside_material: string
  inside_material: string
  logo_technique_outside: string
  logo_text_outside: string
  logo_color_outside: string
  logo_technique_inside: string
  logo_text_inside: string
  logo_color_inside: string
  items: ParsedItem[]
  errors: string[]
  warnings: string[]
}

const CARD_SHEET = 'Card Info'
const ITEMS_SHEET = 'Line Items'

const clean = (v: unknown) => String(v ?? '').trim()

const digits = (v: unknown) => clean(v).replace(/[^\d.,-]/g, '')

/**
 * Quantities are whole pieces, so every separator in them is a thousands
 * separator. Reading "1.000" as 1 would put a single box on an order that
 * asked for a thousand.
 */
function parseCount(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : undefined
  const text = digits(v).replace(/[.,]/g, '')
  if (!text) return undefined
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Prices run to three decimals and reach us written either way — "0,415" from
 * a Brazilian keyboard, "1,234.56" from an English one. Whichever separator
 * comes last is the decimal point; everything before it groups thousands.
 */
function parseDecimal(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const text = digits(v)
  if (!text) return undefined
  const cut = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','))
  const n = cut === -1
    ? Number(text.replace(/[.,]/g, ''))
    : Number(`${text.slice(0, cut).replace(/[.,]/g, '')}.${text.slice(cut + 1).replace(/[.,]/g, '')}`)
  return Number.isFinite(n) ? n : undefined
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * The day a Date lands on, rounded to the nearest local midnight. Excel stores
 * a date as a fraction of days and the conversion back is lossy: a cell typed
 * as 09/09/2026 comes out of the reader as 08/09/2026 23:59:59.999. Reading
 * the calendar fields straight off that loses a day on every import.
 */
function calendarDay(d: Date): string {
  const snapped = new Date(d.getTime() + 12 * 60 * 60 * 1000)
  return iso(snapped.getFullYear(), snapped.getMonth(), snapped.getDate())
}

/**
 * A deadline is a wall-clock date, not an instant, so it is read off the
 * calendar and never through UTC. Going via toISOString would move every
 * deadline a day back for anyone importing east of Greenwich — which is where
 * DEQI sits.
 */
function parseDate(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return calendarDay(v)
  if (typeof v === 'number' && v > 0) {
    // Excel's epoch is 1899-12-30 once its 1900 leap-year bug is accounted for.
    // The serial counts whole days, so read it back in UTC to stay on that day.
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? '' : iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  const text = clean(v)
  if (!text || text === '—') return ''
  // Already a plain date: take it as written rather than letting Date parse it
  // as UTC midnight and hand back the day before.
  const already = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (already) return `${already[1]}-${already[2]}-${already[3]}`
  // dd/mm/yyyy next: a Brazilian types it that way and Date would read it as US.
  const br = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  const d = new Date(text)
  return isNaN(d.getTime()) ? '' : calendarDay(d)
}

/**
 * Reads the Card Info sheet, which is label/value rows grouped under section
 * headers. The label alone is ambiguous — "Material" appears twice and
 * "Technique" four times — so each value is keyed by its section as well.
 */
function readCardSheet(rows: unknown[][]): Map<string, string> {
  const out = new Map<string, string>()
  let section = ''
  for (const row of rows) {
    const a = clean(row?.[0])
    const b = clean(row?.[1])
    if (!a) continue
    // A row with a lone all-caps cell is a section header, not a field.
    if (!b && a === a.toUpperCase() && /[A-Z]/.test(a)) { section = a; continue }
    if (!b) continue
    out.set(`${section}|${a.toUpperCase()}`, b === '—' ? '' : b)
  }
  return out
}

export function parseCardWorkbook(wb: {
  SheetNames: string[]
  Sheets: Record<string, unknown>
}, utils: { sheet_to_json: (ws: unknown, opts: unknown) => unknown[] }): ParsedSheet {
  const errors: string[] = []
  const warnings: string[] = []

  const cardWs = wb.Sheets[CARD_SHEET]
  const itemsWs = wb.Sheets[ITEMS_SHEET]
  if (!cardWs) {
    errors.push(`The file has no "${CARD_SHEET}" sheet. Use the template — sheet names matter.`)
  }

  const f = cardWs
    ? readCardSheet(utils.sheet_to_json(cardWs, { header: 1, raw: true }) as unknown[][])
    : new Map<string, string>()

  const get = (section: string, label: string) => f.get(`${section}|${label}`) ?? ''

  const parsed: ParsedSheet = {
    title: get('PRODUCT SPECIFICATIONS', 'TITLE'),
    client_name: get('PRODUCT SPECIFICATIONS', 'CLIENT'),
    collection: get('PRODUCT SPECIFICATIONS', 'COLLECTION'),
    deadline: parseDate(get('PRODUCT SPECIFICATIONS', 'DEADLINE')),
    description: get('PRODUCT SPECIFICATIONS', 'DESCRIPTION') || undefined,
    outside_material: get('OUTSIDE MATERIAL', 'MATERIAL'),
    inside_material: get('INSIDE MATERIAL', 'MATERIAL'),
    logo_technique_outside: get('OUTSIDE LOGO', 'TECHNIQUE'),
    logo_text_outside: get('OUTSIDE LOGO', 'TEXT'),
    logo_color_outside: get('OUTSIDE LOGO', 'COLOR'),
    logo_technique_inside: get('INSIDE LOGO', 'TECHNIQUE'),
    logo_text_inside: get('INSIDE LOGO', 'TEXT'),
    logo_color_inside: get('INSIDE LOGO', 'COLOR'),
    items: [],
    errors,
    warnings,
  }

  if (cardWs && parsed.title.length < 2) {
    errors.push('Title is missing or too short — it is the only field a card cannot do without.')
  }
  if (parsed.collection && !COLLECTIONS.includes(parsed.collection)) {
    warnings.push(`Collection "${parsed.collection}" is not one of the known collections. `
      + 'It will be saved as typed, but sizes will not be offered as a list.')
  }
  if (get('PRODUCT SPECIFICATIONS', 'DEADLINE') && !parsed.deadline) {
    warnings.push('Deadline could not be read as a date and will be left empty.')
  }

  if (itemsWs) {
    const rows = utils.sheet_to_json(itemsWs, { header: 1, raw: true }) as unknown[][]
    const header = (rows[0] ?? []).map(c => clean(c).toUpperCase())
    const col = (name: string) => header.indexOf(name)
    const iRef = col('INTERNAL REF'), iDesc = col('DESCRIPTION'), iSize = col('SIZE')
    const iQty = col('QTY'), iPrice = col('UNIT PRICE (USD)'), iFile = col('REFERENCE FILE')

    if (iQty === -1) {
      errors.push(`The "${ITEMS_SHEET}" sheet has no QTY column.`)
    } else {
      let sawFile = false
      rows.slice(1).forEach((row, idx) => {
        const excelRow = idx + 2
        const ref = clean(row[iRef])
        const desc = clean(row[iDesc])
        // The export writes a TOTAL row at the bottom; skip it rather than
        // importing it as a phantom line.
        if (desc.toUpperCase() === 'TOTAL' && !ref) return
        if (!ref && !desc) return   // a blank row is padding, not an error

        const qty = parseCount(row[iQty])
        if (qty == null || qty <= 0) {
          errors.push(`Row ${excelRow}: quantity is missing or not a positive number.`)
          return
        }
        if (iFile !== -1 && clean(row[iFile])) sawFile = true

        parsed.items.push({
          reference_code: ref === '—' ? '' : ref,
          description: desc === '—' ? '' : desc,
          size: clean(row[iSize]) === '—' ? '' : clean(row[iSize]),
          quantity: qty,
          unit_price_usd: parseDecimal(row[iPrice]),
          row: excelRow,
        })
      })
      if (sawFile) {
        warnings.push('The REFERENCE FILE column names images that a spreadsheet cannot carry. '
          + 'Attach those to the line items after importing.')
      }
    }
  } else if (cardWs) {
    warnings.push(`No "${ITEMS_SHEET}" sheet — the card will be created without line items.`)
  }

  return parsed
}

/** Card fields ready for insert, with the material codes folded back in. */
export function toCardFields(p: ParsedSheet) {
  return {
    title: p.title,
    client_name: p.client_name || undefined,
    collection: p.collection || undefined,
    deadline: p.deadline || undefined,
    description: p.description?.trim() || undefined,
    outside_material: p.outside_material || undefined,
    inside_material: p.inside_material || undefined,
    logo_technique_outside: p.logo_technique_outside || undefined,
    logo_text_outside: p.logo_text_outside || undefined,
    logo_color_outside: p.logo_color_outside || undefined,
    logo_technique_inside: p.logo_technique_inside || undefined,
    logo_text_inside: p.logo_text_inside || undefined,
    logo_color_inside: p.logo_color_inside || undefined,
    quantity: p.items.reduce((s, i) => s + i.quantity, 0) || undefined,
  }
}

/** The blank workbook handed out as the template, in the export's own shape. */
export function templateRows() {
  const card: (string | number)[][] = [
    ['RDX SUPPLIER HUB — REQUEST FOR QUOTATION'],
    ['Ref: (left blank — the hub assigns it)', '', 'Date:'],
    [],
    ['PRODUCT SPECIFICATIONS'],
    ['Title', ''],
    ['Client', ''],
    ['Collection', `e.g. ${COLLECTIONS.slice(0, 3).join(' / ')}`],
    ['Deadline', 'dd/mm/yyyy'],
    ['Description', ''],
    [],
    ['OUTSIDE MATERIAL'],
    ['Material', ''],
    [],
    ['INSIDE MATERIAL'],
    ['Material', ''],
    [],
    ['OUTSIDE LOGO'],
    ['Technique', ''],
    ['Text', ''],
    ['Color', ''],
    [],
    ['INSIDE LOGO'],
    ['Technique', ''],
    ['Text', ''],
    ['Color', ''],
  ]
  const items: (string | number)[][] = [
    ['INTERNAL REF', 'DESCRIPTION', 'SIZE', 'QTY', 'UNIT PRICE (USD)', 'REFERENCE FILE'],
    ['R1', 'Ring insert', '5 x 6 x 4,5', 300, '', ''],
    ['', '', '', '', '', ''],
  ]
  return { card, items }
}
