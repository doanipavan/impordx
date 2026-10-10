// A etapa Collected, conferida em cada lugar que a esqueceria em silêncio.
//
//   node_modules/.bin/jiti scripts/check-collected.ts
//
// Inserir uma etapa no meio de um quadro toca mais coisa do que parece: a
// ordem das colunas, o que o fornecedor vê, de quem é a perna do prazo, o
// dinheiro já comprometido, os grupos do relatório, a régua do email do
// cliente e três objetos no banco. Nenhum desses erros grita — a coluna
// aparece, o card arrasta, e o número sai errado em outro lugar.

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  BOARD_COLUMNS, REDANTEX_ONLY_STATUSES, STATUS_COLORS, OrderStatus,
  isPlacedOnward, isRdxLeg, visibleColumns,
} from '../src/types'
import { orderClock } from '../src/lib/utils'
import { STAGE_GROUPS } from '../src/lib/timelineReport'

const { Client } = createRequire(join(homedir(), '.rdx-dbtool/db.mjs'))('pg')

let bad = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`)
}

// ---------------------------------------------------------------------------
// Onde a coluna fica
// ---------------------------------------------------------------------------

const ordens = BOARD_COLUMNS.orders
check('Collected está no quadro de pedidos', ordens.includes('Collected'), true)
check('entre Ready to Ship e Shipped',
  [ordens[ordens.indexOf('Collected') - 1], ordens[ordens.indexOf('Collected') + 1]],
  ['Ready to Ship', 'Shipped'])

// ---------------------------------------------------------------------------
// Quem vê
// ---------------------------------------------------------------------------

// O fornecedor vê: foi ele quem entregou a carga ao transportador. O que ele
// não pode ver é `Arrived`, que revelaria o tempo de trânsito.
check('o fornecedor vê Collected', visibleColumns('orders', true).includes('Collected'), true)
check('e continua sem ver Arrived', visibleColumns('orders', true).includes('Arrived'), false)
check('Collected não é etapa só da Redantex',
  REDANTEX_ONLY_STATUSES.includes('Collected'), false)

// ---------------------------------------------------------------------------
// De quem é o prazo, e o dinheiro
// ---------------------------------------------------------------------------

check('Collected é perna da RDX', isRdxLeg('Collected'), true)
check('produção ainda é perna da fábrica', isRdxLeg('In Production'), false)
check('pronto na fábrica já é perna da RDX', isRdxLeg('Ready to Ship'), true)
check('dinheiro comprometido inclui Collected', isPlacedOnward('Collected'), true)

// Cor semântica: coletado é trabalho em curso, não concluído. A mesma família
// de "em produção", e diferente de "embarcado".
check('âmbar como em produção', STATUS_COLORS.Collected, STATUS_COLORS['In Production'])
check('e não verde como embarcado',
  STATUS_COLORS.Collected === STATUS_COLORS.Shipped, false)

// O painel do card lê a perna ativa daqui. Sem Collected na lista, um card
// coletado mostraria o prazo correndo do lado da fábrica.
const card = {
  sample_approved_at: '2026-10-07',
  order_confirmed_at: '2026-10-08',
  delivery_date: '2026-11-25',
  status: 'Collected',
  supplier: { short_name: 'DEQI' },
}
check('a perna ativa de um card coletado', orderClock(card)?.activeLeg, 'rdx')
check('e de um card em produção',
  orderClock({ ...card, status: 'In Production' })?.activeLeg, 'deqi')

// ---------------------------------------------------------------------------
// Os grupos do relatório
// ---------------------------------------------------------------------------

const agrupadas = STAGE_GROUPS.flatMap((g) => g.statuses)
check('Collected está em algum grupo', agrupadas.includes('Collected'), true)
check('em um só', agrupadas.filter((s) => s === 'Collected').length, 1)
// A invariante que pegaria a próxima etapa esquecida: toda etapa de pedido
// pertence a exatamente um grupo, senão ela desaparece do relatório sem que
// nenhum filtro pareça errado.
check('toda etapa do quadro cabe em um grupo',
  ordens.filter((s) => !agrupadas.includes(s as OrderStatus)), [])
check('e nenhum grupo inventa etapa',
  agrupadas.filter((s) => !ordens.includes(s)), [])

async function main() {
  // -------------------------------------------------------------------------
  // A régua do email do cliente
  // -------------------------------------------------------------------------
  const { clientEmail, cardToEmailInput, stageSteps, STAGE_INDEX } =
    await import('../netlify/lib/clientEmail.mjs')

  const passos = stageSteps('Collected', {
    sampleApprovedOn: '2026-10-07', placedOn: '2026-10-08',
    readyOn: '2026-11-25', collectedOn: '2026-11-27', arrival: '2027-01-14',
  }) as { lines: string[]; state: string; day: string }[]

  // A contradição que existia: a manchete diz "foi coletada" e a régua dizia
  // "Embarcado" logo abaixo, na mesma tela do cliente.
  check('a quarta casa diz Coletado', passos[3].lines, ['Coletado'])
  check('e é a casa de agora', passos[3].state, 'now')
  check('com o dia da coleta, não o da fábrica', passos[3].day, '27 nov')
  check('embarcado continua dizendo Embarcado',
    (stageSteps('Shipped', { readyOn: '2026-11-25', shippedOn: '2026-11-28' }) as {
      lines: string[] }[])[3].lines, ['Embarcado'])
  check('e pronto na fábrica, Pronto para embarque',
    (stageSteps('Ready to Ship', { readyOn: '2026-11-25' }) as {
      lines: string[] }[])[3].lines, ['Pronto para', 'embarque'])
  check('Collected ocupa a mesma casa que embarcado',
    STAGE_INDEX.Collected, STAGE_INDEX.Shipped)

  const mail = clientEmail(cardToEmailInput({
    status: 'Collected',
    status_since: '2026-11-27T12:00:00Z',
    sample_approved_at: '2026-10-07',
    order_confirmed_at: '2026-10-08',
    delivery_date: '2026-11-25',
    card_items: [{ size: '7 x 8 x 3,2 cm', quantity: 1200 }],
  }, { stage: 'Collected', client: 'OURO DO BRASIL', today: '2026-11-27' })) as {
    subject: string; html: string; resumo: string }
  check('o email tem manchete própria',
    mail.subject.startsWith('Sua mercadoria foi coletada'), true)
  check('e fala de coleta, não de embarque',
    mail.html.includes('O transportador retirou a mercadoria da fábrica.'), true)
  check('sem a palavra Embarcado na régua', mail.html.includes('>Embarcado<'), false)
  check('e grava o que informou', mail.resumo,
    'Previsão informada: entre 11 e 20 de janeiro de 2027')

  // -------------------------------------------------------------------------
  // O banco
  // -------------------------------------------------------------------------
  const url = readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim()
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await db.connect()

  const { rows: restricao } = await db.query(`
    select pg_get_constraintdef(oid) like '%Collected%' as ok
      from pg_constraint where conname = 'valid_status'`)
  check('a restrição aceita Collected', restricao[0]?.ok, true)

  // O portão guarda a sequência em ordem. Etapa fora da lista faz
  // `array_position` devolver null, e o portão libera tudo em silêncio.
  const { rows: fns } = await db.query(`
    select proname::text as fn, (prosrc like '%Collected%') as ok
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%Ready to Ship%'
     order by 1`)
  check('toda função que enumera etapas conhece Collected',
    (fns as { fn: string; ok: boolean }[]).filter((f) => !f.ok).map((f) => f.fn), [])

  // A ordem dentro do portão importa: Collected tem que vir depois de
  // "pronto" e antes de "embarcado", senão arrastar o card para trás passaria
  // pelo portão como se fosse para frente.
  const { rows: gate } = await db.query(`
    select array_position(a, 'Ready to Ship') as pronto,
           array_position(a, 'Collected') as coletado,
           array_position(a, 'Shipped') as embarcado
      from (select array['Purchasing','Commercial','PI Requested','PI In Preparation',
                         'PI Approved','Placed','In Production','Ready to Ship',
                         'Collected','Shipped','Arrived']::text[] as a) t`)
  check('a ordem esperada do portão',
    [Number(gate[0].pronto) + 1, Number(gate[0].embarcado) - 1],
    [Number(gate[0].coletado), Number(gate[0].coletado)])

  await db.end()

  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
