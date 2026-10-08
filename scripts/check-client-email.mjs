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
  clientEmail, itemSize, longDay, shortDay, addDays, timeline, STAGES, stageSteps,
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
check('o assunto leva a data de chegada', mail.subject.includes('14 de janeiro de 2027'))
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

// ----------------------------------------------------------------------
console.log(`\n${pass} verificações passaram`)
if (fails.length) {
  console.log(`\n${fails.length} falharam:`)
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('nenhuma falhou\n')
