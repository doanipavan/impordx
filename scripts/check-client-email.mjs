/**
 * O email do cliente.
 *
 *   node scripts/check-client-email.mjs
 *
 * Três famílias de verificação, e as três nasceram de erro real ou de regra
 * que o Doani deu em voz alta:
 *
 *   - **Marcação não vaza.** A primeira versão imprimiu "Amostra&lt;br&gt;
 *     aprovada" no corpo do email, porque o rótulo carregava HTML e passava
 *     pelo escape. O rótulo agora é lista de linhas.
 *   - **Preço não aparece.** "sem preço, só produtos, quantidades e datas".
 *     O teste procura cifrão e cognatos no HTML inteiro, inclusive quando o
 *     chamador insiste em passar preço no item.
 *   - **Instrução de produção não vira nome de produto.** "add clip for ring"
 *     é recado para a fábrica.
 */
import {
  clientEmail, itemSize, longDay, shortDay, monthShort, decendio,
  addDays, timeline, STAGES, stageSteps, DEFAULT_PLAN_DAYS, cardToEmailInput,
  DEFAULT_LOGISTICS_DAYS,
} from '../netlify/lib/clientEmail.mjs'

let pass = 0
const fails = []
const check = (name, ok) => { if (ok) pass++; else fails.push(name) }
const eq = (name, got, want) => check(`${name} — esperava ${JSON.stringify(want)}, veio ${JSON.stringify(got)}`, got === want)

const FIXTURE = {
  client: 'OURO DO BRASIL',
  salesperson: 'Patrick',
  sampleApprovedOn: '2026-10-07',
  placedOn: '2026-10-08',
  readyOn: '2026-11-25',
  logisticsDays: 50,
  items: [
    { collection: 'Parma', description: 'R1 — DOUBLE RING', size: '7,5 x 5 x 3,7 cm', quantity: 600 },
    { collection: 'Parma', description: 'R9 — RING', size: '4,6 x 5,2 x 3,8 cm', quantity: 600 },
    { collection: 'Parma', description: 'P71 — set', size: '7 x 8 x 3,2 cm', quantity: 1200 },
  ],
}

const mail = clientEmail(FIXTURE)

// ---------------------------------------------------------------- datas
eq('addDays atravessa a virada do ano', addDays('2026-11-25', 50), '2027-01-14')
eq('addDays atravessa fevereiro bissexto', addDays('2028-02-28', 2), '2028-03-01')
eq('longDay escreve o mês por extenso', longDay('2027-01-14'), '14 de janeiro de 2027')
eq('shortDay abrevia', shortDay('2026-11-25'), '25 nov')
eq('longDay aceita vazio', longDay(null), null)
eq('a chegada é o pronto mais a meta', mail.arrival, '2027-01-14')
eq('as peças somam', mail.pieces, 2400)

// Um dia puro nunca vira instante: 25/11 é 25/11 em São Paulo e em Foshan.
process.env.TZ = 'Asia/Shanghai'
eq('o dia não escorrega em Xangai', addDays('2026-11-25', 50), '2027-01-14')
process.env.TZ = 'America/Sao_Paulo'

// --------------------------------------------------------------- itens
// O email lista medida e quantidade, e nada mais. A descrição do item é
// recado para a fábrica — "add clip for ring", "buttons for bracelet" — e
// uma versão anterior tentava virar isso em nome de produto, errando a peça.
eq('a medida é o que identifica a linha', itemSize({ size: '7,5 x 5 x 3,7 cm' }), '7,5 x 5 x 3,7 cm')
eq('medida em branco não quebra a tabela', itemSize({ size: '   ' }), 'Item')
eq('medida ausente também não', itemSize({}), 'Item')

const sujo = clientEmail({
  ...FIXTURE,
  items: [
    { collection: 'Custom', description: 'E20 — add clip for ring', size: '7 x 7 x 4,5 cm', quantity: 300 },
    { collection: 'Parma', description: 'buttons for bracelet', size: '19 x 19 x 5 cm', quantity: 200 },
    { collection: 'Genova', description: 'please check artwork attached', size: '9 x 9 cm', quantity: 100 },
  ],
})
const corpo = sujo.html.replace(/<[^>]+>/g, ' ')
check('nenhuma instrução de produção chega ao cliente',
  !/add clip|buttons for|check artwork/i.test(corpo))
