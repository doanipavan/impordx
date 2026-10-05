/**
 * A planilha da timeline, conferida sem Excel e sem navegador.
 *
 *   node_modules/.bin/jiti scripts/check-timeline-workbook.ts
 *
 * Os erros que importam numa exportação são silenciosos: uma coluna que o
 * fornecedor não devia levar e leva, uma data que sai como texto e não ordena,
 * um pedido sem item que some do arquivo. Nenhum deles dá erro na tela — todos
 * aparecem na mão de quem abre o arquivo.
 */
import {
  ordersSheet, itemsSheet, filtersSheet, headersFor, goesToLabel, workbookFileName,
  ORDERS_HEADERS, ITEMS_HEADERS, DATE_HEADERS, ExportItem, excelDay, stampDay, plainDay,
} from '../src/lib/timelineWorkbook'
import { DEFAULT_FILTER, applyReportFilter, STAGE_GROUPS } from '../src/lib/timelineReport'
import { destinationSummary } from '../src/lib/itemDestination'
import { buildRow, Row, todayInSaoPaulo } from '../src/lib/orderRows'
import { Card } from '../src/types'

let passed = 0
const failures: string[] = []
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

// Datas relativas: uma data fixa sai sozinha da régua com o tempo passando, e
// o teste passa a medir outra coisa sem ninguém ter tocado no código.
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

const card = (over: Partial<Card> = {}): Card => ({
  id: 'c1', board: 'orders', status: 'In Production', title: 'MJK  - BASED ON TURIM',
  ref_number: 'ORD-2026-10024', ref_root: '2026-10024', priority: 'medium',
  client_name: 'MJK', collection: 'Turim', pi_number: 'YUQ508-1322392',
  purchase_order: '002575', sales_order: '01015919',
  salesperson_name: 'Antonio Mezzomo',
  outside_material: 'PU Leather', outside_material_code: 'no#20 - st251',
  inside_material: 'PU Leather', inside_material_code: 'no#02 - st251',
  logo_technique_outside: 'Debossing', logo_color_outside: 'NO COLOR',
  logo_technique_inside: 'Hot Stamping', logo_color_inside: 'GOLD',
  value_brl: 24250, quantity: 750,
  sample_approved_at: day(-30), created_at: day(-30),
  ...over,
} as unknown as Card)

const today = todayInSaoPaulo()
const rowOf = (c: Card) => buildRow(c, today)!

const item = (over: Partial<ExportItem> = {}): ExportItem => ({
  card_id: 'c1', erp_code: '0401626', reference_code: 'E20', description: 'E20 — clip',
  size: '7 x 7 x 6 cm', quantity: 300, unit_price_usd: 2.21, sale_price_brl: 19.9,
  destination: 'client', sort_order: 0, ...over,
})

// --------------------------------------------------------------- a aba Orders

const rows: Row[] = [rowOf(card())]
const items = [item(), item({ destination: 'stock', quantity: 100, unit_price_usd: 4, sale_price_brl: 30, sort_order: 1 })]
const [o] = ordersSheet(rows, items, false)

check('a referência do pedido abre a linha', o.Order === 'ORD-2026-10024')
check('o vendedor do card entra', o.Salesperson === 'Antonio Mezzomo')
check('a purchase order entra', o['Purchase order'] === '002575')
check('a sales order entra', o['Sales order'] === '01015919')
check('o valor do card em reais entra', o['Card value BRL'] === 24250)
// A coluna existe no banco e está preenchida em 32 dos 34 pedidos. O código
// já morou dentro da descrição; ler de lá hoje devolveria vazio.
check('o código do material vem da coluna, não da descrição',
  o['Outside code'] === 'no#20 - st251' && o['Inside code'] === 'no#02 - st251')
check('as três partes do logo externo saem separadas',
  o['Outside logo'] === 'Debossing' && o['Outside logo colour'] === 'NO COLOR')
check('a aba Orders leva as 54 colunas', ORDERS_HEADERS.length === 54, String(ORDERS_HEADERS.length))
check('a aba Items leva as 15', ITEMS_HEADERS.length === 15, String(ITEMS_HEADERS.length))
check('os itens são contados', o.Items === 2)
check('as peças somam', o.Pieces === 400, String(o.Pieces))
check('a compra soma quantidade × preço', o['Purchase USD'] === 1063, String(o['Purchase USD']))
check('a venda soma quantidade × preço', o['Sale BRL'] === 8970, String(o['Sale BRL']))
check('o destino misto sai com a contagem', o['Goes to'] === '1 client · 1 stock', String(o['Goes to']))

