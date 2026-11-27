// A régua em blocos, e a perna azul da arte.
//
//   node_modules/.bin/jiti scripts/check-timeline-groups.ts
//   TZ=Asia/Shanghai node_modules/.bin/jiti scripts/check-timeline-groups.ts
//   TZ=Pacific/Auckland node_modules/.bin/jiti scripts/check-timeline-groups.ts
//
// Três perguntas, e as três já custaram caro neste repositório:
//
//   1. Nenhum pedido pode sumir. A soma do que entra nos blocos com o que não
//      tem relógio precisa dar o total do quadro. Foi assim que o QUEEN de
//      R$ 95.600 desapareceu da aba Sales, e o mesmo buraco existia aqui.
//   2. O bloco de um pedido é o mês da chegada — e, para o fornecedor, o mês
//      de ficar pronto, porque a perna até o Brasil não é dele. Conferido
//      contra `orderSchedule`, nunca contra uma conta escrita aqui.
//   3. A arte vai da PRIMEIRA enviada à ÚLTIMA assinatura. Medir só a última
//      rodada faria o MICCE, 57 dias em duas idas, virar "no mesmo dia".
//      Conferido contra a mesma pergunta feita em SQL.
//
// Sob Xangai e Auckland também: mês sai de dia de calendário, e um dia a mais
// na virada muda o bloco inteiro.

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { buildRow, sortRows, monthGroups, timeWindow, todayInSaoPaulo, ArtMap, Row } from '../src/lib/orderRows'
import { orderSchedule } from '../src/lib/utils'
import { Card } from '../src/types'

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
    id, board: 'orders', status: 'Ready to Ship', title: id, priority: 'medium',
    created_by: 'x', created_at: '2026-08-01T12:00:00Z', updated_at: '', supplier_id: 'd', supplier: DEQI,
    ...o,
  } as Card
}

const hoje = todayInSaoPaulo()

// ---------------------------------------------------------------------------
// Os blocos
// ---------------------------------------------------------------------------

const inventados = [
  card('a', { sample_approved_at: '2026-10-07', delivery_date: '2026-11-25' }), // chega 14/jan
  card('b', { sample_approved_at: '2026-10-07', delivery_date: '2026-11-26' }), // chega 15/jan
  card('c', { sample_approved_at: '2026-09-01', delivery_date: '2026-10-10' }), // chega 29/nov
  card('d', { sample_approved_at: '2026-08-01' }),                              // plano: chega 29/nov
]
const linhas = sortRows(inventados.map((c) => buildRow(c, hoje)!).filter(Boolean), false)
const blocos = monthGroups(linhas, false)

check('três pedidos de janeiro e novembro viram dois blocos', blocos.length, 2)
check('em ordem de mês', blocos.map((g) => g.key), ['2026-11', '2027-01'])
check('o rótulo é inglês por extenso', blocos[1].label, 'January 2027')
check('nenhum bloco vazio', blocos.filter((g) => g.rows.length === 0).length, 0)
check('todas as linhas entram em algum bloco',
  blocos.reduce((s, g) => s + g.rows.length, 0), linhas.length)
check('e nenhuma entra em dois',
  new Set(blocos.flatMap((g) => g.rows.map((r) => r.card.id))).size, linhas.length)

// O bloco sai de orderSchedule, não de uma conta escrita aqui.
for (const r of linhas) {
  const sched = orderSchedule(r.card)!
  const esperado = (r.card.arrived_at ?? sched.arrival).slice(0, 7)
  const achado = blocos.find((g) => g.rows.some((x) => x.card.id === r.card.id))!.key
  check(`${r.card.id} cai no mês que orderSchedule diz`, achado, esperado)
}

// Para o fornecedor o bloco é o de ficar pronto. A perna até o Brasil não é
// dele e ele nem a vê, então agrupar pela chegada seria agrupar por uma data
// que ele não conhece.
const doFornecedor = monthGroups(sortRows(linhas, true), true)
check('o fornecedor é agrupado pelo mês de ficar pronto',
  doFornecedor.map((g) => g.key),
  [...new Set(linhas.map((r) => r.handover.toISOString().slice(0, 7)))].sort())

// ---------------------------------------------------------------------------
// A arte
// ---------------------------------------------------------------------------

const arte: ArtMap = new Map([
  ['a', { sent: '2026-09-29T14:00:00Z', signed: '2026-11-25T18:00:00Z', rounds: 2 }],
  ['b', { sent: '2026-10-07T13:00:00Z', signed: '2026-10-07T19:00:00Z', rounds: 1 }],
])
const comArte = inventados.map((c) => buildRow(c, hoje, arte)!).filter(Boolean)
const porId = new Map(comArte.map((r) => [r.card.id, r]))

check('a janela da arte é da primeira à última', porId.get('a')!.artDays, 57)
check('e guarda quantas rodadas', porId.get('a')!.artRounds, 2)
check('zero dia é zero, não some', porId.get('b')!.artDays, 0)
check('uma rodada é uma', porId.get('b')!.artRounds, 1)
// A diferença que mais importa nesta tela: sem registro não é zero.
check('sem registro é null, nunca 0', porId.get('c')!.artDays, null)
check('e nenhuma rodada', porId.get('c')!.artRounds, 0)

