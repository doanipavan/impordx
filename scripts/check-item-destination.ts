/**
 * O destino do item — estoque da Redantex ou cliente — conferido nas bordas.
 *
 *   node_modules/.bin/jiti scripts/check-item-destination.ts
 *
 * Três telas leem o mesmo resumo: a tabela de produtos, a faixa do painel e o
 * card do quadro. O erro que importa não é visual, é de leitura: um pedido sem
 * nenhum item classificado não é um pedido de cliente, e dizer que é faria a
 * tela afirmar algo que ninguém respondeu.
 */
import { destinationSummary, DESTINATION_LABEL, DESTINATIONS } from '../src/lib/itemDestination'
import { boardTotals, arrivalsByMonth, OrderItemRow } from '../src/lib/orderTotals'
import { Card } from '../src/types'

let passed = 0
const failures: string[] = []
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) passed++
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const items = (...d: Array<'stock' | 'client' | null>) => d.map(destination => ({ destination }))

// --------------------------------------------------------- pedido de um só

const client = destinationSummary(items('client', 'client', 'client'))
check('tudo de cliente tem destino único', client.only === 'client')
check('tudo de cliente não acende a etiqueta do quadro', client.hasStock === false)
check('tudo de cliente não é misto', client.mixed === false)
check('conta os itens de cliente', client.client === 3 && client.stock === 0)

const stock = destinationSummary(items('stock', 'stock'))
check('tudo de estoque tem destino único', stock.only === 'stock')
check('tudo de estoque acende a etiqueta do quadro', stock.hasStock === true)
check('tudo de estoque não é misto', stock.mixed === false)

// ------------------------------------------------------------ pedido misto

const mixed = destinationSummary(items('client', 'client', 'stock', 'client'))
check('misto não finge destino único', mixed.only === null)
check('misto é misto', mixed.mixed === true)
check('misto acende a etiqueta do quadro', mixed.hasStock === true)
check('misto conta os dois lados', mixed.client === 3 && mixed.stock === 1,
  `${mixed.client}/${mixed.stock}`)

// -------------------------------------------------------- ninguém escolheu

// Cotações e amostras ficaram em branco de propósito na migração 050.
const blank = destinationSummary(items(null, null))
check('sem ninguém classificar, não há destino', blank.only === null)
check('sem ninguém classificar, não é misto', blank.mixed === false)
check('sem ninguém classificar, nada acende no quadro', blank.hasStock === false)
check('os não classificados são contados à parte', blank.unset === 2)

// Metade classificada: o que existe manda, o resto é contado mas não inventado.
const half = destinationSummary(items('client', null, null))
check('um classificado basta para o destino único', half.only === 'client')
check('o que falta não vira cliente por conveniência', half.unset === 2 && half.client === 1)

const halfStock = destinationSummary(items('stock', null))
check('um item de estoque já acende a etiqueta', halfStock.hasStock === true)
check('um item de estoque com pendentes não é misto', halfStock.mixed === false)

// Um card sem item nenhum — acontece enquanto a peça está sendo montada.
const none = destinationSummary([])
check('card vazio não tem destino', none.only === null && none.unset === 0)
check('card vazio não acende nada', none.hasStock === false)

// -------------------------------------------------------------- os rótulos

check('os rótulos são os dois que o banco aceita',
  DESTINATIONS.length === 2 && DESTINATIONS.includes('stock') && DESTINATIONS.includes('client'))
check('Client vem primeiro na tela', DESTINATIONS[0] === 'client')
check('os rótulos são em inglês como o resto da interface',
  DESTINATION_LABEL.client === 'Client' && DESTINATION_LABEL.stock === 'Stock')

// ---------------------------------------------------- a parte de estoque

// A conta que o painel de chegadas mostra: do total que chega, quanto é da
// linha própria. Só o estoque é somado à parte — o que ninguém classificou
// não vira cliente por conveniência, e a diferença fica diferença.
const row = (card_id: string, quantity: number, unit: number,
  destination: 'stock' | 'client' | null): OrderItemRow =>
  ({ card_id, quantity, unit_price_usd: unit, pricing: null, destination })

// A data é relativa a hoje de propósito. Uma data fixa sai do horizonte de
// seis meses do painel sozinha, com o tempo passando, e o teste começa a
// passar sem medir nada — ou a falhar sem ninguém ter mexido no código.
// Dia de calendário puro: `calendarDay` recusa um instante com hora.
const approvedAt = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

const order = (id: string): Card => ({
  id, board: 'orders', status: 'Placed', title: id,
  // O plano são 120 dias a partir da aprovação da amostra: a chegada cai
  // cinco meses à frente, dentro da janela que o painel desenha.
  sample_approved_at: approvedAt,
  created_at: approvedAt,
} as unknown as Card)

const cards = [order('a'), order('b')]
const rows = [
  row('a', 100, 2, 'client'),
  row('a', 50, 4, 'stock'),
  row('b', 200, 1, null),
]

const bt = boardTotals('orders', cards, rows, 'all')
check('o total continua somando tudo',
  bt.total.pieces === 350 && bt.total.purchaseUsd === 600, `${bt.total.pieces}/${bt.total.purchaseUsd}`)
check('só o estoque entra na parte de estoque',
  bt.total.piecesStock === 50 && bt.total.purchaseUsdStock === 200,
  `${bt.total.piecesStock}/${bt.total.purchaseUsdStock}`)
check('o não classificado não vira estoque', bt.total.piecesStock !== 250)
check('a parte nunca passa do todo',
  bt.total.purchaseUsdStock <= bt.total.purchaseUsd && bt.total.piecesStock <= bt.total.pieces)
check('sem nenhum item de estoque, a parte é zero',
  boardTotals('orders', cards, [row('a', 10, 5, 'client')], 'all').total.purchaseUsdStock === 0)

// O painel de chegadas tem o seu próprio acumulador, linha por linha igual ao
// de cima. Dois acumuladores é como um deles fica para trás numa mudança.
const arr = arrivalsByMonth(cards, rows, 'all', 6)
check('as chegadas também somam tudo',
  arr.total.pieces === 350 && arr.total.purchaseUsd === 600,
  `${arr.total.pieces}/${arr.total.purchaseUsd}`)
check('as chegadas separam a parte de estoque',
  arr.total.piecesStock === 50 && arr.total.purchaseUsdStock === 200,
  `${arr.total.piecesStock}/${arr.total.purchaseUsdStock}`)
check('os dois acumuladores concordam',
  arr.total.purchaseUsdStock === bt.total.purchaseUsdStock)
check('a soma dos meses bate com o total',
  arr.months.reduce((n, m) => n + m.total.purchaseUsdStock, 0)
    + (arr.later?.purchaseUsdStock ?? 0) === arr.total.purchaseUsdStock)

// ------------------------------------------------------------------- fim

console.log(`${passed} de ${passed + failures.length} conferências passaram`)
if (failures.length) {
  console.error('\nfalhou:')
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
