/**
 * Gera os dois cartões fixos de `public/og/`.
 *
 *   node scripts/build-og-card.mjs
 *   node scripts/build-og-card.mjs /tmp/teste.png "OURO1000TON" "ORD-2026-10095"
 *
 * `card.png` é a reserva do link de aprovação — o que aparece quando o token
 * venceu, foi cancelado ou o desenho falhou. `card-hub.png` responde pelos
 * links do próprio hub, que são lidos pela equipe e pelo fornecedor, e por
 * isso ficam em inglês como o resto da interface.
 *
 * Com dois argumentos extras desenha um cartão de cliente num arquivo
 * avulso — só para conferir o desenho aqui. Em produção quem desenha é
 * `netlify/functions/approval-card`, a partir do mesmo módulo.
 *
 * Os PNGs ficam versionados. Se o desenho mudar, rode de novo e commite.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { cardSvg, renderCard } from '../netlify/lib/approvalCard.mjs'

const FONTS = ['public/og/inter-600.ttf', 'public/og/inter-400.ttf', 'public/og/cormorant-500.ttf']

await initWasm(readFileSync('public/og/resvg.wasm'))

const fonts = FONTS.map(f => readFileSync(f))
const logoDataUrl = 'data:image/png;base64,' + readFileSync('public/og/logo-white.png').toString('base64')

const write = (out, opts) => {
  const png = renderCard(Resvg, cardSvg({ logoDataUrl, ...opts }), fonts)
  writeFileSync(out, png)
  console.log(`${out} · ${(png.length / 1024).toFixed(0)} kB`)
}

const [out, client, reference] = process.argv.slice(2)

if (client) {
  write(out ?? 'card-teste.png', { client, reference })
} else {
  write('public/og/card.png', { subtitle: 'Confira, aprove ou peça ajuste' })
  write('public/og/card-hub.png', {
    headline: 'Impo RDX',
    subtitle: 'Quotes, samples and orders in one place',
  })
}
