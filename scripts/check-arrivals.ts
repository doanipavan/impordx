// O que chega ao Brasil por mês, conferido de dois lados.
//
//   node_modules/.bin/jiti scripts/check-arrivals.ts
//   TZ=Asia/Shanghai node_modules/.bin/jiti scripts/check-arrivals.ts
//
// Primeiro com cards inventados, para os casos de borda que o banco de hoje
// não tem: mês vazio no meio, virada de ano, horizonte estourado, card sem
// relógio. Depois contra o banco real, com a mesma pergunta feita em SQL — se
// os dois produzem números plausíveis e diferentes, um está errado e ninguém
// perceberia olhando.
//
// Roda sob o fuso de Xangai também: o mês vem de uma conta de dias no
// calendário, e um dia a mais ou a menos na virada muda o mês inteiro.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { arrivalsByMonth, OrderItemRow } from '../src/lib/orderTotals'
import { Card } from '../src/types'

const { Client } = createRequire(join(homedir(), '.rdx-dbtool/db.mjs'))('pg')

let bad = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`)
}
const round2 = (n: number) => Math.round(n * 100) / 100

const DEQI = { id: 'd', name: 'DEQI', short_name: 'DEQI' }
const SCON = { id: 's', name: 'Sconcept', short_name: 'Sconcept' }

function card(id: string, o: Partial<Card>): Card {
  return {
    id, board: 'orders', status: 'Placed', title: id, priority: 'medium',
    created_by: 'x', created_at: '', updated_at: '', supplier_id: 'd', supplier: DEQI,
    ...o,
  } as Card
}
function row(card_id: string, quantity: number, usd: number, brl: number): OrderItemRow {
  return { card_id, quantity, unit_price_usd: usd, pricing: { sale_price_brl: brl } }
}

console.log('\n— cards inventados —')
{
  const cards = [
    // amostra aprovada em 14/ago + 120 = 12/dez
    card('a', { sample_approved_at: '2026-08-14' }),
    // fornecedor deu 28/out: chega 28/out + 50 = 17/dez (não 12/dez do plano)
    card('f', { sample_approved_at: '2026-08-14', delivery_date: '2026-10-28' }),
    // já chegou em 05/nov: conta em novembro, não na previsão
    card('g', { sample_approved_at: '2026-08-14', delivery_date: '2026-09-20', arrived_at: '2026-11-05', status: 'Arrived' }),
    // Sconcept conta da proforma: 05/set + 120 = 03/jan — vira o ano
    card('b', { supplier_id: 's', supplier: SCON, order_confirmed_at: '2026-09-05' }),
    // DEQI com as duas datas: a amostra vence, não a proforma
    card('c', { sample_approved_at: '2026-10-20', order_confirmed_at: '2026-08-01' }),
    // sem relógio nenhum
    card('d', {}),
  ]
  const rows = [row('a', 100, 1.5, 10), row('b', 200, 2, 20), row('c', 10, 1, 5), row('d', 999, 9, 9),
                row('f', 1, 1, 1), row('g', 1, 1, 1)]
  const r = arrivalsByMonth(cards, rows, 'all')

  check('meses, contíguos, com o vazio no meio', r.months.map(m => m.key), ['2026-11', '2026-12', '2027-01', '2027-02'])
  check('chegada real conta no mês real (nov)', r.months[0].total.orders, 1)
  check('data do fornecedor + 50 fica em dezembro junto com o plano', r.months[1].total.orders, 2)
  check('rótulo em inglês', r.months[1].label, 'Dec 2026')
  check('janeiro tem o card b (virada de ano)', r.months[2].total.orders, 1)
  check('fev tem c (20/out+120=17/fev)', r.months[3].total.orders, 1)
  check('card sem relógio contado à parte', r.withoutClock, 1)
  check('e fora do total', r.total.orders, 5)
  check('peças do card sem relógio não entram', r.total.pieces, 312)
  check('compra em US$', round2(r.total.purchaseUsd), 562)
  check('venda em R$', round2(r.total.saleBrl), 5052)
  check('nada depois do horizonte', r.later, null)

  const soDeqi = arrivalsByMonth(cards, rows, 'd')
  check('filtro por fornecedor tira a Sconcept', soDeqi.total.orders, 4)
}

console.log('\n— horizonte —')
{
  // oito meses seguidos: só seis aparecem, os outros dois viram "later"
  const cards = Array.from({ length: 8 }, (_, i) =>
    card(`m${i}`, { sample_approved_at: `2026-${String(i + 1).padStart(2, '0')}-01` }))
  const rows = cards.map(c => row(c.id, 1, 1, 1))
  const r = arrivalsByMonth(cards, rows, 'all', 6)
  check('seis colunas', r.months.length, 6)
  check('primeira é maio (01/jan + 120)', r.months[0].key, '2026-05')
  // 120 dias não é "quatro meses": 01/fev cai em 01/jun e 01/mar em 29/jun.
  // Oito cards dão sete meses, não oito — e eu tinha escrito o teste errado.
  check('junho recebe dois (fev e mar)', r.months[1].total.orders, 2)
  check('só novembro sobra para later', r.later?.orders, 1)
  check('total conta os oito', r.total.orders, 8)
}

console.log('\n— contra o banco —')
const db = new Client({
  connectionString: readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim(),
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await db.connect()
  const { rows: cardRows } = await db.query(`
    select c.*, jsonb_build_object('id', s.id, 'name', s.name, 'short_name', s.short_name) as supplier,
           -- como texto, que é o formato em que a tela recebe pela API; o driver
           -- do Node devolveria Date, e a régua não aceita Date de propósito
           c.sample_approved_at::text as sample_approved_at, c.order_confirmed_at::text as order_confirmed_at,
           c.delivery_date::text as delivery_date, c.arrived_at::text as arrived_at
      from cards c left join suppliers s on s.id = c.supplier_id
     where c.board = 'orders' and c.archived = false`)
  const { rows: itemRows } = await db.query(`
    select i.card_id, i.quantity, i.unit_price_usd::float8 as unit_price_usd,
           jsonb_build_object('sale_price_brl', p.sale_price_brl) as pricing
      from card_items i left join card_item_pricing p on p.item_id = i.id
     where i.card_id in (select id from cards where board = 'orders' and archived = false)`)

  const ts = arrivalsByMonth(cardRows as Card[], itemRows as OrderItemRow[], 'all')

  // A mesma pergunta em SQL, com a regra escrita de novo à mão. Se ela e a
  // versão em TypeScript divergirem, uma delas leu a régua errado.
  const { rows: sql } = await db.query(`
    with anc as (
      select c.id,
             -- a mesma régua escrita à mão: chegou > fornecedor + 50 > âncora + 120
             coalesce(c.arrived_at, c.delivery_date + 50,
               (case when s.short_name = 'Sconcept'
                     then coalesce(c.order_confirmed_at, c.sample_approved_at)
                     else coalesce(c.sample_approved_at, c.order_confirmed_at) end) + 120) as chegada
        from cards c left join suppliers s on s.id = c.supplier_id
       where c.board = 'orders' and c.archived = false)
    select to_char(chegada, 'YYYY-MM') as mes, count(*)::int as pedidos,
           coalesce(sum(i.quantity), 0)::int as pecas,
           coalesce(sum(i.quantity * i.unit_price_usd), 0)::float8 as usd,
           coalesce(sum(i.quantity * p.sale_price_brl), 0)::float8 as brl
      from anc left join card_items i on i.card_id = anc.id
      left join card_item_pricing p on p.item_id = i.id
     where chegada is not null
     group by 1 order by 1`)

  // pedidos vêm da contagem de cards, não das linhas de itens
  const { rows: pedidosSql } = await db.query(`
    with anc as (
      select c.id,
             coalesce(c.arrived_at, c.delivery_date + 50,
               (case when s.short_name = 'Sconcept'
                     then coalesce(c.order_confirmed_at, c.sample_approved_at)
                     else coalesce(c.sample_approved_at, c.order_confirmed_at) end) + 120) as chegada
        from cards c left join suppliers s on s.id = c.supplier_id
       where c.board = 'orders' and c.archived = false)
    select to_char(chegada, 'YYYY-MM') as mes, count(*)::int as pedidos
      from anc where chegada is not null group by 1 order by 1`)

  await db.end()

  const tsByKey = new Map(ts.months.map(m => [m.key, m.total]))
  check('mesmos meses', ts.months.map(m => m.key), sql.map(r => r.mes))
  for (const r of sql) {
    const t = tsByKey.get(r.mes)!
    const p = pedidosSql.find(x => x.mes === r.mes)!
    check(`${r.mes} pedidos`, t.orders, p.pedidos)
    check(`${r.mes} peças`, t.pieces, r.pecas)
    check(`${r.mes} US$`, round2(t.purchaseUsd), round2(r.usd))
    check(`${r.mes} R$`, round2(t.saleBrl), round2(r.brl))
  }
  check('nenhum pedido sem relógio hoje', ts.withoutClock, 0)

  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
