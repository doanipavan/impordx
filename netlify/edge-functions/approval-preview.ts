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

/**
 * Diz ao navegador que estas páginas são portuguesas e não devem ser traduzidas.
 *
 * O `index.html` declara `lang="en"`, porque o hub é em inglês. Estas duas
 * páginas não são: o Chrome viu inglês declarado, leu português na tela,
 * chutou espanhol e traduziu espanhol->português por cima. "enviou" virou
 * "inveja" e "aceite" virou "óleo" — aceite é azeite em espanhol. Apareceu no
 * computador de uma cliente.
 *
 * Numa página qualquer seria feio. Aqui é a página onde alguém assina um termo:
 * o retrato que vira hash guarda o texto em português, e um navegador que
 * reescreve as palavras faz a pessoa assinar o que não leu. Por isso vai
 * `translate="no"` junto — o texto assinado tem de ser o texto exibido.
 */
export function patchLanguage(html: string): string {
  return html
    .replace(/<html[^>]*>/, '<html lang="pt-BR" translate="no">')
    .replace(/<head>/, '<head>\n    <meta name="google" content="notranslate" />')
}

export default async (request: Request, context: Context) => {
  const response = await context.next()

  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response

  // Ler o corpo gasta a resposta original: a partir daqui devolver `response`
  // seria devolver uma resposta sem corpo. Tudo que sai é resposta nova, e o
  // HTML original fica guardado para o caso de qualquer passo falhar.
  let original: string
  try {
    original = await response.text()
  } catch {
    return response
  }

  // O tamanho muda: manter o content-length antigo entrega uma página cortada.
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')

  try {
    const segments = new URL(request.url).pathname.split('/').filter(Boolean)
    let html = patchLanguage(original)

    // A prévia só existe para um link de aprovação que o banco reconheça. O
    // idioma vale para as duas páginas, inclusive a de conferência.
    if (segments[0] === 'aprovar' && segments[1]) {
      const view = await lookup(segments[1])
      const copy = view ? copyFor(view) : null
      if (copy) html = patchHtml(html, previewTags(copy, request.url, segments[1])) ?? html
    }

    return new Response(html, { status: response.status, headers })
  } catch (error) {
    // Falhou a consulta, estourou o tempo, veio HTML diferente do esperado:
    // o cliente recebe a página como sempre recebeu, só sem a prévia bonita.
    console.error('approval-preview', error)
    return new Response(original, { status: response.status, headers })
  }
}

export const config: Config = { path: ['/aprovar/*', '/verificar', '/verificar/*'] }
