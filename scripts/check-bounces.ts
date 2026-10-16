// O que o provedor devolve, e quem pode contar isso ao hub.
//
//   node_modules/.bin/jiti scripts/check-bounces.ts
//
// O endereço do webhook é público. Sem conferência de assinatura, qualquer um
// poderia postar nele e marcar o email de um cliente como devolvido — calando
// os avisos daquele cliente sem que ninguém notasse. Metade deste arquivo é
// sobre isso; a outra metade é sobre o que uma devolução de verdade faz.

import { createRequire } from 'node:module'
import { createHmac } from 'node:crypto'
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

// ---------------------------------------------------------------------------
// A assinatura, conferida com a mesma conta que a função faz
// ---------------------------------------------------------------------------

const SEGREDO = 'whsec_' + Buffer.from('segredo-de-teste-para-conferir').toString('base64')

function assinar(id: string, ts: string, corpo: string, segredo = SEGREDO): string {
  const chave = Buffer.from(segredo.replace(/^whsec_/, ''), 'base64')
  return 'v1,' + createHmac('sha256', chave).update(`${id}.${ts}.${corpo}`).digest('base64')
}

const fonte = readFileSync('netlify/functions/resend-webhook.mts', 'utf8')
check('a função confere a assinatura antes de tudo',
  fonte.indexOf('assinaturaConfere') < fonte.indexOf('JSON.parse'), true)
check('sem segredo, nada é aceito', fonte.includes('if (!segredo) return false'), true)
// Comparar com === vaza, pelo tempo de resposta, quantos caracteres iniciais
// estavam certos — e com isso um atacante descobre a assinatura byte a byte.
check('a comparação é de tempo constante', fonte.includes('timingSafeEqual'), true)
check('requisição velha é recusada', fonte.includes('TOLERANCIA_MS'), true)
check('abertura e clique são ignorados',
  !fonte.includes("'email.opened'") && !fonte.includes("'email.clicked'"), true)

// A conta da assinatura, para garantir que o formato é o que a Resend manda.
const corpo = JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc' } })
const ts = String(Math.floor(Date.now() / 1000))
const boa = assinar('msg_1', ts, corpo)
check('a mesma entrada dá a mesma assinatura', assinar('msg_1', ts, corpo), boa)
check('id diferente muda a assinatura', assinar('msg_2', ts, corpo) === boa, false)
check('corpo diferente muda a assinatura', assinar('msg_1', ts, corpo + ' ') === boa, false)
check('segredo diferente muda a assinatura',
  assinar('msg_1', ts, corpo, 'whsec_' + Buffer.from('outro').toString('base64')) === boa, false)

async function main() {
  const url = readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim()
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await db.connect()

  // -------------------------------------------------------------------------
  // Quem pode registrar um evento
  // -------------------------------------------------------------------------
  const { rows: privs } = await db.query(`
    select has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as logado
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'record_email_event'`)
  // Só a chave de serviço, usada pela função que já conferiu a assinatura.
  // Um login do hub não pode marcar o cliente de ninguém como devolvido.
  check('anônimo não registra evento', privs[0].anon, false)
  check('nem um login do hub', privs[0].logado, false)

  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims',
    json_build_object('sub', (select id::text from users where role='admin' limit 1))::text, true)`)

  // -------------------------------------------------------------------------
  // O que uma devolução faz
  // -------------------------------------------------------------------------
  const { rows: [cli] } = await db.query(
    "select id, name from clients where btrim(coalesce(email,'')) <> '' limit 1")
  const { rows: [card] } = await db.query(
    'select id, ref_number from cards where client_id = $1 limit 1', [cli.id])

  await db.query(`
    insert into email_outbox (card_id, client_id, card_ref, client_name, to_email, kind,
                              status, provider_id)
    values ($1, $2, $3, $4, 'x@y.com', 'reminder', 'sent', 'prov_teste')`,
  [card.id, cli.id, card.ref_number, cli.name])

  // Id que não é nosso não marca nada de ninguém — é a defesa que resta se a
  // assinatura um dia vazar.
  const { rows: [inventado] } = await db.query(
    "select record_email_event('nao_existe', 'bounced', 'x', true) as achou")
  check('id desconhecido não marca nada', inventado.achou, false)

  const { rows: [entregue] } = await db.query(
    "select record_email_event('prov_teste', 'delivered') as achou")
  check('entrega é registrada', entregue.achou, true)
  const { rows: [linha1] } = await db.query(
    "select delivered_at is not null as ok from email_outbox where provider_id = 'prov_teste'")
  check('e fica na linha', linha1.ok, true)

  // Devolução temporária — caixa cheia, servidor fora do ar — não cala o
  // cliente: tratar isso igual a endereço inexistente apagaria um cliente bom
  // por causa de uma tarde ruim do provedor dele.
  await db.query("select record_email_event('prov_teste', 'bounced', 'mailbox full', false)")
  const { rows: [temp] } = await db.query(
    'select bounced_at is null as cliente_ok from clients where id = $1', [cli.id])
  check('devolução temporária não cala o cliente', temp.cliente_ok, true)

  await db.query("select record_email_event('prov_teste', 'bounced', 'no such user', true)")
  const { rows: [perm] } = await db.query(
    'select bounced_at is not null as calado, bounce_detail from clients where id = $1', [cli.id])
  check('devolução permanente cala o cliente', perm.calado, true)
  check('com o motivo guardado', perm.bounce_detail, 'no such user')

  // E aí o lembrete para de escolher esse cliente: sem isso, escreveria para
  // uma caixa inexistente de quinze em quinze dias, para sempre.
  const { rows: [vencidos] } = await db.query(
    'select count(*)::int as n from orders_needing_reminder(15) where client_id = $1', [cli.id])
  check('o lembrete para de escolher o cliente calado', vencidos.n, 0)

  // Corrigir o endereço devolve a voz a ele.
  await db.query(
    'update clients set email = $2, bounced_at = null, bounce_detail = null where id = $1',
    [cli.id, 'corrigido@exemplo.com'])
  const { rows: [voltou] } = await db.query(
    'select bounced_at is null as ok from clients where id = $1', [cli.id])
  check('corrigir o endereço limpa a marca', voltou.ok, true)

  // Prévia que devolve não cala cliente nenhum: ela nem foi para ele.
  await db.query(`
    insert into email_outbox (card_id, client_id, card_ref, client_name, to_email, kind,
                              status, provider_id, preview)
    values ($1, $2, $3, $4, 'eu@redantex.com.br', 'preview:reminder', 'sent', 'prov_previa', true)`,
  [card.id, cli.id, card.ref_number, cli.name])
  await db.query("select record_email_event('prov_previa', 'bounced', 'no such user', true)")
  const { rows: [previa] } = await db.query(
    'select bounced_at is null as cliente_ok from clients where id = $1', [cli.id])
  check('prévia devolvida não cala o cliente', previa.cliente_ok, true)

  await db.query('rollback')

  const { rows: [limpo] } = await db.query(
    "select count(*)::int as n from email_outbox where provider_id like 'prov_%'")
  check('o teste não deixou linha nenhuma', limpo.n, 0)
  const { rows: [clientes] } = await db.query(
    'select count(*)::int as n from clients where bounced_at is not null')
  check('nem cliente calado', clientes.n, 0)

  await db.end()
  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