// O dia de calendário vira número de série, não Date e não texto. Entregar
// um Date à biblioteca lê o calendário local e, em São Paulo, tira um dia de
// toda data do arquivo — sem erro nenhum.
check('a âncora sai como número de série', typeof o.Anchor === 'number')
check('o dia 60 do plano também', typeof o['Planned ready'] === 'number')
check('a chegada também', typeof o.Arrival === 'number')
check('nenhuma data sai como Date',
  !Object.values(o).some(v => v instanceof Date))
check('o fuso não entra na conta: 30/12/1899 é o zero', excelDay(new Date(Date.UTC(1899, 11, 30))) === 0)
check('e 01/01/1900 é 2, com o bug de 1900 do Excel',
  excelDay(new Date(Date.UTC(1900, 0, 1))) === 2)
check('a meia-noite UTC não escorrega para o dia anterior',
  excelDay(new Date(Date.UTC(2026, 8, 14))) === excelDay(new Date(Date.UTC(2026, 8, 14, 23, 59))))
check('um dia a mais é um a mais',
  excelDay(new Date(Date.UTC(2026, 8, 15))) - excelDay(new Date(Date.UTC(2026, 8, 14))) === 1)
check('a planilha diz de qual carimbo veio a âncora', o['Anchor from'] === 'Sample approved')
check('toda coluna de data está na lista de formato',
  DATE_HEADERS.every(h => (ORDERS_HEADERS as readonly string[]).includes(h)))

// O dia 60 fica ao lado da data que vale: sem ele, um fornecedor que atrasa
// deixa de parecer atrasado, porque só a data dele sobrevive no arquivo.
const atrasado = rowOf(card({ delivery_date: day(90) }))
const [late] = ordersSheet([atrasado], [], false)
check('o fornecedor além do dia 60 é marcado', late['Past day 60'] === 'Yes')
check('e a planilha diz por quantos dias', Number(late['Days past']) > 0, String(late['Days past']))
check('o plano continua na linha ao lado da data dele',
  typeof late['Planned ready'] === 'number' && typeof late['Supplier date'] === 'number')

const noPrazo = rowOf(card({ delivery_date: day(20) }))
check('quem está dentro do plano não é marcado',
  ordersSheet([noPrazo], [], false)[0]['Past day 60'] === 'No')

// ---------------------------------------------------------------- a aba Items

const its = itemsSheet(rows, items, false)
check('uma linha por produto', its.length === 2)
check('o total da linha é quantidade × unitário', its[0]['Line total USD'] === 663, String(its[0]['Line total USD']))
check('o destino do item sai por extenso', its[1]['Goes to'] === 'Stock')
check('as notas e o arquivo do item entram',
  'Item notes' in its[0] && 'Attached file' in its[0])
check('a ordem do card é respeitada', its[0].Reference === 'E20' && its[1]['Line total USD'] === 400)

// Um pedido sem item sumindo do arquivo é como ninguém nota que ele está vazio.
const vazio = itemsSheet([rowOf(card({ id: 'c9', ref_number: 'ORD-2026-10099' }))], [], false)
check('pedido sem item ainda aparece', vazio.length === 1 && vazio[0].Description === '(no items)')

// ------------------------------------------------------ o que o fornecedor leva

const supplierOrders = headersFor(ORDERS_HEADERS, true)
const supplierItems = headersFor(ITEMS_HEADERS, true)
check('o fornecedor não leva a venda em reais',
  !supplierOrders.includes('Sale BRL') && !supplierItems.includes('Sale BRL'))
check('nem o total de venda da linha', !supplierItems.includes('Line total BRL'))
check('nem o dia em que a mercadoria chegou', !supplierOrders.includes('Arrived on'))
// value_brl é a venda por outro caminho — é o campo que a interface esconde.
check('nem o valor do card em reais', !supplierOrders.includes('Card value BRL'))
check('mas leva a compra, que é o preço dele', supplierOrders.includes('Purchase USD'))

const [so] = ordersSheet(rows, items, true)
check('a coluna escondida não vaza na linha',
  !('Sale BRL' in so) && !('Arrived on' in so))
check('a linha do fornecedor tem exatamente as colunas dele',
  Object.keys(so).join() === supplierOrders.join())
check('a linha da Redantex tem todas', Object.keys(o).join() === [...ORDERS_HEADERS].join())

// ------------------------------------------------------------- os rótulos

check('tudo de cliente é "Client"', goesToLabel([{ destination: 'client' }]) === 'Client')
check('tudo de estoque é "Stock"', goesToLabel([{ destination: 'stock' }]) === 'Stock')
check('sem ninguém escolher, a célula fica vazia', goesToLabel([{ destination: null }]) === '')
check('pedido sem item não inventa destino', goesToLabel([]) === '')

// --------------------------------------------------------------- os filtros

const destinations = new Map([
  ['c1', destinationSummary(items)],
  ['c2', destinationSummary([{ destination: 'client' }])],
  ['c3', destinationSummary([{ destination: 'stock' }])],
])
const three = [rowOf(card()), rowOf(card({ id: 'c2' })), rowOf(card({ id: 'c3' }))]