check('nenhum nome de coleção aparece', !/Parma|Genova|Custom/i.test(corpo))
check('nenhum código de referência aparece', !/\bE20\b/.test(corpo))
check('as três medidas aparecem',
  ['7 x 7 x 4,5 cm', '19 x 19 x 5 cm', '9 x 9 cm'].every(s => sujo.html.includes(s)))
eq('e o total soma as três', sujo.pieces, 600)

// ------------------------------------------------------------- marcação
check('nenhum <br> escapado no corpo', !mail.html.includes('&lt;br'))
check('nenhuma marcação escapada de qualquer tipo', !/&lt;[a-z/]/i.test(mail.html))
check('os rótulos da timeline estão inteiros',
  ['Amostra', 'aprovada', 'confirmado', 'produção', 'embarque', 'ao Brasil']
    .every(w => mail.html.includes(w)))
check('as cinco colunas existem', (mail.html.match(/border-radius:50%/g) ?? []).length === 5)

// O escape continua valendo para o que vem de fora.
const hostil = clientEmail({ ...FIXTURE, client: 'ACME <script>alert(1)</script>' })
check('nome de cliente é escapado', !hostil.html.includes('<script>'))
check('e aparece como texto', hostil.html.includes('&lt;script&gt;'))

// ---------------------------------------------------------------- preço
const PRECO = /\$|US\s*\$|R\$|\bpre[çc]o\b|\bvalor\b|\btotal a pagar\b/i
check('nenhum sinal de preço no HTML', !PRECO.test(mail.html.replace(/<[^>]+>/g, ' ')))
check('nenhum sinal de preço no texto', !PRECO.test(mail.text))

// Mesmo que o chamador insista em mandar preço junto do item, nada sai.
const comPreco = clientEmail({
  ...FIXTURE,
  items: FIXTURE.items.map(i => ({ ...i, unit_price_usd: 0.64, sale_price_brl: 12.5 })),
})
check('preço passado por engano não vaza no HTML', !comPreco.html.includes('0.64') && !comPreco.html.includes('12.5'))
check('preço passado por engano não vaza no texto', !comPreco.text.includes('0.64'))

// --------------------------------------------------- números internos
check('o purchase order não aparece', !mail.html.includes('002670'))
check('o código do DEV não aparece', !mail.html.includes('0401705'))

// ------------------------------------------------------------- idioma
check('o documento se declara pt-BR', mail.html.includes('lang="pt-BR"'))
check('e pede para não ser traduzido', mail.html.includes('translate="no"'))
check('com a meta do Google junto', mail.html.includes('name="google" content="notranslate"'))

// ------------------------------------------------------------ conteúdo
check('o cliente é cumprimentado pelo nome', mail.html.includes('OURO DO BRASIL'))
check('o vendedor é nomeado no rodapé', mail.html.includes('Patrick'))
check('o assunto leva a faixa de chegada', mail.subject.includes('entre 11 e 20 de janeiro de 2027'))
check('o assunto não promete um dia exato', !mail.subject.includes('14 de janeiro'))
check('o total de peças aparece', mail.html.includes('2.400'))
check('a quantidade de cada item aparece', mail.html.includes('1.200'))

// ---------------------------------------------------- barra de progresso
const vazia = timeline([
  { lines: ['Um'], day: '1 jan', state: 'done' },
  { lines: ['Dois'], day: '2 jan', state: 'now' },
])
check('a barra fecha a tabela que abre', (vazia.match(/<table/g) ?? []).length === (vazia.match(/<\/table>/g) ?? []).length)


// ---------------------------------------------------------------- etapas
// Cada etapa tem texto próprio, e a régua anda uma casa a cada uma.
for (const stage of STAGES) {
  const m = clientEmail({ ...FIXTURE, stage, today: '2026-10-08' })
  check(`${stage}: tem assunto`, !!m.subject && m.subject.length > 10)
  check(`${stage}: tem as cinco casas`, (m.html.match(/border-radius:50%/g) ?? []).length === 5)
  check(`${stage}: não escapa marcação`, !/&lt;[a-z/]/i.test(m.html))
  check(`${stage}: não leva preço`, !/\$|\bpre[çc]o\b/i.test(m.html.replace(/<[^>]+>/g, ' ')))
}

