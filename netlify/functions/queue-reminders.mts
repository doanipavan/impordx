import type { Config } from '@netlify/functions'

/**
 * Enfileira o lembrete dos pedidos que ficaram quinze dias sem notícia.
 *
 * Quem decide quem entra é `orders_needing_reminder`, no banco (052): pedido
 * aberto, cliente com endereço, e nenhum email enviado ou pendente nos
 * últimos N dias. A conta olha a fila, não a etapa — qualquer mensagem que
 * tenha saído naquele período já quebra o silêncio, e o cliente não recebe um
 * "nada mudou" em cima de um aviso de ontem.
 *
 * Esta função só anota. Quem envia é `send-queued-emails`, de quinze em
 * quinze minutos.
 */

const DIAS = 15

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

interface Pending {
  card_id: string
  client_id: string
  card_ref: string
  client_name: string
  to_email: string
}

/** O mesmo freio da função que envia: parado é parado dos dois lados. */
async function enabled(): Promise<boolean> {
  const res = await db('app_flags?key=eq.client_emails&select=enabled')
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return (await res.json())?.[0]?.enabled === true
}

export default async () => {
  // Com o freio puxado nem se enfileira: lembrete acumulado vira enxurrada
  // quando alguém solta o freio.
  if (!await enabled()) {
    return new Response(JSON.stringify({ paused: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await db('rpc/orders_needing_reminder', {
    method: 'POST',
    body: JSON.stringify({ dias: DIAS }),
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)

  const pending: Pending[] = await res.json()
  if (pending.length === 0) {
    // Silêncio aqui é resultado, não falha: significa que todo mundo foi
    // avisado de alguma coisa nos últimos quinze dias.
    return new Response(JSON.stringify({ queued: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rows = pending.map(p => ({
    card_id: p.card_id,
    client_id: p.client_id,
    card_ref: p.card_ref,
    client_name: p.client_name,
    to_email: p.to_email,
    kind: 'reminder',
  }))

  const ins = await db('email_outbox', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!ins.ok) throw new Error(`Supabase ${ins.status}: ${await ins.text()}`)

  return new Response(JSON.stringify({ queued: rows.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// 12:00 UTC — 09:00 em São Paulo, depois de o escritório abrir e antes de a
// fábrica fechar na China.
export const config: Config = {
  schedule: '0 12 * * *',
}
