// O panorama diário, conferido sem banco e sem rede.
//
//   node scripts/check-daily-report.mjs
//   TZ=Asia/Shanghai node scripts/check-daily-report.mjs
//
// O que importa aqui é o bloco "mudou de mês". Ele compara o retrato de hoje
// com o de ontem, e um erro nele não aparece olhando: diria ao diretor
// comercial que R$ 16 mil saíram de dezembro quando não saíram.

import {
  dailyReport, reportRows, monthMoves, monthSpan, columns,
  mil, brl, mesNome, mesCurto, diaTexto,
} from '../netlify/lib/dailyReport.mjs'

let bad = 0
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`)
}

const card = (o) => ({
  id: o.id, ref_number: o.id, status: 'Placed', archived: false,
  client_name: o.cliente ?? 'CLIENTE', value_brl: o.valor ?? 1000,
  salesperson_name: o.vendedor ?? 'Antonio',
  sample_approved_at: o.amostra ?? null,
  order_confirmed_at: o.confirmado ?? null,
  delivery_date: o.fabrica ?? null,
  arrived_at: o.chegou ?? null,
  client: o.email === undefined ? { name: o.cliente ?? 'CLIENTE', email: 'c@x.com' } : { name: 'C', email: o.email },
  ...o.extra,
})

// ---------------------------------------------------------------------------
// Dinheiro e datas
// ---------------------------------------------------------------------------

check('mil arredonda para cima', mil(697679), 'R$ 698 mil')
check('mil em valor redondo', mil(16020), 'R$ 16 mil')
check('abaixo de mil mostra o número', mil(999), 'R$ 999')
check('mil no limite', mil(1000), 'R$ 1 mil')
check('mil de zero', mil(0), 'R$ 0')
check('brl com separador', brl(1038344), 'R$ 1.038.344')
check('brl de nulo', brl(null), 'R$ 0')

check('mês por extenso', mesNome('2027-01'), 'Janeiro 2027')
check('mês curto', mesCurto('2026-12'), 'DEZ')
check('mês curto de março', mesCurto('2026-03'), 'MAR')
// Lido como instante, 9 de outubro viraria 8 em São Paulo. Aqui a string é
// fatiada e nenhum fuso entra na conta.
check('dia por extenso', diaTexto('2026-10-09'), 'sexta, 9 de outubro')
check('dia na virada do ano', diaTexto('2027-01-01'), 'sexta, 1 de janeiro')

// ---------------------------------------------------------------------------
// A faixa de meses
// ---------------------------------------------------------------------------

check('o vazio do meio aparece', monthSpan(['2026-10', '2027-01']),
  ['2026-10', '2026-11', '2026-12', '2027-01'])
check('um mês só', monthSpan(['2026-12']), ['2026-12'])
check('sem meses', monthSpan([]), [])
check('repetidos não duplicam', monthSpan(['2026-12', '2026-12']), ['2026-12'])
check('vira o ano', monthSpan(['2026-11', '2027-02']),
  ['2026-11', '2026-12', '2027-01', '2027-02'])

// ---------------------------------------------------------------------------
// As linhas
// ---------------------------------------------------------------------------

const um = reportRows([card({ id: 'a', amostra: '2026-10-07', fabrica: '2026-11-25', valor: 36480 })])
check('uma linha', um.rows.length, 1)
check('chegada é a data da fábrica mais cinquenta', um.rows[0].chegada, '2027-01-14')
check('mês da linha', um.rows[0].mes, '2027-01')

const chegou = reportRows([card({
  id: 'b', amostra: '2026-09-02', fabrica: '2026-09-02', chegou: '2026-10-20',
})])
check('chegou manda sobre a previsão', chegou.rows[0].mes, '2026-10')

// Pedido confirmado que nunca foi amostra: o plano conta da confirmação, como
// o quadro já fazia. Sem este degrau o pedido sairia do relatório.
const semAmostra = reportRows([card({ id: 'c', confirmado: '2026-10-08' })])
check('confirmação serve de âncora', semAmostra.rows[0].mes, '2027-02')
check('e não some do relatório', semAmostra.semRelogio, 0)

const semNada = reportRows([card({ id: 'd' })])
check('sem âncora sai da lista', semNada.rows.length, 0)
check('mas é contado à parte', semNada.semRelogio, 1)

check('perdido fica fora',
  reportRows([card({ id: 'e', fabrica: '2026-11-01', extra: { status: 'Lost' } })]).rows.length, 0)
check('arquivado fica fora',
  reportRows([card({ id: 'f', fabrica: '2026-11-01', extra: { archived: true } })]).rows.length, 0)

const ordem = reportRows([
  card({ id: 'g', cliente: 'PEQUENO', valor: 10, fabrica: '2026-11-01' }),
  card({ id: 'h', cliente: 'GRANDE', valor: 900, fabrica: '2026-11-01' }),
])
check('o maior valor em cima', ordem.rows.map((r) => r.cliente), ['GRANDE', 'PEQUENO'])

const cols = columns(reportRows([
  card({ id: 'i', valor: 100, fabrica: '2026-09-01' }),
  card({ id: 'j', valor: 200, fabrica: '2026-12-01' }),
]).rows)
check('colunas com o vazio no meio', cols.map((c) => c.key),
  ['2026-10', '2026-11', '2026-12', '2027-01'])
check('totais por coluna', cols.map((c) => c.total), [100, 0, 0, 200])

// ---------------------------------------------------------------------------
// O que mudou de mês — o bloco que não pode errar
// ---------------------------------------------------------------------------

const agora = reportRows([
  card({ id: 'x', cliente: 'MARIA DOLORES', valor: 16020, fabrica: '2026-10-11' }),
]).rows
check('o mês de hoje', agora[0].mes, '2026-11')

// Primeira manhã: sem retrato anterior não se anuncia nada. Trinta e seis
// linhas de "novo" ensinariam a ignorar o bloco no segundo dia.
check('sem retrato anterior, nenhum aviso', monthMoves(null, agora).moves, [])
check('retrato anterior vazio também não', monthMoves([], agora).moves, [])

const ontem = [{ card_id: 'x', card_ref: 'x', client_name: 'MARIA DOLORES', month: '2026-12', value_brl: 16020 }]
const mudou = monthMoves(ontem, agora)
check('uma mudança de mês', mudou.moves.length, 1)
check('de onde para onde', [mudou.moves[0].de, mudou.moves[0].para], ['2026-12', '2026-11'])
check('o tipo', mudou.moves[0].tipo, 'moveu')
check('o saldo fecha dos dois lados',
  mudou.saldo, [{ mes: '2026-11', delta: 16020 }, { mes: '2026-12', delta: -16020 }])

check('nada mudou, nada se diz', monthMoves(
  [{ card_id: 'x', client_name: 'M', month: '2026-11', value_brl: 16020 }], agora).moves, [])

const novo = monthMoves(
  [{ card_id: 'outro', client_name: 'OUTRO', month: '2026-11', value_brl: 50 }], agora)
check('pedido novo e pedido que saiu', novo.moves.map((m) => m.tipo).sort(), ['novo', 'saiu'])
check('e o saldo soma os dois', novo.saldo, [{ mes: '2026-11', delta: 16020 - 50 }])

const valor = monthMoves(
  [{ card_id: 'x', client_name: 'MARIA DOLORES', month: '2026-11', value_brl: 10000 }], agora)
check('valor mudou no mesmo mês', valor.moves[0].tipo, 'valor')
check('e o saldo é a diferença', valor.saldo, [{ mes: '2026-11', delta: 6020 }])

// Dois pedidos trocando de lugar entre os mesmos meses: as duas linhas
// aparecem, e o saldo não mostra mês nenhum porque de fato nada mudou de
// tamanho. Mostrar "+0" seria pior que não mostrar.
const troca = reportRows([
  card({ id: 'p', cliente: 'A', valor: 500, fabrica: '2026-10-11' }),
  card({ id: 'q', cliente: 'B', valor: 500, fabrica: '2026-10-25' }),
]).rows
const cruzado = monthMoves([
  { card_id: 'p', client_name: 'A', month: '2026-12', value_brl: 500 },
  { card_id: 'q', client_name: 'B', month: '2026-11', value_brl: 500 },
], troca)
check('duas linhas na troca cruzada', cruzado.moves.length, 2)
check('e saldo nenhum', cruzado.saldo, [])

// ---------------------------------------------------------------------------
// O email
// ---------------------------------------------------------------------------

const cards = [
  card({ id: 'a1', cliente: 'RIZZI', valor: 59200, fabrica: '2026-10-28' }),
  card({ id: 'a2', cliente: 'MARIA DOLORES', valor: 16020, fabrica: '2026-10-11' }),
  card({ id: 'a3', cliente: 'SEM EMAIL', valor: 1000, fabrica: '2026-10-11', email: null }),
]
const quieto = dailyReport({ cards, previous: [], today: '2026-10-09' })
check('assunto sem mudança', quieto.subject, 'Panorama do dia — R$ 76.220 a caminho')
check('sem mudança, sem bloco âmbar', quieto.html.includes('O que mudou'), false)
check('conta quem está sem email', quieto.html.includes('1 de 3 pedidos têm cliente sem email'), true)

const agitado = dailyReport({
  cards,
  previous: [{ card_id: 'a2', client_name: 'MARIA DOLORES', month: '2026-12', value_brl: 16020 }],
  today: '2026-10-09',
})
check('assunto com mudança', agitado.subject, 'Panorama do dia — 1 pedido mudou de mês')
check('o bloco aparece', agitado.html.includes('O que mudou'), true)
check('com a direção certa', agitado.html.includes('dezembro &rarr; <b>novembro</b>'), true)
// 'a1' e 'a3' não estavam no retrato de ontem, então entram como novos — é o
// comportamento certo e o teste existe para que ninguém o "conserte".
check('os que não estavam no retrato entram como novos',
  agitado.moves.filter((m) => m.tipo === 'novo').length, 2)

const texto = dailyReport({ cards, previous: [], today: '2026-10-09' }).text
check('a versão em texto traz os meses', texto.includes('Dezembro 2026'), true)
check('e os clientes', texto.includes('RIZZI — R$ 59.200'), true)
check('sem etiqueta de HTML no texto', /<[a-z/]/i.test(texto), false)

// Nome de cliente com marcação vira texto, nunca HTML.
const perigo = dailyReport({
  cards: [card({ id: 'z', cliente: '<b>A & B</b>', valor: 10, fabrica: '2026-11-01' })],
  previous: [], today: '2026-10-09',
})
check('nome escapado', perigo.html.includes('&lt;b&gt;A &amp; B&lt;/b&gt;'), true)
check('nenhuma etiqueta vazada', perigo.html.includes('<b>A & B</b>'), false)

for (const [nome, corpo] of [['html', quieto.html], ['texto', quieto.text]]) {
  check(`sem undefined no ${nome}`, corpo.includes('undefined'), false)
  check(`sem NaN no ${nome}`, corpo.includes('NaN'), false)
}
check('o email declara português', quieto.html.includes('lang="pt-BR"'), true)
check('e proíbe tradução automática', quieto.html.includes('translate="no"'), true)
// Sem flexbox nem float: nenhum dos dois sobrevive no Outlook.
check('sem flexbox', /display:\s*flex/.test(quieto.html), false)
check('sem float', /float:\s*(left|right)/.test(quieto.html), false)

console.log(bad === 0 ? `\n${'Tudo certo.'}\n` : `\n${bad} falha(s).\n`)
process.exit(bad === 0 ? 0 : 1)