check('as etapas da proforma não têm texto de cliente',
  !STAGES.includes('PI Requested') && !STAGES.includes('PI Approved'))

eq('Placed acende a segunda casa', stageSteps('Placed', {}).findIndex(s => s.state === 'now'), 1)
eq('In Production acende a terceira', stageSteps('In Production', {}).findIndex(s => s.state === 'now'), 2)
eq('Shipped acende a quarta', stageSteps('Shipped', {}).findIndex(s => s.state === 'now'), 3)
eq('Arrived acende a última', stageSteps('Arrived', {}).findIndex(s => s.state === 'now'), 4)

eq('na fábrica a quarta casa se chama "Pronto para embarque"',
  stageSteps('Ready to Ship', {})[3].lines.join(' '), 'Pronto para embarque')
eq('depois de sair ela se chama "Embarcado"',
  stageSteps('Shipped', {})[3].lines.join(' '), 'Embarcado')

// Quem chegou não recebe previsão de chegada.
const chegou = clientEmail({ ...FIXTURE, stage: 'Arrived', arrivedOn: '2027-01-12', today: '2027-01-12' })
check('o email de chegada não fala em previsão', !/prevista|previsão/i.test(chegou.subject))
check('e mostra o dia em que chegou', chegou.html.includes('12 de janeiro de 2027'))

// O lembrete mostra onde o pedido está, sem fingir que algo mudou.
const lembrete = clientEmail({ ...FIXTURE, stage: 'reminder', currentStage: 'In Production', today: '2026-10-23' })
check('o lembrete tem manchete própria', lembrete.subject.startsWith('Como está seu pedido'))
eq('e a régua mostra a etapa de verdade',
  stageSteps('In Production', {}).findIndex(s => s.state === 'now'), 2)
check('o lembrete não leva preço', !/\$/.test(lembrete.html.replace(/<[^>]+>/g, ' ')))

// ---------------------------------------------- a previsão é imprecisa
// "14 de janeiro" soa como compromisso de entrega; não é. Entre a fábrica e
// a porta do cliente há embarque, navio e alfândega.
eq('mês curto na coluna', monthShort('2027-01-14'), 'jan 2027')

const previsto = clientEmail({ ...FIXTURE, stage: 'Placed', today: '2026-10-08' })
const texto = previsto.html.replace(/<[^>]+>/g, ' ')
check('a manchete não mostra dia exato de chegada', !texto.includes('14 de janeiro'))
check('mostra a faixa de dez dias', texto.includes('entre 11 e 20 de janeiro de 2027'))
check('assume a margem em voz alta', /margem de cerca de dez dias/i.test(texto))
check('e diz que é importação', /importa[çc][ãa]o/i.test(texto))
check('com a ressalva da alfândega', /alfandeg|alfândeg/i.test(texto))

// A faixa vem do decêndio em que a previsão cai, e fecha no fim do mês.
eq('primeiro decêndio', decendio('2027-01-05').faixa, '1 a 10 de janeiro')
eq('segundo decêndio', decendio('2027-01-14').faixa, '11 a 20 de janeiro')
eq('terceiro decêndio de janeiro vai até 31', decendio('2027-01-28').faixa, '21 a 31 de janeiro')
eq('e o de fevereiro, até 28', decendio('2027-02-25').faixa, '21 a 28 de fevereiro')
eq('fevereiro bissexto vai até 29', decendio('2028-02-25').faixa, '21 a 29 de fevereiro')

// O que já aconteceu continua tendo dia: fato não é previsão.
const regua = stageSteps('In Production', {
  sampleApprovedOn: '2026-10-07', placedOn: '2026-10-08', productionOn: '2026-10-20',
  readyOn: '2026-11-25', arrival: '2027-01-14',
})
eq('a casa cumprida mostra o dia', regua[0].day, '7 out')
eq('a casa de agora mostra o dia', regua[2].day, '20 out')
eq('a casa futura mostra só o mês', regua[3].day, 'nov 2026')
eq('e a chegada também', regua[4].day, 'jan 2027')