// A arte entra na borda esquerda da janela. Num pedido ancorado na proforma
// não há faixa de amostra, e a aprovação costuma ser anterior — sem isto a
// perna azul cairia fora do desenho.
const soProforma = card('e', { order_confirmed_at: '2026-11-10', sample_approved_at: null })
const arteAntes: ArtMap = new Map([['e', { sent: '2026-09-15T12:00:00Z', signed: '2026-09-20T12:00:00Z', rounds: 1 }]])
const linhaE = buildRow(soProforma, hoje, arteAntes)!
const janela = timeWindow([linhaE], hoje, false)
check('a janela abre antes da arte', janela.pct(linhaE.artStart!) >= 0, true)
check('e a arte não cai fora pela esquerda', janela.start <= linhaE.artStart!, true)

// ---------------------------------------------------------------------------
// Contra o banco real
// ---------------------------------------------------------------------------

async function main() {
  const url = readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim()
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await db.connect()

  // As colunas de data saem como texto de propósito: o driver devolve `date`
  // como instante, e instante lido como dia volta um dia em São Paulo — o
  // erro que este repositório já cometeu de três maneiras diferentes.
  const { rows: cards } = await db.query(`
    select c.id, c.board, c.status, c.title, c.client_name, c.ref_number, c.archived,
           c.supplier_id, c.created_at::text as created_at,
           c.sample_approved_at::text as sample_approved_at,
           c.order_confirmed_at::text as order_confirmed_at,
           c.delivery_date::text as delivery_date,
           c.arrived_at::text as arrived_at,
           to_jsonb(s) as supplier
    from cards c left join suppliers s on s.id = c.supplier_id
    where c.board = 'orders' and not c.archived`)

  const { rows: aprovacoes } = await db.query(`
    select card_id, min(created_at) as sent, max(signed_at) as signed, count(*)::int as rounds
    from approval_requests where signed_at is not null group by card_id`)

  const mapa: ArtMap = new Map(aprovacoes.map((a: Record<string, unknown>) => [
    a.card_id as string,
    { sent: new Date(a.sent as string).toISOString(), signed: new Date(a.signed as string).toISOString(), rounds: a.rounds as number },
  ]))

  const reais = sortRows(
    (cards as Card[]).map((c) => buildRow(c, hoje, mapa)).filter((r): r is Row => r !== null),
    false,
  )
  const semRelogio = (cards as Card[]).filter(
    (c) => !c.archived && c.status !== 'Lost' && !orderSchedule(c))

  // A trava: ninguém some. Com `Lost` fora, as duas listas têm de cobrir o
  // quadro inteiro.
  const vivos = (cards as Card[]).filter((c) => c.status !== 'Lost')
  check('as barras e os sem-relógio somam o quadro inteiro',
    reais.length + semRelogio.length, vivos.length)
  check('e ninguém está nos dois',
    reais.filter((r) => semRelogio.some((c) => c.id === r.card.id)).length, 0)

  const gruposReais = monthGroups(reais, false)
  check('nenhum bloco real vazio', gruposReais.filter((g) => g.rows.length === 0).length, 0)
  check('e todas as barras entram num bloco',
    gruposReais.reduce((s, g) => s + g.rows.length, 0), reais.length)
  check('os blocos saem em ordem',
    gruposReais.map((g) => g.key), [...gruposReais.map((g) => g.key)].sort())

  // A mesma pergunta da arte, feita em SQL — e em São Paulo, não em UTC.
  //
  // Esta linha começou errada e o teste a pegou. O MICCE teve a primeira
  // aprovação enviada às 00:56 UTC de 29/set, que é 21:56 de 28/set em São
  // Paulo. Lido em UTC dá 57 dias; lido onde a Redantex vive, 58. O número da
  // tela é o de São Paulo, como toda data deste hub, e era o SQL daqui que
  // estava contando noutro fuso.
  const { rows: emSql } = await db.query(`
    select c.id,
           ((max(r.signed_at) at time zone 'America/Sao_Paulo')::date
            - (min(r.created_at) at time zone 'America/Sao_Paulo')::date) as dias,
           count(*)::int as rodadas
    from cards c join approval_requests r on r.card_id = c.id
    where c.board = 'orders' and not c.archived and r.signed_at is not null
    group by c.id`)

  const porCard = new Map(reais.map((r) => [r.card.id, r]))
  const divergem = emSql.filter((s: Record<string, unknown>) => {
    const r = porCard.get(s.id as string)
    return r && (r.artDays !== Number(s.dias) || r.artRounds !== s.rodadas)
  })
  check('a arte medida na tela bate com o SQL', divergem.map((d: Record<string, unknown>) => d.id), [])

  // E o avesso: quem não tem registro não pode aparecer com número.
  const comNumeroSemRegistro = reais.filter(
    (r) => r.artDays !== null && !emSql.some((s: Record<string, unknown>) => s.id === r.card.id))
  check('ninguém ganha dias de arte sem ter registro',
    comNumeroSemRegistro.map((r) => r.card.id), [])

  await db.end()
  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
