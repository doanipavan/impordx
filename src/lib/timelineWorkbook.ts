import { Row } from './orderRows'
import { ReportFilter, STAGE_GROUPS } from './timelineReport'
import { Destination, destinationSummary } from './itemDestination'
import { ORDER_LEG_DAYS, logisticsOutcome, supplierNameOf } from './utils'
import { salespersonLabel } from '../types'

/**
 * A timeline em planilha: as mesmas linhas do gráfico, em três abas.
 *
 * Aqui não entra nada do `xlsx` nem do navegador. O que esta função devolve
 * são listas de objetos — o que o teste consegue ler no terminal, e o que o
 * componente entrega pronto para a biblioteca escrever. Uma exportação só é
 * conferível se alguém puder olhar os números sem abrir o Excel.
 *
 * As datas saem como `Date`, não como texto. Uma planilha com data em texto é
 * a que todo mundo acaba corrigindo à mão antes de conseguir ordenar.
 */

/** Um item como a exportação precisa dele, já com o preço de venda achatado. */
export interface ExportItem {
  card_id: string
  erp_code?: string | null
  reference_code?: string | null
  description?: string | null
  size?: string | null
  quantity: number | null
  unit_price_usd: number | null
  sale_price_brl?: number | null
  destination?: Destination | null
  sort_order?: number | null
}

export const ORDERS_HEADERS = [
  'Order', 'Client', 'Supplier', 'Status', 'Collection', 'Salesperson', 'PI number',
  'Goes to', 'Items', 'Pieces', 'Purchase USD', 'Sale BRL',
  'Anchor', 'Anchor from', 'Planned ready', 'Supplier date', 'Ready', 'Arrival',
  'Arrived on', 'Days left', 'Late', `Past day ${ORDER_LEG_DAYS}`, 'Days past',
] as const

export const ITEMS_HEADERS = [
  'Order', 'Client', 'Status', 'ERP (DEV)', 'Reference', 'Description', 'Size',
  'Goes to', 'Qty', 'Unit USD', 'Line total USD', 'Sale BRL', 'Line total BRL',
] as const

/** Colunas que o fornecedor não leva: a venda é a margem, e Arrived é o trânsito. */
const HIDDEN_FROM_SUPPLIER = new Set(['Sale BRL', 'Line total BRL', 'Arrived on'])

export function headersFor(headers: readonly string[], deqiOnly: boolean): string[] {
  return headers.filter(h => !(deqiOnly && HIDDEN_FROM_SUPPLIER.has(h)))
}

/** Toda coluna de data, para o formato de célula ser aplicado a ela. */
export const DATE_HEADERS = ['Anchor', 'Planned ready', 'Supplier date', 'Ready', 'Arrival', 'Arrived on']

/**
 * O dia de calendário como o Excel conta: dias desde 30/12/1899.
 *
 * Entregar um `Date` à biblioteca parecia o caminho óbvio e perde um dia. As
 * datas do hub nascem à meia-noite **UTC** — 14/09 às 00:00Z é 13/09 às 21:00
 * em São Paulo — e a conversão para célula lê o calendário **local**. O
 * arquivo saía inteiro um dia mais cedo, em silêncio, para qualquer um a oeste
 * de Greenwich. É o gêmeo, no sentido da escrita, da armadilha que o
 * `calendarDay` já resolve na leitura do Excel.
 *
 * O número é calculado só com os campos UTC da data, então não existe fuso na
 * conta. A célula vira número com formato de data: o Excel ordena, filtra e
 * agrupa como data, que é o ponto de exportar.
 */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

export function excelDay(d: Date): number {
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.round((utcMidnight - EXCEL_EPOCH) / 86_400_000)
}

const day = (d: Date | null): number | null => d ? excelDay(d) : null

type Cell = string | number | null
export type SheetRow = Record<string, Cell>

const money = (n: number) => Number(n.toFixed(2))