// Quando chegou de verdade, o dia volta a ser dito — é fato.
check('a chegada cumprida tem dia exato',
  clientEmail({ ...FIXTURE, stage: 'Arrived', arrivedOn: '2027-01-12', today: '2027-01-12' })
    .html.includes('12 de janeiro de 2027'))

// --------------------------------------------- nenhuma frase mal formada
// Duas frases foram concatenadas em várias linhas e sobrou espaço no fim,
// que virou espaço dobrado no meio do texto que o cliente lê.
for (const k of [...STAGES, 'reminder', 'date-change', 'sample-approved', 'date-confirmed']) {
  const m = clientEmail({ ...FIXTURE, stage: k, currentStage: 'Placed', today: '2026-10-08' })
  check(`${k}: sem espaço dobrado no texto`, !/[^\n] {2,}[^\n ]/.test(m.text))
  check(`${k}: sem espaço antes de pontuação`, !/\s+[.,;:]/.test(m.text))
  check(`${k}: o assunto não tem espaço dobrado`, !/ {2,}/.test(m.subject))
  check(`${k}: o assunto cabe na lista do celular`, m.subject.length <= 90)
}

// ------------------------------------------------------- card sem itens
// Existe pelo menos um card de amostra sem itens cadastrados. "São estes os
// itens:" seguido de nada, com "Total: 0 peças", não se manda a cliente.
const vazio = clientEmail({ ...FIXTURE, stage: 'sample-approved', items: [], today: '2026-10-07' })
check('sem itens, não anuncia lista', !vazio.html.includes('São estes os itens'))
check('sem itens, não mostra total', !/Total/.test(vazio.html))
check('sem itens, não mostra zero peças', !/0 peças/.test(vazio.html))
check('mas o resto do email continua inteiro',
  vazio.html.includes('Olá') && vazio.html.includes('Previsão de chegada'))
check('e o texto puro também', !vazio.text.includes('Total:') && vazio.text.includes('Olá'))

const comItens = clientEmail({ ...FIXTURE, stage: 'Placed', today: '2026-10-08' })
check('com itens, a lista é anunciada', comItens.html.includes('São estes os itens'))

// -------------------------------------------- dia não é instante
// Quatro colunas de `cards` são `date` e duas são `timestamptz`. Ler um
// `date` como instante o transforma em meia-noite UTC e, em São Paulo, no
// DIA ANTERIOR — 8 de outubro vira 7. Esta função errava exatamente isso
// em `order_confirmed_at` e `arrived_at`, e a data errada iria no email.
const CARD = {
  status: 'In Production',
  sample_approved_at: '2026-10-07',        // date
  order_confirmed_at: '2026-10-08',        // date
  delivery_date: '2026-11-25',             // date
  arrived_at: '2027-01-14',                // date
  status_since: '2026-10-20T14:30:00+00:00',   // timestamptz
  shipped_at: '2026-12-02T23:40:00+00:00',     // timestamptz — 20:40 em SP
  salesperson: { full_name: 'Patrick Santing', email: 'p@x.com', role: 'member' },
  card_items: [
    { size: '7 x 8 cm', quantity: 1200, sort_order: 2 },
    { size: '4 x 5 cm', quantity: 600, sort_order: 1 },
  ],
}
const vindo = cardToEmailInput(CARD, { stage: 'In Production', client: 'X', today: '2026-10-20' })
eq('amostra: dia, sem escorregar', vindo.sampleApprovedOn, '2026-10-07')
eq('pedido confirmado: dia, sem escorregar', vindo.placedOn, '2026-10-08')
eq('pronto: dia, sem escorregar', vindo.readyOn, '2026-11-25')
eq('chegada: dia, sem escorregar', vindo.arrivedOn, '2027-01-14')
eq('instante vira o dia de São Paulo', vindo.productionOn, '2026-10-20')
eq('e um instante tarde da noite também', vindo.shippedOn, '2026-12-02')
eq('os itens saem na ordem do card', vindo.items.map(i => i.quantity).join(), '600,1200')
eq('o vendedor é tratado pelo primeiro nome', vindo.salesperson, 'Patrick')

// A casa da produção só mostra data enquanto o card está nela: `status_since`
// é reescrito na etapa seguinte e mostraria a data de outra coisa.
eq('fora de produção, a casa não inventa data',
  cardToEmailInput({ ...CARD, status: 'Shipped' }, {}).productionOn, undefined)

