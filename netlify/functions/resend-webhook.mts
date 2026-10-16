import type { Config } from '@netlify/functions'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { recordRun } from '../lib/jobRuns.mjs'

/**
 * O que acontece com o email depois que a Resend o aceita.
 *
 * Até existir isto, "enviado" era o fim da história: a linha virava enviada e
 * ninguém nunca soubera se chegou. Um endereço com um dedo trocado ficava
 * marcado como enviado para sempre — o hub dizendo que avisou, o cliente
 * nunca tendo recebido.
 *
 * **A assinatura é conferida antes de tudo.** Este endereço é público; sem a
 * conferência, qualquer um poderia postar aqui e marcar o endereço de um
 * cliente como devolvido, calando os avisos dele. A Resend assina no padrão
 * Svix: HMAC-SHA256 sobre `id.timestamp.corpo`, com o segredo em base64
 * depois do `whsec_`.
 *
 * **Falha fechada.** Sem segredo configurado, nada é aceito. O preço é o
 * tratamento de devolução não funcionar até alguém configurar — e isso fica
 * visível em Settings, na linha da rotina, em vez de em silêncio.
 *
 * Variáveis de ambiente (no Netlify, nunca no repositório):
 *   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · RESEND_WEBHOOK_SECRET
 */

// Cinco minutos: o bastante para atraso de rede, pouco para alguém reusar uma
// requisição capturada.
const TOLERANCIA_MS = 5 * 60 * 1000

function db(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials')
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

/** A conferência da assinatura, no padrão Svix que a Resend usa. */
function assinaturaConfere(req: Request, corpo: string): boolean {
  const segredo = process.env.RESEND_WEBHOOK_SECRET
  if (!segredo) return false

  const id = req.headers.get('svix-id')
  const ts = req.headers.get('svix-timestamp')
  const assinaturas = req.headers.get('svix-signature')
  if (!id || !ts || !assinaturas) return false

  const quando = Number(ts) * 1000
  if (!Number.isFinite(quando)) return false
  if (Math.abs(Date.now() - quando) > TOLERANCIA_MS) return false

  const chave = Buffer.from(segredo.replace(/^whsec_/, ''), 'base64')
  const esperada = createHmac('sha256', chave)
    .update(`${id}.${ts}.${corpo}`)
    .digest('base64')

  // O cabeçalho traz uma ou mais, como "v1,abc v1,def": durante uma troca de
  // segredo a Resend manda as duas.
  for (const parte of assinaturas.split(' ')) {
    const [versao, valor] = parte.split(',')
    if (versao !== 'v1' || !valor) continue
    const a = Buffer.from(valor)
    const b = Buffer.from(esperada)
    // Comparação de tempo constante: comparar com `===` vaza, pelo tempo de
    // resposta, quantos caracteres iniciais estavam certos.
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return false
}

interface Evento {
  type?: string
  data?: {
    email_id?: string
    bounce?: { type?: string; subType?: string; message?: string }
    reason?: string
  }
}

export default async (req: Request) => {
  let nota = 'não chegou ao fim'
  let ok = false
  try {
    const corpo = await req.text()

    if (!assinaturaConfere(req, corpo)) {
      // Nem detalhe nem dica: quem está tentando adivinhar não ganha pistas.
      nota = process.env.RESEND_WEBHOOK_SECRET
        ? 'assinatura recusada'
        : 'sem RESEND_WEBHOOK_SECRET configurado'
      ok = true
      return new Response('no', { status: 401 })
    }

    const evento = JSON.parse(corpo) as Evento
    const id = evento.data?.email_id
    const tipo = String(evento.type ?? '')

    // Só três tipos importam. Abertura e clique são medidas de marketing e
    // não têm o que fazer num aviso de pedido.
    const traduzido = tipo === 'email.delivered' ? 'delivered'
      : tipo === 'email.bounced' ? 'bounced'
        : tipo === 'email.complained' ? 'complained'
          : null

    if (!id || !traduzido) {
      nota = `ignorado: ${tipo || 'sem tipo'}`
      ok = true
      return new Response('ok')
    }

    const permanente = String(evento.data?.bounce?.type ?? '').toLowerCase() === 'permanent'
    const detalhe = evento.data?.bounce?.message
      ?? evento.data?.reason
      ?? evento.data?.bounce?.subType
      ?? null

    const res = await db('rpc/record_email_event', {
      method: 'POST',
      body: JSON.stringify({
        p_provider_id: id,
        p_event: traduzido,
        p_detail: detalhe,
        p_permanent: permanente,
      }),
    })
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
    const casou = await res.json()

    nota = casou === true
      ? `${traduzido}${permanente ? ' permanente' : ''}`
      : `${traduzido} de um email que não é nosso`
    ok = true
    return new Response('ok')
  } catch (err) {
    nota = `falhou: ${(err as Error)?.message ?? String(err)}`.slice(0, 300)
    // Devolver 500 faz a Resend tentar de novo, que é o certo quando a falha
    // foi nossa.
    return new Response('erro', { status: 500 })
  } finally {
    await recordRun({ job: 'resend-webhook', note: nota, ok })
  }
}

export const config: Config = {
  path: '/api/resend-webhook',
}
