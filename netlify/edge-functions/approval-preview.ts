import type { Config, Context } from '@netlify/edge-functions'

/**
 * O que o WhatsApp mostra quando o link de aprovação é colado numa conversa.
 *
 * O hub é uma página só: todo endereço devolve o mesmo `index.html`, e quem
 * lê a prévia — WhatsApp, Telegram, Slack, Gmail — não executa JavaScript.
 * Por isso o cliente via o nome do sistema interno, em inglês, em todo link.
 * Esta função roda antes da resposta sair e reescreve as etiquetas com o nome
 * do cliente e a situação daquele link.
 *
 * Regra de ouro: ela nunca pode quebrar a página. O mesmo endereço é o que o
 * cliente abre no navegador, então qualquer falha aqui — banco fora do ar,
 * token estranho, demora — devolve a resposta original intacta.
 */

const LOOKUP_TIMEOUT_MS = 2500

export interface View {
  state?: string
  client?: string
  reference?: string
  signature?: { decision?: string } | null
}

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** O título e o texto da prévia, por situação do link. */
export function copyFor(view: View): { title: string; description: string } | null {
  const client = (view.client ?? '').trim()
  const who = client || 'Redantex'

  switch (view.state) {
    case 'open':
      return {
        title: `${who} · Aprovação de arte`,
        description: 'Sua arte está pronta para conferência. Toque para aprovar ou pedir ajuste. — Redantex',
      }
    case 'signed':
      return view.signature?.decision === 'changes'
        ? {
            title: `${who} · Ajuste solicitado`,
            description: 'O pedido de ajuste já foi registrado. Toque para ver o que foi enviado. — Redantex',
          }
        : {
            title: `${who} · Arte aprovada`,
            description: 'Esta arte já foi aprovada. Toque para ver o comprovante da assinatura. — Redantex',
          }
    case 'expired':
      return {
        title: 'Link expirado · Redantex',
        description: 'Este link de aprovação venceu. Peça um novo ao seu contato na Redantex.',
      }
    case 'revoked':
      return {
        title: 'Link cancelado · Redantex',
        description: 'Este link foi cancelado. Peça um novo ao seu contato na Redantex.',
      }
    // 'unknown' cai fora: um token inventado não merece uma prévia sob medida,
    // e as etiquetas padrão do index.html já dizem o suficiente.
    default:
      return null
  }
}

async function lookup(token: string): Promise<View | null> {
  const url = Netlify.env.get('VITE_SUPABASE_URL')
  const key = Netlify.env.get('VITE_SUPABASE_ANON_KEY')
  if (!url || !key) return null

  const abort = AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
  const res = await fetch(`${url}/rest/v1/rpc/approval_view`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
    signal: abort,
  })
  if (!res.ok) return null
  return await res.json() as View
}

/** O bloco de etiquetas que substitui o padrão do `index.html`. */
export function previewTags(
  copy: { title: string; description: string }, pageUrl: string, token: string,
): string {
  const origin = new URL(pageUrl).origin
  // O cartão é desenhado a partir do mesmo token, então a imagem e o texto
  // nunca discordam: quem decide o que aparece é sempre a função approval_view.
  const image = `${origin}/preview/approval.png?t=${encodeURIComponent(token)}`

  return [
    `<title>${esc(copy.title)}</title>`,
    `<meta name="description" content="${esc(copy.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Redantex" />`,
    `<meta property="og:title" content="${esc(copy.title)}" />`,
    `<meta property="og:description" content="${esc(copy.description)}" />`,
    `<meta property="og:url" content="${esc(pageUrl)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(copy.title)}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ')
}

/** Troca o bloco marcado no `index.html`. Devolve null se o marcador sumiu. */
export function patchHtml(html: string, tags: string): string | null {
  const marked = /<!-- og:start -->[\s\S]*?<!-- og:end -->/
  if (!marked.test(html)) return null
  return html.replace(marked, `<!-- og:start -->\n    ${tags}\n    <!-- og:end -->`)
}

export default async (request: Request, context: Context) => {
  const response = await context.next()

  try {
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response

    const token = new URL(request.url).pathname.split('/').filter(Boolean)[1]
    if (!token) return response

    const view = await lookup(token)
    if (!view) return response

    const copy = copyFor(view)
    if (!copy) return response

    // Ler o corpo gasta a resposta original, então o que sai daqui é sempre
    // uma resposta nova — com as etiquetas trocadas, ou com o HTML como veio
    // caso o marcador não esteja mais lá.
    const html = await response.text()
    const patched = patchHtml(html, previewTags(copy, request.url, token))

    // O HTML mudou de tamanho: manter o content-length antigo entrega uma
    // página cortada. O runtime recalcula quando o cabeçalho não vem.
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    headers.delete('content-encoding')

    return new Response(patched ?? html, { status: response.status, headers })
  } catch (error) {
    // Falhou a consulta, estourou o tempo, veio HTML diferente do esperado:
    // o cliente recebe a página como sempre recebeu, só sem a prévia bonita.
    console.error('approval-preview', error)
    return response
  }
}

export const config: Config = { path: '/aprovar/*' }
