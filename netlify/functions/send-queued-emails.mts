import type { Config } from '@netlify/functions'
import { clientEmail } from '../lib/clientEmail.mjs'

/**
 * Esvazia a fila de emails do cliente.
 *
 * O gatilho do banco anota; esta função envia. A separação existe porque um
 * gatilho roda dentro da transação que move o card: se o provedor de email
 * estiver fora do ar, arrastar um pedido no quadro passaria a falhar. Aqui o
 * pior caso é o email sair quinze minutos depois.
 *
 * Variáveis de ambiente (no Netlify, nunca no repositório):
 *   SUPABASE_URL                mesma URL que o app usa
 *   SUPABASE_SERVICE_ROLE_KEY   lê e escreve por cima do RLS
 *   RESEND_API_KEY              o provedor
 *   CLIENT_FROM                 remetente dos emails de cliente;
 *                               na falta dele, cai em SUMMARY_FROM
 */

const BATCH = 25

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
}

/** O dia de hoje em São Paulo, como `YYYY-MM-DD`. */
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/** Um `timestamptz` vira o dia em que ele caiu em São Paulo. */
function stampDay(iso?: string | null): string | undefined {
  if (!iso) return undefined
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso))
}

/** Uma `date` já é um dia; o que não pode é virar instante no caminho. */
const plainDay = (value?: string | null) => (value ? String(value).slice(0, 10) : undefined)

const CARD_FIELDS = [
  'ref_number', 'status', 'sample_approved_at', 'order_confirmed_at', 'status_since',
  'delivery_date', 'shipped_at', 'arrived_at',
  'salesperson:users!cards_salesperson_id_fkey(full_name,email)',
  'card_items(size,quantity,sort_order)',
].join(',')

async function loadCard(cardId: string) {
  const res = await db(`cards?id=eq.${cardId}&select=${encodeURIComponent(CARD_FIELDS)}`)
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  const rows = await res.json()
  return rows?.[0] ?? null
}

async function markRow(id: string, patch: Record<string, unknown>) {
  const res = await db(`email_outbox?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    // Falhar aqui depois de o email ter saído é o pior caso da função: a
    // linha continua pendente e o cliente receberia duas vezes. Vale um log
    // alto, porque é o único rastro que sobra.
    console.error(`Could not mark outbox row ${id}:`, await res.text())
  }
}

async function send(row: OutboxRow): Promise<void> {
  if (!row.card_id) throw new Error('card was deleted before the email went out')

  const card = await loadCard(row.card_id)
  if (!card) throw new Error('card no longer exists')

  // `stage:Placed` vira `Placed`; os avulsos — reminder, date-change,
  // date-confirmed, sample-approved — valem por si. A primeira versão
  // mandava tudo que não fosse `stage:` para 'reminder', e o aviso de
  // mudança de data teria saído com o texto do lembrete.
  const stage = row.kind.startsWith('stage:') ? row.kind.slice('stage:'.length) : row.kind

  const items = (card.card_items ?? [])
    .slice()
    .sort((a: { sort_order?: number }, b: { sort_order?: number }) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((i: { size?: string; quantity?: number }) => ({ size: i.size, quantity: i.quantity }))

  const mail = clientEmail({
    stage,
    currentStage: card.status,
    client: row.client_name ?? 'cliente',
    salesperson: card.salesperson?.full_name?.split(' ')?.[0],
    items,
    sampleApprovedOn: plainDay(card.sample_approved_at),
    placedOn: stampDay(card.order_confirmed_at),
    // Só sabemos o dia em que a produção começou enquanto o card está nela:
    // `status_since` é reescrito na etapa seguinte. Passado esse momento, a
    // casa fica sem data em vez de mostrar uma errada.
    productionOn: card.status === 'In Production' ? stampDay(card.status_since) : undefined,
    readyOn: plainDay(card.delivery_date),
    shippedOn: stampDay(card.shipped_at),
    arrivedOn: stampDay(card.arrived_at),
    today: todayInSaoPaulo(),
  })

  const from = process.env.CLIENT_FROM || required('SUMMARY_FROM')
  // O vendedor entra em cópia, não numa mensagem separada: ele vê exatamente
  // o que o cliente leu, com as mesmas palavras e a mesma data — e o cliente
  // vê que o contato dele está junto. Em cópia aberta, de propósito: o
  // Reply-To já revela o endereço, e esconder quem está na conversa com um
  // cliente é o tipo de esperteza que estraga a confiança.
  const salesEmail = card.salesperson?.email
  const replyTo = salesEmail

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${required('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [row.to_email],
      ...(salesEmail ? { cc: [salesEmail] } : {}),
      // A promessa do rodapé — "responda este email e ele vai direto para
      // Patrick" — só é verdade por causa desta linha.
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  })

  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)

  await markRow(row.id, {
    status: 'sent',
    sent_at: new Date().toISOString(),
    subject: mail.subject,
    attempts: 1,
  })
}

export default async () => {
  const res = await db(
    `email_outbox?status=eq.pending&attempts=lt.3&order=created_at.asc&limit=${BATCH}` +
    '&select=id,card_id,client_name,to_email,kind')
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)

  const rows: OutboxRow[] = await res.json()
  let sent = 0
  const failed: string[] = []

  for (const row of rows) {
    try {
      await send(row)
      sent++
    } catch (err) {
      // Uma linha ruim não pode travar a fila inteira: marca e segue. Depois
      // de três tentativas ela para de ser tentada e fica visível na tabela.
      const message = (err as Error)?.message ?? String(err)
      failed.push(`${row.id}: ${message}`)
      const res2 = await db(`email_outbox?id=eq.${row.id}&select=attempts`)
      const current = res2.ok ? (await res2.json())?.[0]?.attempts ?? 0 : 0
      await markRow(row.id, {
        attempts: current + 1,
        error: message.slice(0, 500),
        ...(current + 1 >= 3 ? { status: 'failed' } : {}),
      })
    }
  }

  if (failed.length) console.error('Outbox failures:', failed)

  return new Response(JSON.stringify({ picked: rows.length, sent, failed: failed.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// De quinze em quinze minutos. Uma mudança de etapa é notícia do dia, não do
// minuto — e esperar um pouco é o preço de o quadro nunca depender do email.
export const config: Config = {
  schedule: '*/15 * * * *',
}
