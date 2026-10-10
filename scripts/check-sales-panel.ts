// O painel de vendas, conferido de três lados.
//
//   node_modules/.bin/jiti scripts/check-sales-panel.ts
//   TZ=Asia/Shanghai node_modules/.bin/jiti scripts/check-sales-panel.ts
//   TZ=Pacific/Auckland node_modules/.bin/jiti scripts/check-sales-panel.ts
//
// Primeiro com cards inventados, para as bordas que o banco de hoje não tem:
// mês vazio no meio, virada de ano, pedido perdido, card sem âncora.
//
// Depois a trava: `forecastBand` aqui e `decendio` no `clientEmail.mjs` fazem
// a mesma conta em dois arquivos que não podem se importar — um é do navegador,
// o outro do email. Se discordarem, o vendedor lê no painel uma faixa que o
// cliente não recebeu, e ninguém percebe olhando.
//
// Por último contra o banco real, com a mesma pergunta feita em SQL, e contra
// `arrivalsByMonth`, que desenha a mesma faixa de meses para outro painel.
//
// Roda sob o fuso de Xangai e de Auckland também: o mês sai de uma conta de
// dias de calendário, e um dia a mais na virada muda o mês inteiro.

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  salesRows, salesMonths, salespeopleIn, monthName, forecastBand, shortDay, longDay,
} from '../src/lib/salesPanel'
import { arrivalsByMonth } from '../src/lib/orderTotals'
import { Card, salespersonLabel } from '../src/types'

const { Client } = createRequire(join(homedir(), '.rdx-dbtool/db.mjs'))('pg')

