import type { Config } from '@netlify/functions'
import { dailyReport } from '../lib/dailyReport.mjs'
import { recordRun } from '../lib/jobRuns.mjs'

/**
 * O panorama diário da Redantex: um kanban de meses, às 8h.
 *
 * Três coisas mudaram em 9 out 2026, quando o Patrick passou a receber:
 *
 *   **A manchete era US$ 0,00.** Somava `value_usd`, que nunca foi preenchido
 *   em pedido nenhum — o dinheiro mora em `value_brl`. O maior número do email
 *   era zero todos os dias.
 *
 *   **As etapas tinham envelhecido.** A seção de amostras procurava
 *   `Under Revision`, e a etapa real é `Under RDX Revision`: dizia "8 total"
 *   seguido de quatro zeros. O desenho novo não lista etapa por nome, então o
 *   problema deixou de existir em vez de ser remendado.
 *
 *   **Os destinatários moravam numa variável de ambiente**, e variável só vale
 *   no deploy seguinte: incluir alguém custava quinze créditos e acesso ao
 *   painel do Netlify. Agora moram em `report_recipients` (059) e viram numa
 *   tela. A variável fica como rede de segurança para o caso de a tabela estar
 *   vazia — um relatório que para de chegar em silêncio é pior que um
 *   relatório com um destinatário a mais.
 *
 * Variáveis de ambiente (no Netlify, nunca no repositório):
 *   SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · RESEND_API_KEY
 *   SUMMARY_FROM · SUMMARY_RECIPIENTS (reserva)
 */

// Retrato antigo não serve para comparar nem para consultar; quatro meses é
// folga suficiente para olhar para trás sem a tabela crescer para sempre.
const GUARDA_DIAS = 120

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

async function get(path: string) {
  const res = await db(path)
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return res.json()
}

/** Hoje em São Paulo, como `YYYY-MM-DD`. */
function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

const CAMPOS = [
  'id', 'ref_number', 'status', 'archived', 'client_name', 'value_brl',
  'salesperson_name', 'sample_approved_at', 'order_confirmed_at',
  'delivery_date', 'arrived_at',
  'client:clients(name,email)',
].join(',')

async function destinatarios(): Promise<string[]> {
  const linhas = await get('report_recipients?select=email&active=is.true')
  const lista = (linhas as { email: string }[])
    .map((r) => String(r.email ?? '').trim())
    .filter(Boolean)
  if (lista.length > 0) return [...new Set(lista)]

  // Tabela vazia: cai na variável antiga em vez de não mandar nada.
  const reserva = (process.env.SUMMARY_RECIPIENTS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean)
  if (reserva.length === 0) {
    throw new Error('Nobody to send to: report_recipients is empty and SUMMARY_RECIPIENTS is unset')
  }
  return [...new Set(reserva)]
}

/**
 * O retrato mais recente anterior a hoje.
 *
 * Anterior a hoje, e não "o último": se esta função rodar duas vezes no mesmo
 * dia, comparar com o retrato de hoje não acharia mudança nenhuma e o aviso
 * desapareceria da segunda cópia do email.
 */
async function retratoAnterior(dia: string) {
  const ultimo = await get(
    `arrival_snapshots?select=taken_on&taken_on=lt.${dia}&order=taken_on.desc&limit=1`)
  const quando = (ultimo as { taken_on: string }[])[0]?.taken_on
  if (!quando) return { quando: null, linhas: [] }
  const linhas = await get(
    `arrival_snapshots?select=card_id,card_ref,client_name,month,value_brl&taken_on=eq.${quando}`)
  return { quando, linhas }
}

export default async () => {
  // O batimento sai no `finally`: a tela de Settings precisa saber tanto que a
  // rotina rodou quanto que ela falhou, e uma falha que não registra nada é
  // indistinguível de um agendamento que parou.
  let nota = 'não chegou ao fim'
  let ok = false
  try {
    return await rodar((n) => { nota = n; ok = true })
  } catch (err) {
    nota = `falhou: ${(err as Error)?.message ?? String(err)}`.slice(0, 300)
    throw err
  } finally {
    await recordRun({ job: 'daily-summary', note: nota, ok })
  }
}

async function rodar(anotar: (nota: string) => void) {
  const dia = hoje()
  const cards = await get(`cards?select=${encodeURIComponent(CAMPOS)}&board=eq.orders&archived=eq.false`)
  const { quando, linhas } = await retratoAnterior(dia)

  const { subject, html, text, rows, moves } =
    dailyReport({ cards, previous: linhas, today: dia })

  const para = await destinatarios()

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${required('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: required('SUMMARY_FROM'), to: para, subject, html, text }),
  })
  if (!res.ok) {
    // O motivo do provedor é a diferença entre um relatório consertável e um
    // agendamento que silenciosamente para de chegar.
    throw new Error(`Resend ${res.status}: ${await res.text()}`)
  }

  // O retrato é gravado **depois** do envio: se o email falhar, amanhã ainda
  // compara com o de ontem e o aviso de mudança de mês não se perde.
  const retrato = rows.map((r: {
    cardId: string; ref: string; cliente: string; mes: string; valor: number
  }) => ({
    taken_on: dia,
    card_id: r.cardId,
    card_ref: r.ref,
    client_name: r.cliente,
    month: r.mes,
    value_brl: r.valor,
  }))

  if (retrato.length > 0) {
    // `merge-duplicates` para o caso de uma segunda execução no mesmo dia:
    // reescreve o retrato em vez de estourar no índice único.
    const ins = await db('arrival_snapshots?on_conflict=taken_on,card_id', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(retrato),
    })
    if (!ins.ok) console.error('Snapshot:', ins.status, await ins.text())
  }

  const corte = new Date(Date.now() - GUARDA_DIAS * 86_400_000).toISOString().slice(0, 10)
  await db(`arrival_snapshots?taken_on=lt.${corte}`, { method: 'DELETE' })
    .catch((err) => console.error('Prune:', err))

  anotar(`${para.length} destinatário(s) · ${rows.length} pedidos · `
    + (moves.length ? `${moves.length} mudança(s) de mês` : 'nada mudou')
    + (quando ? '' : ' · primeiro retrato'))

  return new Response(JSON.stringify({
    sent: para.length, orders: rows.length, moves: moves.length, comparedWith: quando,
  }), { headers: { 'Content-Type': 'application/json' } })
}

// 11:00 UTC — 08:00 em São Paulo, antes de o dia começar.
export const config: Config = {
  schedule: '0 11 * * *',
}
