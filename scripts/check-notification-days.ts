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
import {
  groupByDay, dayInSaoPaulo, dayLabel, timeInSaoPaulo,
  agruparAnexos, grupoDe, tiposDoGrupo, GRUPOS,
} from '../src/lib/notificationDays'

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

// ---------------------------------------------------------------------------
// Assunto: nove tipos viram seis botões
// ---------------------------------------------------------------------------

check('menção', grupoDe('mention'), 'Mentions')
check('as três de data caem no mesmo botão',
  [grupoDe('delivery_set'), grupoDe('delivery_change'), grupoDe('due_soon')],
  ['Dates', 'Dates', 'Dates'])
check('tipo desconhecido não some num grupo errado', grupoDe('coisa_nova'), null)
check('o grupo de datas devolve os três tipos',
  tiposDoGrupo('Dates').sort(), ['delivery_change', 'delivery_set', 'due_soon'])
// A varredura usa esta lista para montar a consulta: um tipo de fora ficaria
// marcado como lido sem o usuário ter pedido.
check('nenhum grupo devolve tipo de outro',
  GRUPOS.every((g) => tiposDoGrupo(g).every((t) => grupoDe(t) === g)), true)

// ---------------------------------------------------------------------------
// Juntar os anexos repetidos
// ---------------------------------------------------------------------------

const anexo = (id: string, card: string, autor: string, read = true) =>
  ({ id, type: 'attachment', card_id: card, actor_id: autor, read })

const juntou = agruparAnexos([
  anexo('1', 'c1', 'a'), anexo('2', 'c1', 'a'), anexo('3', 'c1', 'a'),
])
check('quatro linhas de arquivo viram uma', juntou.length, 1)
check('com o número à vista', juntou[0].count, 3)
check('e todas dentro, para marcar lidas juntas', juntou[0].all.length, 3)

check('autor diferente não junta',
  agruparAnexos([anexo('1', 'c1', 'a'), anexo('2', 'c1', 'b')]).length, 2)
check('card diferente não junta',
  agruparAnexos([anexo('1', 'c1', 'a'), anexo('2', 'c2', 'a')]).length, 2)
// Juntar não consecutivos tiraria as coisas da ordem do dia.
check('separadas por outra coisa não juntam', agruparAnexos([
  anexo('1', 'c1', 'a'),
  { id: '2', type: 'comment', card_id: 'c1', actor_id: 'a', read: true },
  anexo('3', 'c1', 'a'),
]).length, 3)
// Juntar comentários apagaria o que cada um diz.
check('comentários nunca juntam', agruparAnexos([
  { id: '1', type: 'comment', card_id: 'c1', actor_id: 'a', read: true },
  { id: '2', type: 'comment', card_id: 'c1', actor_id: 'a', read: true },
]).length, 2)

// O grupo só conta como lido quando todas estão: uma não lida no meio tem de
// deixar o cartão aceso.
check('uma não lida acende o grupo',
  agruparAnexos([anexo('1', 'c1', 'a'), anexo('2', 'c1', 'a', false)])[0].read, false)
check('todas lidas apagam', agruparAnexos([anexo('1', 'c1', 'a')])[0].read, true)
check('nada entra, nada sai', agruparAnexos([]), [])

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

  // -------------------------------------------------------------------------
  // Silenciar um card
  // -------------------------------------------------------------------------
  // O portão fica antes do insert, e não dentro das sete funções que
  // notificam: sete verificações seriam sete lugares para esquecer uma.
  const { rows: gatilhos } = await db.query(`
    select tgname::text as nome from pg_trigger
     where tgrelid = 'notifications'::regclass and not tgisinternal`)
  check('há um portão antes do insert',
    (gatilhos as { nome: string }[]).map((g) => g.nome), ['trg_drop_muted_notification'])

  await db.query('begin')
  const { rows: [alguem] } = await db.query("select id from users where role='admin' limit 1")
  const { rows: [card] } = await db.query('select id from cards limit 1')
  const contar = async () => (await db.query(
    'select count(*)::int as n from notifications where user_id = $1 and card_id = $2',
    [alguem.id, card.id])).rows[0].n

  const antes = await contar()
  await db.query(`insert into notifications (user_id, card_id, type, message)
                  values ($1, $2, 'comment', 'antes de silenciar')`, [alguem.id, card.id])
  check('sem silenciar, a notificação entra', await contar(), antes + 1)

  await db.query('insert into muted_cards (user_id, card_id) values ($1, $2)',
    [alguem.id, card.id])
  await db.query(`insert into notifications (user_id, card_id, type, message)
                  values ($1, $2, 'comment', 'depois de silenciar')`, [alguem.id, card.id])
  check('silenciado, não entra', await contar(), antes + 1)

  // O que já chegou fica: silenciar é sobre o futuro, não apaga histórico.
  check('e o que já tinha chegado continua lá', await contar() > antes, true)

  // Silenciar vale por pessoa: ninguém cala o aviso de outro.
  const { rows: [outro] } = await db.query(
    "select id from users where role <> 'admin' limit 1")
  await db.query(`insert into notifications (user_id, card_id, type, message)
                  values ($1, $2, 'comment', 'para outra pessoa')`, [outro.id, card.id])
  const { rows: [doOutro] } = await db.query(
    'select count(*)::int as n from notifications where user_id = $1 and card_id = $2',
    [outro.id, card.id])
  check('o silêncio de um não cala o outro', doOutro.n > 0, true)
  await db.query('rollback')

  const { rows: [limpo] } = await db.query('select count(*)::int as n from muted_cards')
  check('o teste não deixou card silenciado', limpo.n, 0)

  await db.end()
  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
