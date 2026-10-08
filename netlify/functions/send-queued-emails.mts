import type { Config } from '@netlify/functions'
import { clientEmail, cardToEmailInput } from '../lib/clientEmail.mjs'

/**
 * Esvazia a fila de emails do cliente.
 *
 * O gatilho do banco anota; esta função envia. A separação existe porque um
 * gatilho roda dentro da transação que move o card: se o provedor de email
 * estiver fora do ar, arrastar um pedido no quadro passaria a falhar. Aqui o
 * pior caso é o email sair quinze minutos depois.
 *
 * Duas decisões que valem mais que o resto, porque isto chega a cliente:
 *
 *   **A linha é reservada antes do envio, não depois.** Se o envio desse
 *   certo e a marcação falhasse, a próxima rodada mandaria de novo — e um
 *   email repetido para um cliente é pior do que um email perdido. Então a
 *   linha é marcada como enviada primeiro, com um filtro que só pega quem
 *   ainda está pendente: duas execuções simultâneas não disputam a mesma.
 *
 *   **O estado é reconferido na hora de enviar.** Entre a anotação e o envio
 *   podem passar quinze minutos, e nesse intervalo o card pode ter sido
 *   arquivado, dado como perdido, ou o endereço do cliente pode ter sido
 *   apagado — que é como alguém diz "pare de escrever para ele".
 *
 * Variáveis de ambiente (no Netlify, nunca no repositório):
 *   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · RESEND_API_KEY
 *   CLIENT_FROM — remetente; na falta dele, cai em SUMMARY_FROM
 */

const BATCH = 25
const MAX_ATTEMPTS = 3

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

function db(path: string, init: RequestInit = {}) {
  const url = required('SUPABASE_URL')
  const key = required('SUPABASE_SERVICE_ROLE_KEY')
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

interface OutboxRow {
  id: string
  card_id: string | null
  client_name: string | null
  to_email: string
  kind: string
  attempts: number
}

/** Erro que não adianta tentar de novo: o mundo mudou, não a rede. */
class Settled extends Error {}

/** O dia de hoje em São Paulo, como `YYYY-MM-DD`. */
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

const CARD_FIELDS = [
  'ref_number', 'status', 'archived',
  'sample_approved_at', 'order_confirmed_at', 'status_since',
  'delivery_date', 'shipped_at', 'arrived_at',
  'salesperson:users!cards_salesperson_id_fkey(full_name,email,role)',
  'client:clients(name,email)',
  'card_items(size,quantity,sort_order)',
].join(',')

async function loadCard(cardId: string) {
  const res = await db(`cards?id=eq.${cardId}&select=${encodeURIComponent(CARD_FIELDS)}`)
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return (await res.json())?.[0] ?? null
}

async function patchRow(id: string, patch: Record<string, unknown>, onlyIfPending = false) {
  const filter = onlyIfPending ? '&status=eq.pending' : ''
  const res = await db(`email_outbox?id=eq.${id}${filter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return (await res.json()) as unknown[]
}

async function send(row: OutboxRow): Promise<'sent' | 'skipped'> {
  if (!row.card_id) throw new Settled('o card foi apagado antes de o email sair')

  const card = await loadCard(row.card_id)
  if (!card) throw new Settled('o card não existe mais')
  if (card.archived) throw new Settled('o card foi arquivado')
  if (card.status === 'Lost') throw new Settled('o pedido foi dado como perdido')

  // O endereço de agora manda sobre o que foi anotado: apagar o email do
  // cliente é a forma de dizer "pare de escrever para ele", e corrigir um
  // erro de digitação tem que valer para o que ainda não saiu.
  const destino = String(card.client?.email ?? '').trim()
  if (!destino) throw new Settled('o cliente não tem mais endereço cadastrado')

  const stage = row.kind.startsWith('stage:') ? row.kind.slice('stage:'.length) : row.kind

  const mail = clientEmail(cardToEmailInput(card, {
    stage,
    client: card.client?.name ?? row.client_name ?? 'cliente',
    today: todayInSaoPaulo(),
  }))

  // Reserva a linha antes de enviar. Se outra execução já a pegou, o PATCH
  // não devolve nada e esta aqui desiste sem mandar.
  const claimed = await patchRow(row.id, {
    status: 'sent',
    sent_at: new Date().toISOString(),
    attempts: (row.attempts ?? 0) + 1,
    subject: mail.subject,
    error: null,
  }, true)
  if (claimed.length === 0) return 'skipped'

  const from = process.env.CLIENT_FROM || required('SUMMARY_FROM')
  // Cópia só para quem é da Redantex. O fornecedor nunca entra num email de
  // cliente — veria o endereço dele e a relação comercial inteira.
  const sales = card.salesperson
  const salesEmail = sales?.role === 'admin' || sales?.role === 'member' ? sales.email : null

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${required('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [destino],
      ...(salesEmail ? { cc: [salesEmail] } : {}),
      // A promessa do rodapé — "responda este email e ele vai direto para
      // Patrick" — só é verdade por causa desta linha.
      ...(salesEmail ? { reply_to: salesEmail } : {}),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  })

  if (!res.ok) {
    // A reserva precisa voltar atrás, senão a linha fica como enviada sem
    // ter saído. 4xx da Resend é endereço ou conteúdo: não melhora tentando.
    const detail = `Resend ${res.status}: ${(await res.text()).slice(0, 400)}`
    const fatal = res.status >= 400 && res.status < 500 && res.status !== 429
    const attempts = (row.attempts ?? 0) + 1
    await patchRow(row.id, {
      status: fatal || attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      sent_at: null,
      error: detail,
    })
    throw new Error(detail)
  }

  return 'sent'
}

export default async () => {
  const res = await db(
    `email_outbox?status=eq.pending&attempts=lt.${MAX_ATTEMPTS}&order=created_at.asc&limit=${BATCH}` +
    '&select=id,card_id,client_name,to_email,kind,attempts')
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)

  const rows: OutboxRow[] = await res.json()
  let sent = 0, skipped = 0
  const failed: string[] = []

  for (const row of rows) {
    try {
      if (await send(row) === 'sent') sent++; else skipped++
    } catch (err) {
      const message = (err as Error)?.message ?? String(err)
      failed.push(`${row.id} (${row.kind}): ${message}`)
      // Um mundo que mudou não é falha de rede: encerra a linha de vez, com
      // o motivo legível na tabela.
      if (err instanceof Settled) {
        await patchRow(row.id, {
          status: 'failed', attempts: MAX_ATTEMPTS, sent_at: null, error: message,
        }).catch(() => {})
      }
      // Os outros casos já se marcaram dentro de `send`.
    }
  }

  if (failed.length) console.error('Outbox:', failed)

  return new Response(JSON.stringify({ picked: rows.length, sent, skipped, failed: failed.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// De quinze em quinze minutos. Uma mudança de etapa é notícia do dia, não do
// minuto — e esperar um pouco é o preço de o quadro nunca depender do email.
export const config: Config = {
  schedule: '*/15 * * * *',
}
