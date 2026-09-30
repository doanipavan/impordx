import type { Config } from '@netlify/functions'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { cardSvg, renderCard } from '../lib/approvalCard.mjs'
import { displayClient } from '../lib/approvalView.mjs'

/**
 * O cartão 1200x630 que aparece na prévia do link de aprovação.
 *
 * Recebe o mesmo token do link, pergunta ao banco de quem é a arte e devolve
 * um PNG com o nome do cliente. Quem chama é o crawler do WhatsApp, a partir
 * da etiqueta og:image que a função de borda `approval-preview` escreveu.
 *
 * O token já é público para quem recebe o link — é o próprio endereço da
 * mensagem. Ele vem por aqui em vez do nome do cliente em texto para que o
 * cartão só possa dizer o que o banco confirma: sem isso, qualquer pessoa
 * montaria uma imagem da Redantex escrevendo o que quisesse.
 *
 * Nada aqui é essencial: se o banco não responder, se a fonte não carregar,
 * se o desenho falhar, a resposta é o cartão genérico de `/og/card.png`. Uma
 * prévia sem o nome é muito melhor que um link sem prévia nenhuma.
 */

const FONT_FILES = ['/og/inter-600.ttf', '/og/inter-400.ttf', '/og/cormorant-500.ttf']
const LOGO_FILE = '/og/logo-white.png'
const WASM_FILE = '/og/resvg.wasm'
const LOOKUP_TIMEOUT_MS = 2500

/**
 * Fontes, logotipo e o rasterizador vêm do próprio site.
 *
 * Empacotar arquivo junto da função no Netlify depende de onde o bundler
 * resolve o caminho em tempo de execução — e errar isso só aparece em
 * produção. `public/` é servido com certeza, então a função busca no próprio
 * endereço e guarda na memória: acontece uma vez por instância fria.
 */
let assets: Promise<{ fonts: Uint8Array[]; logoDataUrl: string }> | null = null

async function load(origin: string) {
  if (assets) return assets
  assets = (async () => {
    const get = async (path: string) => {
      const res = await fetch(origin + path)
      if (!res.ok) throw new Error(`${path} respondeu ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    }
    const [wasm, logo, ...fonts] = await Promise.all([
      get(WASM_FILE), get(LOGO_FILE), ...FONT_FILES.map(get),
    ])
    await initWasm(wasm)
    return {
      fonts,
      logoDataUrl: 'data:image/png;base64,' + Buffer.from(logo).toString('base64'),
    }
  })()
  // Uma falha não pode envenenar a instância inteira: a próxima chamada tenta
  // de novo em vez de repetir o mesmo erro para sempre.
  assets.catch(() => { assets = null })
  return assets
}

interface View {
  state?: string
  client?: string
  title?: string
  reference?: string
  signature?: { decision?: string } | null
}

async function lookup(token: string): Promise<View | null> {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null

  const res = await fetch(`${url}/rest/v1/rpc/approval_view`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  })
  return res.ok ? await res.json() as View : null
}

/** O título do cartão acompanha a situação do link, igual ao texto da prévia. */
function headlineFor(view: View): string {
  if (view.state === 'signed') {
    return view.signature?.decision === 'changes' ? 'Ajuste solicitado' : 'Arte aprovada'
  }
  return 'Aprovação de arte'
}

export default async (request: Request) => {
  const origin = new URL(request.url).origin
  const fallback = Response.redirect(`${origin}/og/card.png`, 302)

  try {
    const token = new URL(request.url).searchParams.get('t')
    if (!token) return fallback

    const view = await lookup(token)
    const client = view ? displayClient(view) : ''
    if (!client || (view!.state !== 'open' && view!.state !== 'signed')) return fallback

    const { fonts, logoDataUrl } = await load(origin)
    const png = renderCard(
      Resvg,
      cardSvg({ logoDataUrl, client, reference: view!.reference, headline: headlineFor(view!) }),
      fonts,
    )

    return new Response(png, {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=3600, s-maxage=86400',
      },
    })
  } catch (error) {
    console.error('approval-card', error)
    return fallback
  }
}

export const config: Config = { path: '/preview/approval.png' }