function itemsOf(items: ExportItem[], cardId: string): ExportItem[] {
  return items
    .filter(i => i.card_id === cardId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

/** "Client", "Stock", "2 client · 1 stock", ou vazio quando ninguém escolheu. */
export function goesToLabel(items: Array<{ destination?: Destination | null }>): string {
  const d = destinationSummary(items)
  if (d.only === 'stock') return 'Stock'
  if (d.only === 'client') return 'Client'
  if (d.mixed) return `${d.client} client · ${d.stock} stock`
  return ''
}

/**
 * Uma linha por pedido: a régua inteira, do carimbo que ancorou até a chegada.
 *
 * `Ready` é a data que vale — a do fornecedor quando ele deu uma, o dia 60 do
 * plano quando não deu — e `Planned ready` fica ao lado justamente para a
 * diferença entre as duas poder ser medida na planilha. Guardar só a que vale
 * é como um fornecedor que atrasa deixa de parecer atrasado.
 */
export function ordersSheet(rows: Row[], items: ExportItem[], deqiOnly: boolean): SheetRow[] {
  return rows.map(row => {
    const c = row.card
    const mine = itemsOf(items, c.id)
    const pieces = mine.reduce((n, i) => n + Number(i.quantity ?? 0), 0)
    const usd = mine.reduce((n, i) => n + Number(i.quantity ?? 0) * Number(i.unit_price_usd ?? 0), 0)
    const brl = mine.reduce((n, i) => n + Number(i.quantity ?? 0) * Number(i.sale_price_brl ?? 0), 0)
    const past = row.missedPromise && row.delivery
      ? Math.round((row.delivery.getTime() - row.plannedReady.getTime()) / 86_400_000)
      : null

    const full: SheetRow = {
      Order: c.ref_number ?? '',
      Client: c.client_name ?? '',
      Supplier: supplierNameOf(c) ?? '',
      Status: c.status ?? '',
      Collection: c.collection ?? '',
      Salesperson: salespersonLabel(c) ?? '',
      'PI number': c.pi_number ?? '',
      'Goes to': goesToLabel(mine),
      Items: mine.length,
      Pieces: pieces,
      'Purchase USD': usd > 0 ? money(usd) : null,
      'Sale BRL': brl > 0 ? money(brl) : null,
      // De onde o relógio partiu, e por qual carimbo — sem isso ninguém
      // consegue refazer a conta de 120 dias na própria planilha.
      Anchor: day(row.confirmed),
      'Anchor from': row.sampleStart ? 'Sample approved' : 'Proforma',
      'Planned ready': day(row.plannedReady),
      'Supplier date': day(row.delivery),
      Ready: day(row.handover),
      Arrival: day(row.arrival),
      'Arrived on': day(row.arrivedAt),
      'Days left': row.arrived ? null : (deqiOnly ? row.deqiLeft : row.totalLeft),
      Late: row.arrived
        ? (logisticsOutcome(c)?.onTarget === false ? 'Arrived late' : 'No')
        : ((deqiOnly ? row.deqiLeft : row.totalLeft) < 0 ? 'Yes' : 'No'),
      [`Past day ${ORDER_LEG_DAYS}`]: row.missedPromise ? 'Yes' : 'No',
      'Days past': past,
    }

    return pick(full, headersFor(ORDERS_HEADERS, deqiOnly))
  })
}

/**
 * Uma linha por produto dos mesmos pedidos.
 *
 * Um pedido sem item ainda aparece, com "(no items)" na descrição — a mesma
 * escolha da exportação do quadro. Sumir da planilha é como um pedido que
 * ninguém preencheu passa despercebido.
 */
export function itemsSheet(rows: Row[], items: ExportItem[], deqiOnly: boolean): SheetRow[] {
  const out: SheetRow[] = []
  for (const row of rows) {
    const c = row.card
    const base = { Order: c.ref_number ?? '', Client: c.client_name ?? '', Status: c.status ?? '' }
    const mine = itemsOf(items, c.id)

    if (mine.length === 0) {
      out.push(pick({
        ...base, 'ERP (DEV)': '', Reference: '', Description: '(no items)', Size: '',
        'Goes to': '', Qty: null, 'Unit USD': null, 'Line total USD': null,
        'Sale BRL': null, 'Line total BRL': null,
      }, headersFor(ITEMS_HEADERS, deqiOnly)))
      continue
    }

    for (const i of mine) {
      const qty = Number(i.quantity ?? 0)
      const unit = i.unit_price_usd == null ? null : Number(i.unit_price_usd)
      const sale = i.sale_price_brl == null ? null : Number(i.sale_price_brl)
      out.push(pick({
        ...base,
        'ERP (DEV)': i.erp_code ?? '',
        Reference: i.reference_code ?? '',
        Description: i.description ?? '',
        Size: i.size ?? '',
        'Goes to': i.destination ? (i.destination === 'stock' ? 'Stock' : 'Client') : '',
        Qty: qty,
        'Unit USD': unit,
        'Line total USD': unit == null ? null : money(qty * unit),
        'Sale BRL': sale,
        'Line total BRL': sale == null ? null : money(qty * sale),
      }, headersFor(ITEMS_HEADERS, deqiOnly)))
    }
  }
  return out
}

/**
 * A aba que diz o que o arquivo é.
 *
 * Duas planilhas da mesma semana, com filtros diferentes, são indistinguíveis
 * daqui a um mês. Esta aba responde "que exportação é essa" sem depender de
 * alguém ter nomeado o arquivo direito.
 */
export function filtersSheet(
  f: ReportFilter, supplierName: string | undefined,
  counts: { matched: number; total: number }, generatedAt: string, deqiOnly: boolean,
): SheetRow[] {
  const stages = f.stages.length === STAGE_GROUPS.length
    ? 'All stages'
    : STAGE_GROUPS.filter(g => f.stages.includes(g.id)).map(g => g.label).join(', ') || 'None'

  const lines: Array<[string, Cell]> = [
    ['Generated', generatedAt],
    ['Orders in file', counts.matched],
    ['Orders on the board', counts.total],
    ['Supplier', deqiOnly ? (supplierName ?? '') : (f.supplier === 'all' ? 'All suppliers' : supplierName ?? '')],
    ['Client', f.client || 'All clients'],
    ['Collection', f.collection || 'All collections'],
    ['Salesperson', f.salesperson || 'Everyone'],
    ['Stage', stages],
    [deqiOnly ? 'Ready from' : 'Landing from', f.monthFrom || 'Any month'],
    [deqiOnly ? 'Ready until' : 'Landing until', f.monthTo || 'Any month'],
    ['Needing attention only', f.attentionOnly ? 'Yes' : 'No'],
  ]
  // O destino não existe para o fornecedor, então nem a linha do filtro vai.
  if (!deqiOnly) {
    lines.push(['Goes to', f.destination === 'all' ? 'Client and stock'
      : f.destination === 'stock' ? 'With stock items' : 'Client only'])
  }

  return lines.map(([Filter, Value]) => ({ Filter, Value }))
}

export const FILTERS_HEADERS = ['Filter', 'Value'] as const

/** Só as colunas pedidas, na ordem pedida. */
function pick(row: SheetRow, headers: string[]): SheetRow {
  const out: SheetRow = {}
  for (const h of headers) out[h] = row[h] ?? null
  return out
}

/** redantex-timeline-2026-10-03.xlsx */
export function workbookFileName(stamp: string): string {
  return `redantex-timeline-${stamp}.xlsx`
}
