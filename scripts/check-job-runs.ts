// O batimento das rotinas agendadas.
//
//   node_modules/.bin/jiti scripts/check-job-runs.ts
//
// A falha que este arquivo existe para pegar não é de cálculo: é um nome de
// rotina escrito diferente na tela e na função. Quando isso acontece, a linha
// fica para sempre em "ainda não registrou" e parece que a rotina morreu —
// ou, pior, a rotina morre de verdade e ninguém nota, porque já estava assim.

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { ROUTINES, routineState, NUNCA_REGISTROU } from '../src/lib/schedules'

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

  const naTela = ROUTINES.map((r) => r.job).sort()
  const { rows } = await db.query('select job from job_runs order by job')
  const noBanco = (rows as { job: string }[]).map((r) => r.job)
  check('a tela e o banco falam das mesmas rotinas', naTela, noBanco)

  // O nome tem que bater com o que a função escreve. Lido do próprio código
  // das funções, não de uma lista repetida aqui.
  const escritos = ['daily-summary', 'queue-reminders', 'send-queued-emails']
    .filter((job) => {
      const src = readFileSync(`netlify/functions/${job}.mts`, 'utf8')
      return src.includes(`job: '${job}'`)
    })
  check('cada função registra com o próprio nome', escritos.sort(), naTela)

  // Toda saída da função passa pelo registro: sem isto, um caminho de retorno
  // esquecido deixa a rotina muda num caso específico — o mais difícil de
  // perceber, porque funciona nos outros.
  for (const job of naTela) {
    const src = readFileSync(`netlify/functions/${job}.mts`, 'utf8')
    check(`${job} registra no finally`, src.includes('} finally {'), true)
    check(`${job} registra falha também`, src.includes('nota = `falhou:'), true)
  }

  // Uma linha por rotina, reescrita. Duas linhas para a mesma rotina fariam a
  // tela mostrar a execução errada.
  const { rows: dup } = await db.query(
    'select job, count(*)::int as n from job_runs group by job having count(*) > 1')
  check('nenhuma rotina duplicada', dup, [])

  // O upsert que a função usa: a chave primária é o nome, e a segunda
  // execução reescreve a primeira em vez de estourar.
  await db.query('begin')
  await db.query(`insert into job_runs (job, note) values ('teste', 'primeira')
                  on conflict (job) do update set note = excluded.note, last_run_at = now()`)
  await db.query(`insert into job_runs (job, note) values ('teste', 'segunda')
                  on conflict (job) do update set note = excluded.note, last_run_at = now()`)
  const { rows: t } = await db.query(
    "select count(*)::int as n, max(note) as note from job_runs where job = 'teste'")
  check('duas execuções, uma linha', t[0].n, 1)
  check('e a nota é a da última', t[0].note, 'segunda')
  await db.query('rollback')

  const { rows: sobrou } = await db.query("select count(*)::int as n from job_runs where job='teste'")
  check('o teste não deixou rastro', sobrou[0].n, 0)

  // Escrita é da chave de serviço. Nenhuma política de insert ou update
  // significa que nem a Redantex pode forjar um batimento pela API.
  const { rows: pol } = await db.query(
    "select cmd::text from pg_policies where tablename = 'job_runs' order by cmd")
  check('só leitura pela API', (pol as { cmd: string }[]).map((p) => p.cmd), ['SELECT'])

  await db.end()

  // -------------------------------------------------------------------------
  // Os quatro estados da tela
  // -------------------------------------------------------------------------
  const agora = Date.parse('2026-10-10T12:00:00Z')
  const rodou = (quando: string, ok = true, note = 'fila vazia') =>
    ({ last_run_at: quando, last_ok: ok, note })

  check('sem linha nenhuma, é nova', routineState(undefined, 26, agora), 'novo')
  check('semeada e ainda sem rodar, é nova',
    routineState(rodou('2026-10-10T11:00:00Z', true, NUNCA_REGISTROU), 26, agora), 'novo')
  check('rodou há pouco, está em dia',
    routineState(rodou('2026-10-10T11:00:00Z'), 26, agora), 'ok')
  // Uma rotina diária que rodou ontem de manhã ainda está em dia às 9h de
  // hoje: só depois de um ciclo inteiro perdido ela está atrasada.
  check('diária de ontem ainda está em dia',
    routineState(rodou('2026-10-09T11:00:00Z'), 26, agora), 'ok')
  check('diária de anteontem está atrasada',
    routineState(rodou('2026-10-08T11:00:00Z'), 26, agora), 'atrasado')
  check('a de quinze minutos, parada há três horas, está atrasada',
    routineState(rodou('2026-10-10T09:00:00Z'), 2, agora), 'atrasado')
  check('falha vence o atraso',
    routineState(rodou('2026-10-10T11:00:00Z', false, 'falhou: Resend 403'), 26, agora), 'falhou')

  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