const onlyStock = applyReportFilter(three, { ...DEFAULT_FILTER, destination: 'stock' }, false, destinations)
check('"with stock" pega o misto junto',
  onlyStock.map(r => r.card.id).sort().join() === 'c1,c3', onlyStock.map(r => r.card.id).join())
const onlyClient = applyReportFilter(three, { ...DEFAULT_FILTER, destination: 'client' }, false, destinations)
check('"client only" exclui o misto',
  onlyClient.map(r => r.card.id).join() === 'c2', onlyClient.map(r => r.card.id).join())
check('sem o mapa, o filtro de destino não esvazia a lista',
  applyReportFilter(three, { ...DEFAULT_FILTER, destination: 'stock' }, false).length === 3)

check('o filtro de coleção casa exato',
  applyReportFilter(three, { ...DEFAULT_FILTER, collection: 'Turim' }, false).length === 3
    && applyReportFilter(three, { ...DEFAULT_FILTER, collection: 'Parma' }, false).length === 0)
check('o filtro de purchase order casa exato',
  applyReportFilter(three, { ...DEFAULT_FILTER, purchaseOrder: '002575' }, false).length === 3
    && applyReportFilter(three, { ...DEFAULT_FILTER, purchaseOrder: '000001' }, false).length === 0)
check('o filtro de vendedor casa pelo rótulo',
  applyReportFilter(three, { ...DEFAULT_FILTER, salesperson: 'Antonio Mezzomo' }, false).length === 3
    && applyReportFilter(three, { ...DEFAULT_FILTER, salesperson: 'Patrick' }, false).length === 0)

// ----------------------------------------------------------- a aba Filters

const fs = filtersSheet(
  { ...DEFAULT_FILTER, client: 'MJK', destination: 'stock', collection: 'Turim' },
  'DEQI', { matched: 2, total: 34 }, '03 Oct 2026, 09:12 BRT', false)
const value = (k: string) => fs.find(r => r.Filter === k)?.Value
check('a aba de filtros diz quantos pedidos entraram', value('Orders in file') === 2)
check('e quantos existiam', value('Orders on the board') === 34)
check('registra o cliente pedido', value('Client') === 'MJK')
check('registra a purchase order pedida',
  filtersSheet({ ...DEFAULT_FILTER, purchaseOrder: '002575' }, undefined,
    { matched: 1, total: 34 }, 'x', false).find(r => r.Filter === 'Purchase order')?.Value === '002575')
check('registra o destino pedido', value('Goes to') === 'With stock items')
check('registra quando foi gerado', value('Generated') === '03 Oct 2026, 09:12 BRT')
check('sem filtro, diz que não houve filtro',
  filtersSheet(DEFAULT_FILTER, undefined, { matched: 34, total: 34 }, 'x', false)
    .find(r => r.Filter === 'Client')?.Value === 'All clients')
check('o estágio por extenso quando é parcial',
  filtersSheet({ ...DEFAULT_FILTER, stages: [STAGE_GROUPS[0].id] }, undefined,
    { matched: 1, total: 34 }, 'x', false).find(r => r.Filter === 'Stage')?.Value === STAGE_GROUPS[0].label)
check('o fornecedor não lê a linha de destino',
  !filtersSheet(DEFAULT_FILTER, 'DEQI', { matched: 1, total: 1 }, 'x', true).some(r => r.Filter === 'Goes to'))

check('o arquivo leva a data no nome',
  workbookFileName('2026-10-03') === 'redantex-timeline-2026-10-03.xlsx')

// --------------------------------------------------- carimbo de hora e dia

// Um card criado às 22h em São Paulo é 01h do dia seguinte em UTC. Ler o dia
// em UTC jogaria o registro para o dia errado, e o hub conta tudo por SP.
const noite = stampDay('2026-10-28T01:30:00Z')     // 27/10 às 22:30 em SP
const manha = stampDay('2026-10-28T13:00:00Z')     // 28/10 às 10:00 em SP
check('a noite de São Paulo não vira o dia seguinte', noite === manha - 1,
  `${noite} vs ${manha}`)
check('o carimbo e a data simples concordam no mesmo dia',
  stampDay('2026-10-28T13:00:00Z') === plainDay('2026-10-28'))
check('data simples ignora hora e fuso',
  plainDay('2026-10-28') === plainDay('2026-10-28T23:59:59Z'))
check('sem carimbo, a célula fica vazia',
  stampDay(null) === null && plainDay('') === null && plainDay(undefined) === null)

// ------------------------------------------------------------------- fim

console.log(`${passed} de ${passed + failures.length} conferências passaram`)
if (failures.length) {
  console.error('\nfalhou:')
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
