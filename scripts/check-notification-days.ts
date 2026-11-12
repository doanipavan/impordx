// As notificações agrupadas por dia.
//
//   node_modules/.bin/jiti scripts/check-notification-days.ts
//   TZ=Asia/Shanghai node_modules/.bin/jiti scripts/check-notification-days.ts
//
// O que pode dar errado aqui não é o desenho: é o dia. A DEQI abre a mesma
// tela dez horas à frente, e um comentário escrito às 22h em São Paulo cairia
// no dia seguinte para ela se o agrupamento usasse o relógio de quem olha.
// Por isso o fuso é fixado, e por isso este arquivo roda sob outro fuso.

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { groupByDay, dayInSaoPaulo, dayLabel, timeInSaoPaulo } from '../src/lib/notificationDays'

const { Client } = createRequire(join(homedir(), '.rdx-dbtool/db.mjs'))('pg')

let bad = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`)
}

// ---------------------------------------------------------------------------
// O dia é o de São Paulo, não o de quem olha
// ---------------------------------------------------------------------------

// 12/11 às 23h30 em São Paulo é 13/11 de madrugada em UTC. Quem lê na China
// tem de ver o mesmo dia que quem escreveu.
check('noite em São Paulo não vira o dia', dayInSaoPaulo('2026-11-13T02:30:00Z'), '2026-11-12')
check('e a manhã seguinte vira', dayInSaoPaulo('2026-11-13T12:30:00Z'), '2026-11-13')
check('a hora é a de São Paulo', timeInSaoPaulo('2026-11-13T02:30:00Z'), '23:30')

check('hoje', dayLabel('2026-11-12', '2026-11-12'), 'Today')
check('ontem', dayLabel('2026-11-11', '2026-11-12'), 'Yesterday')
// A virada de mês é onde subtrair um dia costuma quebrar.
check('ontem na virada do mês', dayLabel('2026-10-31', '2026-11-01'), 'Yesterday')
check('ontem na virada do ano', dayLabel('2026-12-31', '2027-01-01'), 'Yesterday')
check('um dia qualquer', dayLabel('2026-11-07', '2026-11-12'), 'Sat, 7 Nov')
// A tela é do hub, que é inglês inteiro — a DEQI também a abre.
check('o rótulo é em inglês', dayLabel('2026-03-05', '2026-11-12'), 'Thu, 5 Mar')

// ---------------------------------------------------------------------------
// O agrupamento
// ---------------------------------------------------------------------------

const n = (iso: string, read = true) => ({ created_at: iso, read })

const grupos = groupByDay([
  n('2026-11-12T15:00:00Z'),
  n('2026-11-12T12:00:00Z', false),
  n('2026-11-10T12:00:00Z'),
], '2026-11-12')
check('um grupo por dia', grupos.map((g) => g.day), ['2026-11-12', '2026-11-10'])
check('do mais recente para o mais antigo', grupos[0].label, 'Today')
check('a ordem de dentro é a que veio',
  grupos[0].items.map((i) => i.created_at),
  ['2026-11-12T15:00:00Z', '2026-11-12T12:00:00Z'])
check('conta as não lidas do dia', grupos[0].unread, 1)
// Dia sem nada não vira coluna: fim de semana parado é o normal, e uma
// coluna vazia por semana só empurra o passado para longe.
check('o dia 11, que não teve nada, não aparece',
  grupos.some((g) => g.day === '2026-11-11'), false)
check('sem notificações, sem grupos', groupByDay([], '2026-11-12'), [])

async function main() {
  const url = readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim()
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await db.connect()

  // Contra o banco: a mesma pergunta feita em SQL, com o fuso fixado lá
  // também. Se os dois discordarem, um dos dois está usando o relógio errado.
  const { rows: reais } = await db.query(`
    select n.created_at, n.read
      from notifications n join users u on u.id = n.user_id
     where u.role = 'admin'
     order by n.created_at desc limit 200`)
  const { rows: sql } = await db.query(`
    select to_char(x.created_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') as dia,
           count(*)::int as total
      from (select n.created_at from notifications n join users u on u.id = n.user_id
             where u.role = 'admin' order by n.created_at desc limit 200) x
     group by 1 order by 1 desc`)

  const ts = groupByDay(
    (reais as { created_at: Date; read: boolean }[])
      .map((r) => ({ created_at: new Date(r.created_at).toISOString(), read: r.read })),
    dayInSaoPaulo(new Date().toISOString()))

  check('os mesmos dias que o SQL', ts.map((g) => g.day),
    (sql as { dia: string }[]).map((r) => r.dia))
  check('e a mesma contagem em cada um', ts.map((g) => g.items.length),
    (sql as { total: number }[]).map((r) => r.total))
  check('nada se perdeu no caminho',
    ts.reduce((s, g) => s + g.items.length, 0), reais.length)

  await db.end()
  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
