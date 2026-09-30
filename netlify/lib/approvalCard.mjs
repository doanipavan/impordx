/**
 * O cartão que o WhatsApp mostra quando o link de aprovação é colado.
 *
 * É desenhado como SVG e rasterizado com resvg — o WhatsApp não lê SVG, e um
 * HTML renderizado exigiria um navegador dentro da função. Aqui não há
 * navegador nenhum: um texto de SVG, duas fontes e o logotipo.
 *
 * Mora fora de `netlify/functions/` de propósito. Tudo que fica lá dentro o
 * Netlify tenta publicar como função; isto é biblioteca, usada pela função
 * `approval-card` e pelo script que gera o cartão genérico de `public/og/`.
 */

const W = 1200
const H = 630
const NAVY = '#001849'
const GOLD = '#b99553'

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/**
 * Largura aproximada de uma linha, para o nome do cliente caber.
 *
 * Não há como medir o texto antes de rasterizar, então a conta usa a largura
 * média do Inter em caixa alta (~0,62 em) mais o espaçamento entre letras. Erra
 * por pouco, e o erro é para o lado seguro: o texto encolhe antes de encostar
 * na moldura.
 */
function fitFontSize(text, { max, min, tracking, maxWidth }) {
  for (let size = max; size > min; size -= 1) {
    const width = text.length * (size * 0.62 + size * tracking)
    if (width <= maxWidth) return size
  }
  return min
}

/**
 * Uma linha centrada.
 *
 * `text-anchor="middle"` conta o espaçamento que sobra depois da última letra,
 * o que joga a linha meio passo para a esquerda. Daí o meio espaçamento somado
 * ao x — sem isso o texto fica visivelmente fora do eixo do logotipo.
 */
function line({ text, y, size, family, fill, tracking = 0, opacity = 1, weight }) {
  const spacing = size * tracking
  return `<text x="${(W / 2 + spacing / 2).toFixed(1)}" y="${y}" text-anchor="middle"`
    + ` font-family="${family}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''}`
    + ` letter-spacing="${spacing.toFixed(2)}" fill="${fill}"`
    + `${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}>${esc(text)}</text>`
}

/**
 * O SVG do cartão.
 *
 * Com `client`, é o cartão daquele pedido; sem ele, o cartão genérico da marca
 * — o mesmo que responde por qualquer outro link do hub e que serve de reserva
 * quando o token não vale mais.
 */
export function cardSvg({ logoDataUrl, client, reference, headline = 'Aprovação de arte', subtitle }) {
  const logoW = 420
  const logoH = Math.round((logoW * 84) / 384)
  const named = !!client

  // Duas alturas: com o nome do cliente a coluna tem quatro blocos, sem ele
  // tem três e respira mais.
  const logoY = named ? 138 : 168
  const ruleY = logoY + logoH + 48
  const clientY = ruleY + 66
  const headY = named ? clientY + 82 : ruleY + 92
  const footY = named ? headY + 62 : headY + 54

  const clientSize = fitFontSize(client ?? '', { max: 30, min: 17, tracking: 0.13, maxWidth: 940 })
  const headSize = headline.length > 22 ? 46 : 58

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="${NAVY}"/>`
    + `<rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none"`
    + ` stroke="${GOLD}" stroke-opacity="0.4" stroke-width="1.5"/>`
    + `<image x="${(W - logoW) / 2}" y="${logoY}" width="${logoW}" height="${logoH}"`
    + ` href="${logoDataUrl}"/>`
    + `<rect x="${W / 2 - 23}" y="${ruleY}" width="46" height="2" fill="${GOLD}"/>`
    + (named
      ? line({ text: client, y: clientY, size: clientSize, family: 'Inter', weight: 600, fill: GOLD, tracking: 0.13 })
      : '')
    + line({
      text: headline.toUpperCase(), y: headY, size: headSize, weight: 500,
      family: 'Cormorant Garamond', fill: '#ffffff', tracking: 0.14,
    })
    + (named && reference
      ? line({ text: reference, y: footY, size: 19, family: 'Inter', fill: '#f5f1e8', tracking: 0.11, opacity: 0.5 })
      : '')
    + (!named && subtitle
      ? line({ text: subtitle, y: footY, size: 22, family: 'Inter', fill: '#f5f1e8', opacity: 0.66 })
      : '')
    + `</svg>`
}

/**
 * SVG -> PNG.
 *
 * `loadSystemFonts: false` não é economia: numa função serverless não há fonte
 * de sistema nenhuma, e deixar ligado só faz o resvg procurar e cair num
 * desenho sem texto — que renderiza sem erro e chega torto no WhatsApp.
 */
export function renderCard(Resvg, svg, fontBuffers) {
  return new Resvg(svg, {
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: 'Inter' },
    fitTo: { mode: 'width', value: W },
  }).render().asPng()
}

export const CARD_SIZE = { width: W, height: H }
