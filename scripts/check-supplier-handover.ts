// Trocar o fornecedor de um pedido.
//
//   node_modules/.bin/jiti scripts/check-supplier-handover.ts
//
// A regra mais dura deste sistema é que um fornecedor nunca vê o que é do
// outro, e trocar `supplier_id` era o buraco nela: o card leva junto a
// conversa, a arte e os preços. Este arquivo exerce a troca com os dois
// logins de verdade, dentro de uma transação desfeita no fim.

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

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

  // Dois fornecedores com login cada, que é o que torna o teste possível.
  const { rows: lados } = await db.query(`
    select s.short_name, u.id::text as login
      from suppliers s join users u on u.supplier_id = s.id
     where u.role = 'viewer' order by s.short_name`)
  const de = (lados as { short_name: string; login: string }[])
  check('há login dos dois lados', [...new Set(de.map((l) => l.short_name))].sort().length >= 2, true)
  const velho = de.find((l) => l.short_name === 'DEQI')!
  const novo = de.find((l) => l.short_name === 'Sconcept')!

  // Um card do fornecedor antigo que já tenha conversa dele dentro — é o
  // caso que interessa, e o que não existia nas duas trocas de setembro.
  const { rows: [alvo] } = await db.query(`
    select c.id, c.ref_number from cards c join suppliers s on s.id = c.supplier_id
     where s.short_name = 'DEQI'
       and exists (select 1 from comments m join users u on u.id = m.user_id
                    where m.card_id = c.id and u.supplier_id = s.id)
     limit 1`)
  check('há um card da DEQI com conversa dela', !!alvo?.id, true)

  const comoLogin = async (login: string, sql: string, args: unknown[] = []) => {
    await db.query(`select set_config('request.jwt.claims',
      json_build_object('sub', $1::text)::text, true)`, [login])
    await db.query('set local role authenticated')
    const { rows } = await db.query(sql, args)
    await db.query('reset role')
    return rows[0]
  }

  await db.query('begin')

  // Antes da troca: o dono vê a própria conversa.
  const antes = await comoLogin(velho.login,
    `select count(*)::int as n from comments m join users u on u.id = m.user_id
      where m.card_id = $1 and u.supplier_id is not null`, [alvo.id])
  check('antes, a DEQI lê o que escreveu', antes.n > 0, true)

  await db.query(
    "update cards set supplier_id = (select id from suppliers where short_name='Sconcept') where id = $1",
    [alvo.id])

  // Depois: o novo recebe o card e nada do que era do anterior.
  const cardNovo = await comoLogin(novo.login,
    'select count(*)::int as n from cards where id = $1', [alvo.id])
  check('o novo fornecedor passa a ver o card', cardNovo.n, 1)

  const conversaVelha = await comoLogin(novo.login,
    `select count(*)::int as n from comments m join users u on u.id = m.user_id
      where m.card_id = $1 and u.supplier_id is not null`, [alvo.id])
  check('e não lê a conversa do anterior', conversaVelha.n, 0)

  const arquivosVelhos = await comoLogin(novo.login,
    `select count(*)::int as n from attachments a join users u on u.id = a.user_id
      where a.card_id = $1 and u.supplier_id is not null`, [alvo.id])
  check('nem os arquivos do anterior', arquivosVelhos.n, 0)

  // O que é da Redantex continua chegando: o fornecedor novo precisa do
  // briefing, senão a troca o deixa cego.
  const daRedantex = await comoLogin(novo.login,
    `select count(*)::int as n from comments m join users u on u.id = m.user_id
      where m.card_id = $1 and u.supplier_id is null`, [alvo.id])
  const { rows: [existeRedantex] } = await db.query(
    `select count(*)::int as n from comments m join users u on u.id = m.user_id
      where m.card_id = $1 and u.supplier_id is null`, [alvo.id])
  check('mas lê o que a Redantex escreveu', daRedantex.n, existeRedantex.n)

  // O anterior perde o card inteiro, não só o acesso a escrever nele.
  const cardVelho = await comoLogin(velho.login,
    'select count(*)::int as n from cards where id = $1', [alvo.id])
  check('o anterior deixa de ver o card', cardVelho.n, 0)

  // E a Redantex continua vendo tudo: é dela o histórico.
  const { rows: [admin] } = await db.query("select id::text as id from users where role='admin' limit 1")
  const tudo = await comoLogin(admin.id,
    `select count(*)::int as n from comments m join users u on u.id = m.user_id
      where m.card_id = $1 and u.supplier_id is not null`, [alvo.id])
  check('a Redantex continua lendo a conversa antiga', tudo.n, antes.n)

  await db.query('rollback')

  // Card que nunca trocou de mãos não muda de comportamento: a regra nova
  // só aparece onde precisava aparecer.
  const semTroca = await comoLogin(velho.login,
    `select count(*)::int as n from comments m join cards c on c.id = m.card_id
      join suppliers s on s.id = c.supplier_id where s.short_name = 'DEQI'`)
  check('a DEQI continua lendo os cards dela', semTroca.n > 0, true)

  await db.end()
  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