// A mesma leitura em qualquer máquina: o fuso do servidor não entra na conta.
const antes = process.env.TZ
for (const tz of ['Asia/Shanghai', 'Pacific/Auckland', 'UTC']) {
  process.env.TZ = tz
  const outro = cardToEmailInput(CARD, {})
  check(`em ${tz}: o dia do card não muda`,
    outro.placedOn === '2026-10-08' && outro.arrivedOn === '2027-01-14')
}
process.env.TZ = antes

eq('card vazio não quebra', cardToEmailInput(null, { stage: 'Placed' }).items.length, 0)

// ------------------------------------------- as duas pontas da história
// A amostra aprovada é a casa zero, e ali ainda não há data da fábrica: a
// previsão sai do plano de 120 dias, que é a promessa que a Redantex já faz.
const amostra = clientEmail({
  stage: 'sample-approved', client: 'OURO DO BRASIL', salesperson: 'Patrick',
  sampleApprovedOn: '2026-10-07', today: '2026-10-07',
  items: [{ size: '7 x 8 x 3,2 cm', quantity: 1200 }],
})
eq('a amostra acende a primeira casa', stageSteps('sample-approved', {}).findIndex(s => s.state === 'now'), 0)
check('e a previsão vem do plano de 120 dias',
  amostra.html.includes('entre 1 e 10 de fevereiro de 2027'))
check('o email da amostra tem manchete própria', amostra.subject.startsWith('Sua amostra foi aprovada'))
eq('a previsão do plano é a amostra mais 120', addDays('2026-10-07', DEFAULT_PLAN_DAYS), '2027-02-04')

// Quando a fábrica informa a data, a previsão fica mais firme — e neste caso
// melhora: 4 de fevereiro pelo plano, 14 de janeiro pela data real.
const firme = clientEmail({
  stage: 'date-confirmed', currentStage: 'Placed', client: 'OURO DO BRASIL',
  salesperson: 'Patrick', sampleApprovedOn: '2026-10-07', placedOn: '2026-10-08',
  readyOn: '2026-11-25', today: '2026-10-14',
  items: [{ size: '7 x 8 x 3,2 cm', quantity: 1200 }],
})
check('a data da fábrica manda mais que o plano',
  firme.html.includes('entre 11 e 20 de janeiro de 2027'))
check('o email da data confirmada tem manchete própria',
  firme.subject.startsWith('A fábrica confirmou o prazo'))

// Cada tipo rende o seu texto, e nenhum cai no do lembrete — foi o bug que
// mandava tudo que não começasse com "stage:" para 'reminder'.
const titulos = new Set(['sample-approved', 'date-confirmed', 'date-change', 'reminder'].map(k =>
  clientEmail({ ...FIXTURE, stage: k, currentStage: 'Placed', today: '2026-10-08' })
    .html.match(/font-weight:650[^>]*>([^<]+)</)?.[1]))
eq('quatro avisos avulsos, quatro manchetes diferentes', titulos.size, 4)

// ------------------------------------------------- a cópia dos 50 dias
// A meta de logística mora em src/lib/utils.ts, que é o que o Gantt e o
// painel de chegadas leem. Aqui ela está repetida porque uma função do
// Netlify não importa TypeScript do app — então esta verificação existe para
// a cópia não envelhecer sozinha, que é como dois pedidos já sumiram do
// gráfico quando duas telas guardaram cada uma o seu "+120".
import { readFileSync } from 'node:fs'
const utils = readFileSync(new URL('../src/lib/utils.ts', import.meta.url), 'utf8')
const naFonte = Number(utils.match(/LOGISTICS_TARGET_DAYS\s*=\s*(\d+)/)?.[1])
eq('a meta de logística bate com src/lib/utils.ts', DEFAULT_LOGISTICS_DAYS, naFonte)
const pernaNaFonte = Number(utils.match(/ORDER_LEG_DAYS\s*=\s*(\d+)/)?.[1])
eq('e o plano é o dobro da perna', DEFAULT_PLAN_DAYS, pernaNaFonte * 2)

// ----------------------------------------------------------------------
console.log(`\n${pass} verificações passaram`)
if (fails.length) {
  console.log(`\n${fails.length} falharam:`)
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('nenhuma falhou\n')
