// Os gatilhos que decidem o que chega ao cliente.
//
//   node_modules/.bin/jiti scripts/check-client-notices.ts
//
// O que se verifica aqui não é formatação de email — é **quando** o hub
// resolve escrever para um cliente. Errar isso não quebra nada: manda uma
// mensagem a mais, ou de menos, para alguém que paga a conta. Foi assim que o
// aviso de data passou semanas anunciando mudanças que o cliente não via.

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { LOGISTICS_TARGET_DAYS } from '../src/lib/utils'

const { Client } = createRequire(join(homedir(), '.rdx-dbtool/db.mjs'))('pg')

let bad = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`)
}

async function main() {
  const url = readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim()
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await db.connect()

  // -------------------------------------------------------------------------
  // A trava dos 50 dias
  // -------------------------------------------------------------------------
  // `arrival_band` precisa dos 50 dias para saber em que terço de mês a
  // chegada cai, e a meta mora em `LOGISTICS_TARGET_DAYS`, no código. São
  // duas cópias do mesmo número em linguagens diferentes; esta é a trava.
  const { rows: [fn] } = await db.query(
    "select prosrc as src from pg_proc where proname = 'arrival_band'")
  const naFuncao = [...String(fn.src).matchAll(/p_ready \+ (\d+)/g)].map((m) => Number(m[1]))
  check('a função usa um número só', [...new Set(naFuncao)].length, 1)
  check('e é a meta de logística do código', naFuncao[0], LOGISTICS_TARGET_DAYS)

  // -------------------------------------------------------------------------
  // A faixa: o que o cliente lê
  // -------------------------------------------------------------------------
  const banda = async (d: string) =>
    (await db.query('select arrival_band($1::date) as b', [d])).rows[0].b

  // Os casos reais que motivaram a mudança: seis e sete dias de atraso que
  // não mudavam uma palavra do que o cliente lia.
  check('+6 dias dentro da mesma faixa',
    await banda('2026-11-25') === await banda('2026-12-01'), true)
  check('+7 dias ainda na mesma faixa',
    await banda('2026-11-14') === await banda('2026-11-21'), true)
  // E o contrário: um dia só pode mudar tudo, quando cruza o fim de um terço.
  check('+1 dia que cruza a faixa',
    await banda('2026-11-21') === await banda('2026-11-22'), false)
  check('+7 dias cruzando a faixa',
    await banda('2026-11-25') === await banda('2026-12-02'), false)
  check('sem data da fábrica não há faixa', await banda(null as never), null)

  // -------------------------------------------------------------------------
  // O gatilho, num card de verdade, desfeito no fim
  // -------------------------------------------------------------------------
  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims',
    json_build_object('sub', (select id::text from users where role='admin' limit 1))::text, true)`)

  // Um card com cliente que tem email — sem isso nada é enfileirado, e o
  // teste passaria por engano.
  const { rows: [alvo] } = await db.query(`
    select c.ref_number, c.id from cards c join clients cl on cl.id = c.client_id
     where c.board = 'orders' and not c.archived and c.status = 'Placed'
       and btrim(coalesce(cl.email,'')) <> '' and c.delivery_date is not null
     limit 1`)
  check('há um card com cliente avisável', !!alvo?.id, true)

  const naFila = async () => (await db.query(
    "select count(*)::int as n from email_outbox where card_id = $1 and kind = 'date-change'",
    [alvo.id])).rows[0].n

  // `guard_delivery_date` exige um motivo junto da data nova — a fábrica
  // sempre explica, e o hub não deixa remarcar em silêncio.
  const remarcar = (dias: number) => db.query(
    `update cards set delivery_date = delivery_date + ($2::int),
            delivery_date_change_reason = 'conferência automática'
      where id = $1`, [alvo.id, dias])

  await remarcar(6)
  check('seis dias não escrevem ao cliente', await naFila(), 0)

  await remarcar(10)
  check('dezesseis escrevem, uma vez', await naFila(), 1)

  // Segunda remarcação com o aviso ainda na fila: continua um email, porque
  // ele relê o card na hora de enviar e sai com a data mais recente.
  await remarcar(40)
  check('a segunda remarcação não vira um segundo email', await naFila(), 1)

  await db.query('rollback')

  // Nada do teste sobreviveu.
  const { rows: [sobrou] } = await db.query(
    "select count(*)::int as n from email_outbox where kind = 'date-change'")
  check('a fila ficou como estava', sobrou.n, 0)

  // -------------------------------------------------------------------------
  // Quem nunca pode receber
  // -------------------------------------------------------------------------
  const { rows: [antes] } = await db.query(
    "select prosrc as src from pg_proc where proname = 'enqueue_client_date_change'")
  const src = String(antes.src)
  check('cliente sem email nunca entra na fila',
    src.includes("if destino is null or destino = '' then return new; end if;"), true)
  check('e um pedido antes de Placed também não', src.includes("'Placed', 'In Production'"), true)
  check('o gatilho engole o próprio erro', src.includes('exception when others then'), true)

  await db.end()
  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
