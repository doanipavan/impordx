// O link pessoal do vendedor.
//
//   node_modules/.bin/jiti scripts/check-sales-link.ts
//
// Este arquivo guarda uma porta: um endereço que abre sem conta e sem senha.
// O que ele verifica não é formatação — é quem consegue entrar, o que sai pela
// porta, e se trancá-la realmente tranca.

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
  await db.query('begin')

  // Tudo abaixo roda como um login da Redantex e é desfeito no fim.
  await db.query(`select set_config('request.jwt.claims',
    json_build_object('sub', (select id::text from users where role='admin' limit 1))::text, true)`)

  const { rows: [vendedor] } = await db.query(
    "select id, name from salespeople where name = 'Diego Prestes'")
  const { rows: [{ token }] } = await db.query(
    'select sales_link_create($1) as token', [vendedor.id])

  check('o token tem 48 caracteres', token.length, 48)
  check('e é hexadecimal', /^[0-9a-f]+$/.test(token), true)

  // O que torna o token um segredo: o banco não o tem. Quem lê a tabela
  // inteira não consegue abrir a carteira de ninguém.
  const { rows: [guardado] } = await db.query(
    'select count(*)::int as n from salesperson_links where token_hash = $1', [token])
  check('o banco não guarda o token', guardado.n, 0)
  const { rows: [hash] } = await db.query(
    `select count(*)::int as n from salesperson_links
      where token_hash = encode(extensions.digest($1, 'sha256'), 'hex') and revoked_at is null`,
    [token])
  check('guarda o hash dele', hash.n, 1)

  // ---------------------------------------------------------------------
  // O que sai pela porta
  // ---------------------------------------------------------------------
  const { rows: [{ view }] } = await db.query('select sales_link_view($1) as view', [token])
  check('o nome de quem abriu', view.vendedor, 'Diego Prestes')

  const { rows: [esperado] } = await db.query(
    `select count(*)::int as n from cards
      where salesperson_ref_id = $1 and board = 'orders'
        and not archived and status <> 'Lost'`, [vendedor.id])
  check('traz todos os pedidos dele', view.pedidos.length, esperado.n)

  // E nenhum de mais ninguém: é a pergunta que o link existe para responder.
  const { rows: refs } = await db.query(
    'select ref_number from cards where salesperson_ref_id is distinct from $1', [vendedor.id])
  const alheios = (refs as { ref_number: string }[]).map((r) => r.ref_number)
  check('e nenhum dos outros',
    view.pedidos.filter((p: { ref_number: string }) => alheios.includes(p.ref_number)), [])

  // O que não pode viajar num endereço que pode ser encaminhado.
  const campos = Object.keys(view.pedidos[0] ?? {})
  check('sem a proforma', campos.includes('pi_number'), false)
  check('sem a explicação da fábrica', campos.includes('delivery_date_change_reason'), false)
  check('sem preço em dólar', campos.some((c) => c.includes('usd')), false)
  check('sem o endereço do cliente', campos.includes('cliente_email'), false)
  check('mas diz se o cliente tem email', campos.includes('cliente_tem_email'), true)
  // O fornecedor viaja e não é desenhado: sem ele a previsão desta página
  // divergiria da do hub nos pedidos do outro fornecedor.
  check('o fornecedor vai junto, só para o prazo', campos.includes('fornecedor'), true)
  const corpo = JSON.stringify(view)
  check('o texto da fábrica não vazou em lugar nenhum',
    corpo.includes('working days') || corpo.includes('holidays'), false)

  // ---------------------------------------------------------------------
  // Trancar
  // ---------------------------------------------------------------------
  const { rows: [errado] } = await db.query(
    "select sales_link_view('naoexisteessetoken') as view")
  check('token inventado não abre nada', errado.view, null)
  const { rows: [vazio] } = await db.query('select sales_link_view(null) as view')
  check('token nulo também não', vazio.view, null)

  // Criar de novo revoga o anterior: dois links vivos significam que revogar
  // um não fecha a porta, e ninguém saberia disso até precisar.
  const { rows: [{ token: segundo }] } = await db.query(
    'select sales_link_create($1) as token', [vendedor.id])
  const { rows: [{ view: velho }] } = await db.query('select sales_link_view($1) as view', [token])
  check('o link antigo morre quando se cria outro', velho, null)
  const { rows: [{ view: novo }] } = await db.query('select sales_link_view($1) as view', [segundo])
  check('e o novo abre', novo?.vendedor, 'Diego Prestes')
  const { rows: [vivos] } = await db.query(
    'select count(*)::int as n from salesperson_links where salesperson_id = $1 and revoked_at is null',
    [vendedor.id])
  check('um link vivo por vendedor', vivos.n, 1)

  await db.query('select sales_link_revoke($1)', [vendedor.id])
  const { rows: [{ view: depois }] } = await db.query('select sales_link_view($1) as view', [segundo])
  check('revogar fecha na hora', depois, null)

  // As aberturas são contadas: "nunca abriu" é informação sobre a pessoa, não
  // sobre o sistema.
  const { rows: [contagem] } = await db.query(
    `select max(open_count)::int as n, bool_or(first_opened_at is not null) as primeira
       from salesperson_links where salesperson_id = $1`, [vendedor.id])
  check('as aberturas foram contadas', contagem.n >= 1, true)
  check('e a primeira ficou marcada', contagem.primeira, true)

  await db.query('rollback')

  // ---------------------------------------------------------------------
  // Quem pode chamar o quê
  // ---------------------------------------------------------------------
  const { rows: privs } = await db.query(`
    select p.proname::text as fn,
           has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'sales_link%'
     order by 1`)
  const porNome = Object.fromEntries(
    (privs as { fn: string; anon: boolean }[]).map((p) => [p.fn, p.anon]))
  // Ler é de quem tem o token, inclusive sem conta. Criar e revogar, não:
  // senão qualquer visitante emitiria um link para a carteira que quisesse.
  check('anônimo abre o link', porNome.sales_link_view, true)
  check('anônimo não cria link', porNome.sales_link_create, false)
  check('anônimo não revoga link', porNome.sales_link_revoke, false)

  // Escrita na tabela é só pelas funções, que conferem ser Redantex por
  // dentro. Sem política de insert, nem um login do hub forja um link.
  const { rows: pol } = await db.query(
    "select cmd::text from pg_policies where tablename = 'salesperson_links' order by cmd")
  check('a tabela é só de leitura pela API',
    (pol as { cmd: string }[]).map((p) => p.cmd), ['SELECT'])

  // Linha revogada fica: é registro verdadeiro de um link que existiu e foi
  // aberto. O que não pode sobrar é link **vivo** criado por um teste — esse
  // seria uma porta aberta que ninguém sabe que existe.
  const { rows: [sobrou] } = await db.query(
    'select count(*)::int as n from salesperson_links where revoked_at is null')
  check('o teste não deixou link vivo para trás', sobrou.n, 0)

  await db.end()
  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
