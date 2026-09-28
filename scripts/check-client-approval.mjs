// A migração 046 contra o banco real, dentro de uma transação sempre desfeita:
// quem pode criar o link, o que ele entrega, o que ele recusa, e o que sobra
// gravado depois da assinatura.
//
//   node scripts/check-client-approval.mjs            # regras já aplicadas
//   node scripts/check-client-approval.mjs --apply    # aplica 046 antes (e desfaz)
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const { Client } = createRequire(join(homedir(), '.rdx-dbtool/db.mjs'))('pg')
const db = new Client({ connectionString: readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim(), ssl: { rejectUnauthorized: false } })

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? '  ok ' : 'FAIL '} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}
async function refused(sql, params = []) {
  await db.query('savepoint s')
  try { await db.query(sql, params); await db.query('release savepoint s'); return null }
  catch (e) { await db.query('rollback to savepoint s'); return e.message }
}
const asUser = (id) => db.query(`select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])
const asAnon = () => db.query(`select set_config('request.jwt.claims', '', true), set_config('role', 'anon', true)`)
const asOwner = () => db.query(`select set_config('request.jwt.claims', '', true), set_config('role', 'postgres', true)`)

try {
  await db.connect()
  await db.query('begin')
  if (process.argv.includes('--apply')) {
    await db.query(readFileSync('supabase/migrations/046_the_client_signs_the_art.sql', 'utf8'))
    console.log('046 aplicada dentro da transação')
  }

  const { rows: [me] } = await db.query(`select id from users where email = 'doanipavan@me.com'`)
  const { rows: [supplier] } = await db.query(`select id from users where role = 'viewer' limit 1`)
  // Um card com arte e com preço, para provar que o preço não atravessa.
  const { rows: [card] } = await db.query(`
    select c.id, c.ref_number, c.title, c.value_brl from cards c
     where c.ref_number = 'ORD-2026-10037'`)
  const { rows: files } = await db.query(
    `select id, filename, kind from attachments where card_id = $1 order by created_at desc`, [card.id])
  const art = files.find(f => f.filename === 'approved artwork marina.png') ?? files[0]
  const other = files.find(f => f.id !== art.id)
  const { rows: [elsewhere] } = await db.query(
    `select id from attachments where card_id <> $1 limit 1`, [card.id])

  await db.query(`update cards set value_brl = 12345.67 where id = $1`, [card.id])

  // ── quem pode criar ───────────────────────────────────────────────────────
  await asUser(supplier.id)
  const bySupplier = await refused(`select * from approval_create($1, $2)`, [card.id, [art.id]])
  check('o fornecedor não cria link', !!bySupplier && bySupplier.includes('Only Redantex'), bySupplier ?? 'criou')

  await asAnon()
  const byAnon = await refused(`select * from approval_create($1, $2)`, [card.id, [art.id]])
  check('anônimo não cria link', !!byAnon, byAnon ?? 'criou')

  await asUser(me.id)
  const crossCard = await refused(`select * from approval_create($1, $2)`, [card.id, [elsewhere.id]])
  check('arquivo de outro card é recusado', !!crossCard && crossCard.includes('must belong'), crossCard ?? 'aceitou')

  const empty = await refused(`select * from approval_create($1, $2)`, [card.id, []])
  check('link sem arquivo é recusado', !!empty, empty ?? 'aceitou')

  const { rows: [created] } = await db.query(`select * from approval_create($1, $2)`, [card.id, [art.id]])
  check('a Redantex cria o link', !!created.token && created.token.length === 48, String(created.token?.length))
  check('a validade nasce ~30 dias à frente',
    Math.round((new Date(created.expires_at) - Date.now()) / 86_400_000) === 30)

  const { rows: [stored] } = await db.query(`select token_hash, attachment_ids, include_specs from approval_requests
    where token_hash = encode(digest($1,'sha256'),'hex')`, [created.token])
  check('o token não fica guardado em claro', stored.token_hash !== created.token)

  const { rows: [logged] } = await db.query(
    `select action from activity_logs where card_id = $1 order by created_at desc limit 1`, [card.id])
  check('sai no histórico do card', logged.action === 'approval_sent', logged.action)

  // ── o que o cliente vê ────────────────────────────────────────────────────
  await asAnon()
  const { rows: [{ approval_view: view }] } = await db.query(`select approval_view($1)`, [created.token])
  check('o link abre', view.state === 'open', view.state)
  check('traz a referência e o título', view.reference === card.ref_number && view.title === card.title)
  check('traz só o arquivo escolhido', view.files.length === 1 && view.files[0].filename === art.filename,
    JSON.stringify(view.files.map(f => f.filename)))
  check('sem ficha quando não foi pedida', view.specs === null, JSON.stringify(view.specs))
  check('diz quem enviou', typeof view.sent_by === 'string' && view.sent_by.length > 0)

  const asText = JSON.stringify(view)
  check('não vaza preço', !asText.includes('12345.67') && !/value_brl/.test(asText))
  check('não vaza fornecedor', !/DEQI|Sconcept|supplier/i.test(asText))
  check('não vaza os outros arquivos do card', !asText.includes(other.filename))

  const bad = (await db.query(`select approval_view('naoexiste')`)).rows[0].approval_view
  check('token inventado não abre nada', bad.state === 'unknown', bad.state)

  // ── a ficha, quando pedida ────────────────────────────────────────────────
  await asUser(me.id)
  const { rows: [withSpecs] } = await db.query(`select * from approval_create($1, $2, true)`, [card.id, [art.id]])
  await asAnon()
  const v2 = (await db.query(`select approval_view($1)`, [withSpecs.token])).rows[0].approval_view
  check('a ficha aparece quando pedida', Array.isArray(v2.specs) && v2.specs.length > 0,
    JSON.stringify(v2.specs))
  check('a ficha não traz preço', !JSON.stringify(v2.specs).includes('12345'))

  // ── assinar ───────────────────────────────────────────────────────────────
  const snapshot = { reference: view.reference, files: view.files, terms: 'v1' }
  const sign = (token, over = {}) => {
    const p = {
      name: 'Marina Brandão', email: 'marina@marinajoias.com.br', decision: 'approved',
      terms: true, note: null, ua: 'probe', ...over,
    }
    return db.query(`select approval_sign($1,$2,$3,$4,$5,$6,$7,$8)`,
      [token, p.name, p.email, p.decision, p.terms, JSON.stringify(snapshot), p.note, p.ua])
  }

  check('nome curto é recusado', !!(await refused(`select approval_sign($1,'Ma','a@b.co','approved',true,'{}')`, [created.token])))
  check('e-mail inválido é recusado', !!(await refused(`select approval_sign($1,'Marina Brandão','sem-arroba','approved',true,'{}')`, [created.token])))
  const noTerms = await refused(`select approval_sign($1,'Marina Brandão','m@x.com','approved',false,'{}')`, [created.token])
  check('aprovar sem aceitar o termo é recusado', !!noTerms && noTerms.includes('Termo'), noTerms ?? 'aceitou')
  const noReason = await refused(`select approval_sign($1,'Marina Brandão','m@x.com','changes',false,'{}',NULL)`, [created.token])
  check('pedir ajuste sem motivo é recusado', !!noReason, noReason ?? 'aceitou')

  const { rows: [{ approval_sign: signed }] } = await sign(created.token)
  check('a assinatura passa', signed.ok === true)

  // A leitura é da Redantex: como anônimo a RLS esconde a linha — o que o
  // último bloco deste teste prova de propósito.
  await asOwner()
  const { rows: [sig] } = await db.query(`select s.* from approval_signatures s
    join approval_requests r on r.id = s.request_id where r.token_hash = encode(digest($1,'sha256'),'hex')`, [created.token])
  check('grava nome, e-mail e o aceite do termo',
    sig.signer_name === 'Marina Brandão' && sig.signer_email === 'marina@marinajoias.com.br' && sig.accepted_terms === true)
  check('grava o retrato e o hash', sig.snapshot_hash.length === 64 && sig.snapshot.reference === card.ref_number)

  await asAnon()
  const twice = await refused(`select approval_sign($1,'Outra Pessoa','o@x.com','approved',true,'{}')`, [created.token])
  check('o link não assina duas vezes', !!twice && twice.includes('already signed'), twice ?? 'assinou de novo')

  const after = (await db.query(`select approval_view($1)`, [created.token])).rows[0].approval_view
  check('depois de assinar o link mostra o comprovante', after.state === 'signed', after.state)
  check('o comprovante traz quem assinou', after.signature.name === 'Marina Brandão')

  // ── o que mudou no card ───────────────────────────────────────────────────
  await asOwner()
  const { rows: [stamped] } = await db.query(
    `select client_approved_at, client_approved_by from cards where id = $1`, [card.id])
  check('o card ganha o selo do cliente',
    stamped.client_approved_by === 'Marina Brandão' && stamped.client_approved_at !== null)
  const { rows: [approvedArt] } = await db.query(
    `select approved_at, approval_note from attachments where id = $1`, [art.id])
  check('a arte assinada vira arte aprovada',
    approvedArt.approved_at !== null && approvedArt.approval_note.includes('Marina Brandão'))
  const { rows: [notified] } = await db.query(
    `select count(*)::int as n from notifications where card_id = $1 and type = 'client_approved'`, [card.id])
  check('a Redantex é avisada', notified.n > 0, String(notified.n))
  const { rows: [noSupplier] } = await db.query(
    `select count(*)::int as n from notifications n join users u on u.id = n.user_id
      where n.card_id = $1 and n.type = 'client_approved' and u.role = 'viewer'`, [card.id])
  check('o fornecedor não é avisado', noSupplier.n === 0, String(noSupplier.n))

  // ── validade e cancelamento ───────────────────────────────────────────────
  await asUser(me.id)
  const { rows: [toRevoke] } = await db.query(`select * from approval_create($1, $2)`, [card.id, [art.id]])
  const { rows: [req] } = await db.query(`select id from approval_requests where token_hash = encode(digest($1,'sha256'),'hex')`, [toRevoke.token])
  await db.query(`select approval_revoke($1)`, [req.id])
  await asAnon()
  const revoked = (await db.query(`select approval_view($1)`, [toRevoke.token])).rows[0].approval_view
  check('link cancelado não abre', revoked.state === 'revoked', revoked.state)
  const signRevoked = await refused(`select approval_sign($1,'Marina Brandão','m@x.com','approved',true,'{}')`, [toRevoke.token])
  check('link cancelado não assina', !!signRevoked && signRevoked.includes('cancelled'), signRevoked ?? 'assinou')

  await asUser(me.id)
  const { rows: [toExpire] } = await db.query(`select * from approval_create($1, $2)`, [card.id, [art.id]])
  await asOwner()
  await db.query(`update approval_requests set expires_at = now() - interval '1 day'
    where token_hash = encode(digest($1,'sha256'),'hex')`, [toExpire.token])
  await asAnon()
  const expired = (await db.query(`select approval_view($1)`, [toExpire.token])).rows[0].approval_view
  check('link vencido não abre', expired.state === 'expired', expired.state)

  // ── as tabelas não são lidas por fora ─────────────────────────────────────
  await asUser(supplier.id)
  const { rows: [seenBySupplier] } = await db.query(`select count(*)::int as n from approval_requests`)
  check('o fornecedor não lê os pedidos de aprovação', seenBySupplier.n === 0, String(seenBySupplier.n))
  const { rows: [sigsBySupplier] } = await db.query(`select count(*)::int as n from approval_signatures`)
  check('nem as assinaturas', sigsBySupplier.n === 0, String(sigsBySupplier.n))
  await asAnon()
  const { rows: [seenByAnon] } = await db.query(`select count(*)::int as n from approval_requests`)
  check('anônimo não lê os pedidos', seenByAnon.n === 0, String(seenByAnon.n))

  console.log(failures ? `\n${failures} FALHARAM` : '\ntudo certo')
} finally {
  await db.query('rollback').catch(() => {})
  await db.end()
}
process.exit(failures ? 1 : 0)
