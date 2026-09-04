// Os totais do board de pedidos, conferidos contra o próprio banco.
//
//   node_modules/.bin/jiti scripts/check-order-totals.ts
//
// São números de dinheiro mostrados no topo da tela. Se a conta em TypeScript
// discordar do SQL, um dos dois está errado e ninguém perceberia olhando —
// os dois produzem um número plausível.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { orderTotals, OrderItemRow } from '../src/lib/orderTotals'
import { Card } from '../src/types'

const { Client } = createRequire(join(homedir(), '.rdx-dbtool/db.mjs'))('pg')

let bad = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = got === want
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${got}${ok ? '' : ` (esperado ${want})`}`)
}

const db = new Client({
  connectionString: readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim(),
  ssl: { rejectUnauthorized: false },
})

// Centavos de arredondamento entre float e numeric não são erro; um valor
// trocado de lugar é. Duas casas bastam para pegar o segundo sem acusar o primeiro.
const round2 = (n: number) => Math.round(n * 100) / 100

async function main() {
  await db.connect()

  const { rows: cardRows } = await db.query(`
    select id, status, supplier_id from cards
     where board = 'orders' and coalesce(archived, false) = false
  `)
  const { rows: itemRows } = await db.query(`
    select i.card_id, i.quantity, i.unit_price_usd,
           json_build_object('sale_price_brl', p.sale_price_brl) as pricing
      from card_items i
      join cards c on c.id = i.card_id
      left join card_item_pricing p on p.item_id = i.id
     where c.board = 'orders' and coalesce(c.archived, false) = false
  `)

  // A mesma pergunta, feita ao banco em SQL.
  const { rows: [sql] } = await db.query(`
    with g as (
      select case when c.status in ('Placed','In Production','Ready to Ship','Shipped')
                  then 'feito' else 'aberto' end as grupo,
             c.id as card_id, i.quantity, i.unit_price_usd, p.sale_price_brl
        from cards c
        left join card_items i on i.card_id = c.id
        left join card_item_pricing p on p.item_id = i.id
       where c.board = 'orders' and coalesce(c.archived, false) = false
    )
    select
      (select count(distinct card_id) from g where grupo='feito')::int  as feito_pedidos,
      (select coalesce(sum(quantity),0) from g where grupo='feito')::int as feito_pecas,
      (select coalesce(sum(quantity*unit_price_usd),0) from g where grupo='feito')::float8 as feito_usd,
      (select coalesce(sum(quantity*sale_price_brl),0) from g where grupo='feito')::float8 as feito_brl,
      (select count(distinct card_id) from g where grupo='aberto')::int  as aberto_pedidos,
      (select coalesce(sum(quantity),0) from g where grupo='aberto')::int as aberto_pecas,
      (select coalesce(sum(quantity*unit_price_usd),0) from g where grupo='aberto')::float8 as aberto_usd,
      (select coalesce(sum(quantity*sale_price_brl),0) from g where grupo='aberto')::float8 as aberto_brl
  `)

  const cards = cardRows as Card[]
  const rows = itemRows as OrderItemRow[]
  const t = orderTotals(cards, rows, 'all')

  console.log(`\n${cards.length} cards e ${rows.length} itens lidos do banco\n`)

  check('Placed onward · pedidos', t.placed.orders, sql.feito_pedidos)
  check('Placed onward · peças',   t.placed.pieces, sql.feito_pecas)
  check('Placed onward · compra',  round2(t.placed.purchaseUsd), round2(sql.feito_usd))
  check('Placed onward · venda',   round2(t.placed.saleBrl),     round2(sql.feito_brl))

  check('Not yet placed · pedidos', t.pending.orders, sql.aberto_pedidos)
  check('Not yet placed · peças',   t.pending.pieces, sql.aberto_pecas)
  check('Not yet placed · compra',  round2(t.pending.purchaseUsd), round2(sql.aberto_usd))
  check('Not yet placed · venda',   round2(t.pending.saleBrl),     round2(sql.aberto_brl))

  // O total tem de fechar com a soma das duas linhas acima, ou a tabela na tela
  // se contradiz sozinha.
  check('total fecha · pedidos', t.total.orders, t.placed.orders + t.pending.orders)
  check('total fecha · peças',   t.total.pieces, t.placed.pieces + t.pending.pieces)
  check('total fecha · compra',  round2(t.total.purchaseUsd), round2(t.placed.purchaseUsd + t.pending.purchaseUsd))
  check('total fecha · venda',   round2(t.total.saleBrl),     round2(t.placed.saleBrl + t.pending.saleBrl))

  // O filtro por fornecedor: cada recorte tem de somar o total.
  const { rows: fornecedores } = await db.query(`select id, short_name from suppliers order by short_name`)
  let somaPecas = 0, somaBrl = 0
  for (const f of fornecedores) {
    const parcial = orderTotals(cards, rows, f.id)
    somaPecas += parcial.total.pieces
    somaBrl += parcial.total.saleBrl
  }
  check('recortes por fornecedor somam as peças', somaPecas, t.total.pieces)
  check('recortes por fornecedor somam a venda',  round2(somaBrl), round2(t.total.saleBrl))

  // Um fornecedor sem pedido nenhum não pode inventar número.
  const vazio = orderTotals(cards, rows, 'nao-existe')
  check('fornecedor sem pedidos zera', vazio.total.pieces + vazio.total.orders, 0)

  // Um card sem itens continua sendo um pedido: some da contagem se ela for
  // feita pelos itens em vez de pelos cards.
  const semItens = orderTotals(
    [{ id: 'x', status: 'Placed', supplier_id: 'a' } as Card], [], 'all')
  check('card sem itens ainda conta como pedido', semItens.placed.orders, 1)
  check('e não inventa peças', semItens.placed.pieces, 0)

  await db.end()
  console.log(bad === 0 ? '\nTudo certo.' : `\n${bad} falha(s).`)
  process.exit(bad === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