let bad = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`)
}

const DEQI = { id: 'd', name: 'DEQI', short_name: 'DEQI' }

function card(id: string, o: Partial<Card>): Card {
  return {
    id, board: 'orders', status: 'Placed', title: id, priority: 'medium',
    created_by: 'x', created_at: '', updated_at: '', supplier_id: 'd', supplier: DEQI,
    ...o,
  } as Card
}

// ---------------------------------------------------------------------------
// Os nomes dos meses
// ---------------------------------------------------------------------------

check('mês 01', monthName('2027-01'), 'Janeiro 2027')
check('mês 03', monthName('2027-03'), 'Março 2027')
check('mês 10', monthName('2026-10'), 'Outubro 2026')
check('mês 12', monthName('2026-12'), 'Dezembro 2026')
check('mês inválido volta a chave', monthName('2026-13'), '2026-13')

// ---------------------------------------------------------------------------
// Dias, sempre como dia de calendário
// ---------------------------------------------------------------------------

check('dia curto', shortDay('2026-11-25'), '25 nov 2026')
check('dia curto aceita instante', shortDay('2026-11-25T03:00:00.000Z'), '25 nov 2026')
check('dia curto vazio', shortDay(null), '—')
check('dia longo', longDay('2027-01-14'), '14 de janeiro de 2027')
check('dia longo vazio', longDay(undefined), null)
// 1º de janeiro lido como instante viraria 31 de dezembro em São Paulo. Aqui
// não há instante nenhum: a string é fatiada.
check('dia longo na virada', longDay('2027-01-01'), '1 de janeiro de 2027')

// ---------------------------------------------------------------------------
// As linhas
// ---------------------------------------------------------------------------

const base = {
  sample_approved_at: '2026-10-07', order_confirmed_at: '2026-10-08',
  client_name: 'OURO DO BRASIL', salesperson_name: 'Patrick Santing',
  value_brl: 36480, purchase_order: '002670',
}

const umaLinha = salesRows([card('a', { ...base, delivery_date: '2026-11-25' })])
check('uma linha', umaLinha.length, 1)
check('mês da chegada', umaLinha[0].month, '2027-01')
check('dia da chegada', umaLinha[0].arrival, '2027-01-14')
check('ainda não chegou', umaLinha[0].landed, false)
check('valor da linha', umaLinha[0].value, 36480)
check('cliente da linha', umaLinha[0].client, 'OURO DO BRASIL')
check('vendedor da linha', umaLinha[0].salesperson, 'Patrick Santing')

check('a faixa que o cliente ouviu', forecastBand(umaLinha[0].arrival),
  'entre 11 e 20 de janeiro de 2027')

const jaChegou = salesRows([card('b', {
  ...base, delivery_date: '2026-09-02', arrived_at: '2026-10-20', status: 'Arrived',
})])
check('chegou: o mês é o real, não o previsto', jaChegou[0].month, '2026-10')
check('chegou: marcado', jaChegou[0].landed, true)

check('perdido fica fora', salesRows([card('c', { ...base, status: 'Lost' })]).length, 0)
check('arquivado fica fora', salesRows([card('d', { ...base, archived: true })]).length, 0)
// Sem amostra aprovada e sem confirmação não há âncora: `orderSchedule`
// devolve null e inventar um mês seria pior do que ficar de fora.
check('sem âncora fica fora',
  salesRows([card('e', { client_name: 'X', value_brl: 10 })]).length, 0)

const ordenadas = salesRows([
  card('f', { ...base, client_name: 'ZEBRA', delivery_date: '2026-11-25' }),
  card('g', { ...base, client_name: 'ABELHA', delivery_date: '2026-11-25' }),
  card('h', { ...base, client_name: 'MEIO', delivery_date: '2026-09-10' }),
])
check('ordena por chegada e depois por cliente',
  ordenadas.map((r) => r.client), ['MEIO', 'ABELHA', 'ZEBRA'])

check('vendedores do recorte', salespeopleIn([
  ...salesRows([card('i', { ...base, salesperson_name: 'Júlia', delivery_date: '2026-11-01' })]),
  ...salesRows([card('j', { ...base, salesperson_name: 'Antonio', delivery_date: '2026-11-01' })]),
  ...salesRows([card('k', { ...base, salesperson_name: 'Júlia', delivery_date: '2026-11-02' })]),
]), ['Antonio', 'Júlia'])

// ---------------------------------------------------------------------------
// Os meses, com os vazios
// ---------------------------------------------------------------------------

const buraco = salesMonths(salesRows([
  card('l', { ...base, delivery_date: '2026-09-01', value_brl: 100 }),   // out
  card('m', { ...base, delivery_date: '2026-12-01', value_brl: 200 }),   // jan
]))
check('o mês vazio do meio aparece', buraco.map((m) => m.key),
  ['2026-10', '2026-11', '2026-12', '2027-01'])
check('o vazio vem com zero', buraco.map((m) => m.total), [100, 0, 0, 200])
check('o vazio vem sem linhas', buraco.map((m) => m.rows.length), [1, 0, 0, 1])

const viraAno = salesMonths(salesRows([
  card('n', { ...base, delivery_date: '2026-11-20', value_brl: 1 }),     // jan 2027
  card('o', { ...base, delivery_date: '2027-01-20', value_brl: 2 }),     // mar 2027
]))
check('vira o ano sem tropeçar', viraAno.map((m) => m.key),
  ['2027-01', '2027-02', '2027-03'])

check('sem linhas, sem meses', salesMonths([]).length, 0)

const somaMes = salesMonths(salesRows([
  card('p', { ...base, delivery_date: '2026-11-25', value_brl: 10 }),
  card('q', { ...base, delivery_date: '2026-11-26', value_brl: 32 }),
]))
check('soma do mês', somaMes[0].total, 42)

// ---------------------------------------------------------------------------
// O nome do vendedor vem do cadastro primeiro
// ---------------------------------------------------------------------------

check('cadastro ganha do login e do texto', salespersonLabel({
  sold_by: { id: '1', name: 'Júlia', active: true },
  salesperson: { full_name: 'Alguém' } as never,
  salesperson_name: 'JULIA',
}), 'Júlia')
check('sem cadastro, o login', salespersonLabel({
  salesperson: { full_name: 'Antonio' } as never, salesperson_name: 'ANTONIO',
}), 'Antonio')
check('sem nada, o texto', salespersonLabel({ salesperson_name: 'Renata' }), 'Renata')
check('sem nada mesmo', salespersonLabel({}), null)

async function main() {
  // -------------------------------------------------------------------------
  // A trava: a faixa aqui e o decêndio do email têm que dizer a mesma coisa
  // -------------------------------------------------------------------------
  const { decendio } = await import('../netlify/lib/clientEmail.mjs')
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  const dias = [
    '2027-01-01', '2027-01-10', '2027-01-11', '2027-01-20', '2027-01-21', '2027-01-31',
    '2026-02-21', '2026-02-28', '2028-02-29', '2026-04-21', '2026-04-30',
    '2026-12-21', '2026-12-31', '2026-06-15',
  ]
  let iguais = 0
  for (const dia of dias) {
    const d = decendio(dia) as { de: number; ate: number; mes: string; ano: number }
    // A frase exata do email, não uma parecida: é o mesmo texto que o
    // cliente leu, e o vendedor não pode ler outro.
    const esperado = `entre ${d.de} e ${d.ate} de ${d.mes} de ${d.ano}`
    if (forecastBand(dia) === esperado) iguais++
    else check(`faixa de ${dia}`, forecastBand(dia), esperado)
  }
  check('a faixa do painel bate com o decêndio do email', iguais, dias.length)
  // E a lista de meses tem que ser a mesma dos dois lados, senão "20 de
  // março" de um lado é "20 de March" do outro.
  check('os meses do painel e do email são os mesmos', MESES.map((m, i) => {
    const d = decendio(`2026-${String(i + 1).padStart(2, '0')}-05`) as { mes: string }
    return d.mes === m
  }).every(Boolean), true)

  // -------------------------------------------------------------------------
  // Contra o banco real
  // -------------------------------------------------------------------------
  const url = readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim()
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await db.connect()

  const { rows: cards } = await db.query(`
    select c.id, c.board, c.status, c.title, c.priority, c.archived, c.created_at,
           c.client_name, c.value_brl::float8 as value_brl, c.purchase_order,
           c.salesperson_name, c.supplier_id,
           to_char(c.sample_approved_at,'YYYY-MM-DD') as sample_approved_at,
           to_char(c.order_confirmed_at,'YYYY-MM-DD') as order_confirmed_at,
           to_char(c.delivery_date,'YYYY-MM-DD') as delivery_date,
           to_char(c.arrived_at,'YYYY-MM-DD') as arrived_at,
           json_build_object('id', s.id, 'name', s.name, 'short_name', s.short_name) as supplier
      from cards c left join suppliers s on s.id = c.supplier_id
     where c.board = 'orders' and c.archived = false and c.status <> 'Lost'`)

  const { rows: sql } = await db.query(`
    select to_char(coalesce(arrived_at, delivery_date + 50,
                            sample_approved_at + 120, order_confirmed_at + 120),'YYYY-MM') as mes,
           count(*)::int as pedidos, sum(value_brl)::float8 as brl
      from cards
     where board = 'orders' and archived = false and status <> 'Lost'
     group by 1 order by 1`)
  await db.end()

  const rows = salesRows(cards as Card[])
  const meses = salesMonths(rows)

  check('todo pedido aberto entrou', rows.length, cards.length)
  check('os meses com pedido são os mesmos do SQL',
    meses.filter((m) => m.rows.length).map((m) => m.key), sql.map((r) => r.mes))
  for (const r of sql) {
    const m = meses.find((x) => x.key === r.mes)!
    check(`${r.mes} pedidos`, m.rows.length, r.pedidos)
    check(`${r.mes} R$`, Math.round(m.total), Math.round(r.brl))
  }

  // O painel de arrivals desenha a mesma faixa de meses a partir da mesma
  // função. Discordar aqui significa que um dos dois mudou de regra.
  const arr = arrivalsByMonth(cards as Card[], [], 'all', 99)
  check('a faixa de meses é a mesma do painel de arrivals',
    meses.map((m) => m.key), arr.months.map((m) => m.key))
  check('e a contagem de pedidos por mês também',
    meses.map((m) => m.rows.length), arr.months.map((m) => m.total.orders))

  check('nenhum vendedor duplicado por grafia',
    salespeopleIn(rows).length, new Set(salespeopleIn(rows).map((s) => s.toUpperCase())).size)

  // A trava mais importante deste arquivo: o email diário agrupa os pedidos
  // por mês de chegada, e o painel também. Se discordarem, o Patrick lê
  // "dezembro" num lugar e "janeiro" no outro para o mesmo pedido.
  const { reportRows } = await import('../netlify/lib/dailyReport.mjs')
  const doEmail = reportRows(cards as never).rows as { cardId: string; mes: string }[]
  const mesDoPainel = new Map(rows.map((r) => [r.card.id, r.month]))
  check('o email e o painel contam os mesmos pedidos', doEmail.length, rows.length)
  check('e põem cada um no mesmo mês',
    doEmail.filter((r) => mesDoPainel.get(r.cardId) !== r.mes).map((r) => r.cardId), [])

  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
