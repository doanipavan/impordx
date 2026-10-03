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

// ------------------------------------------------------------------- fim

console.log(`${passed} de ${passed + failures.length} conferências passaram`)
if (failures.length) {
  console.error('\nfalhou:')
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
