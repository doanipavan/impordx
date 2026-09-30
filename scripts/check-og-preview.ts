/**
 * A prévia do link no WhatsApp, conferida sem deploy.
 *
 *   node_modules/.bin/jiti scripts/check-og-preview.ts
 *
 * Duas peças rodam em produção e nenhuma das duas roda aqui: a função de
 * borda é Deno, a do cartão é Lambda. O que dá para provar em terra firme é a
 * parte que decide o que vai escrito e o que vai desenhado — e é justamente
 * onde os erros são silenciosos: uma fonte que não bate cai numa fonte
 * qualquer e o cartão sai renderizado, só que errado; um marcador movido no
 * index.html faz toda etiqueta voltar ao nome interno sem erro nenhum.
 */
import { readFileSync, existsSync } from 'node:fs'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { cardSvg, renderCard, CARD_SIZE } from '../netlify/lib/approvalCard.mjs'
import { copyFor, previewTags, patchHtml } from '../netlify/edge-functions/approval-preview.ts'
import type { View } from '../netlify/edge-functions/approval-preview.ts'

let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passed++; return }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const logoDataUrl = 'data:image/png;base64,'
  + readFileSync('public/og/logo-white.png').toString('base64')
const fonts = ['public/og/inter-600.ttf', 'public/og/inter-400.ttf', 'public/og/cormorant-500.ttf']
  .map(f => readFileSync(f))

await initWasm(readFileSync('public/og/resvg.wasm'))

// ---------------------------------------------------------------- o desenho

const named = cardSvg({ logoDataUrl, client: 'OURO1000TON', reference: 'ORD-2026-10095' })
check('o nome do cliente entra no cartão', named.includes('OURO1000TON'))
check('a referência entra no cartão', named.includes('ORD-2026-10095'))
check('o título padrão é a aprovação de arte', named.includes('APROVAÇÃO DE ARTE'))
check('o cartão com nome usa o serif no título', named.includes('Cormorant Garamond'))

const generic = cardSvg({ logoDataUrl, subtitle: 'Confira, aprove ou peça ajuste' })
check('sem cliente, não sobra linha dourada vazia', !generic.includes('#b99553">'))
check('sem cliente, entra o subtítulo', generic.includes('Confira, aprove ou peça ajuste'))

const hostile = cardSvg({ logoDataUrl, client: 'A & B <script>', reference: 'X"Y' })
check('e comercial vira entidade', hostile.includes('A &amp; B'))
check('sinal de menor vira entidade', hostile.includes('&lt;script&gt;') && !hostile.includes('<script>'))
check('aspas na referência viram entidade', hostile.includes('X&quot;Y'))

const sizeOf = (svg: string, text: string) => {
  const m = svg.match(new RegExp(`font-size="(\\d+)"[^>]*>${text}`))
  return m ? Number(m[1]) : NaN
}
const short = sizeOf(cardSvg({ logoDataUrl, client: 'RIZZI' }), 'RIZZI')
const longName = 'MARIA DERLANDIA JOALHERIA E ACESSORIOS LTDA'
const long = sizeOf(cardSvg({ logoDataUrl, client: longName }), longName)
check('nome curto usa o corpo cheio', short === 30, `veio ${short}`)
check('nome longo encolhe para caber', long < short && long >= 17, `veio ${long}`)

// A compensação do text-anchor: sem ela a linha sai fora do eixo do logotipo.
check('o x compensa o espaçamento entre letras', /<text x="60[0-9]\.[0-9]"/.test(named))

// ------------------------------------------------------------ a rasterização

const png = Buffer.from(renderCard(Resvg, named, fonts))
const magic = png.subarray(0, 8).toString('hex')
check('sai um PNG de verdade', magic === '89504e470d0a1a0a', magic)
check('sai no tamanho que as etiquetas prometem',
  png.readUInt32BE(16) === CARD_SIZE.width && png.readUInt32BE(20) === CARD_SIZE.height,
  `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`)
// O WhatsApp descarta prévia pesada; o cartão é chapado e não chega perto.
check('o arquivo é leve o bastante para a prévia', png.length < 300_000, `${png.length} bytes`)

// O erro silencioso que já aconteceu: o nome da família não batia com o do
// arquivo, o resvg caiu no Inter e o cartão saiu renderizado, sem serif e sem
// aviso nenhum. Se as duas fontes desenharem igual, é porque só uma carregou.
const line = (family: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120">`
  + `<text x="20" y="80" font-family="${family}" font-weight="500" font-size="44">APROVAÇÃO</text></svg>`
const serif = Buffer.from(renderCard(Resvg, line('Cormorant Garamond'), fonts))
const sans = Buffer.from(renderCard(Resvg, line('Inter'), fonts))
check('o serif do título realmente carregou', !serif.equals(sans))

// Acentos: o subconjunto das fontes precisa ter Ç e Ã.
const plain = Buffer.from(renderCard(Resvg, line('Inter').replace('APROVAÇÃO', 'APROVACAO'), fonts))
check('as fontes trazem os acentos do português', !sans.equals(plain))

// --------------------------------------------------------------- as palavras

const open: View = { state: 'open', client: 'OURO1000TON', reference: 'ORD-2026-10095' }
check('link aberto leva o nome do cliente no título',
  copyFor(open)!.title === 'OURO1000TON · Aprovação de arte')
check('link aberto convida a aprovar ou pedir ajuste',
  copyFor(open)!.description.includes('aprovar ou pedir ajuste'))

check('arte aprovada muda o título',
  copyFor({ ...open, state: 'signed', signature: { decision: 'approved' } })!.title
    === 'OURO1000TON · Arte aprovada')
check('ajuste pedido muda o título',
  copyFor({ ...open, state: 'signed', signature: { decision: 'changes' } })!.title
    === 'OURO1000TON · Ajuste solicitado')
check('link vencido não expõe o cliente',
  copyFor({ state: 'expired' })!.title === 'Link expirado · Redantex')
check('link cancelado não expõe o cliente',
  copyFor({ state: 'revoked' })!.title === 'Link cancelado · Redantex')
check('token inventado não ganha prévia sob medida', copyFor({ state: 'unknown' }) === null)
check('resposta sem estado não ganha prévia sob medida', copyFor({}) === null)
check('cliente em branco não deixa buraco no título',
  copyFor({ state: 'open', client: '  ' })!.title === 'Redantex · Aprovação de arte')

// ------------------------------------------------------------- a substituição

const url = 'https://impordx.netlify.app/aprovar/abc%20123'
const tags = previewTags(copyFor(open)!, url, 'abc 123')
check('a imagem aponta para a função do cartão', tags.includes('/preview/approval.png?t=abc%20123'))
check('a imagem declara o tamanho', tags.includes('og:image:width" content="1200"'))
check('o cartão grande é pedido explicitamente', tags.includes('summary_large_image'))
check('o título do navegador acompanha', tags.includes('<title>OURO1000TON · Aprovação de arte</title>'))

const index = readFileSync('index.html', 'utf8')
check('o index.html ainda tem os dois marcadores',
  index.includes('<!-- og:start -->') && index.includes('<!-- og:end -->'))
const patched = patchHtml(index, tags)
check('a troca acontece no index.html de verdade', patched !== null)
check('o nome interno some da página trocada',
  !patched!.includes('quotes, samples and orders in one place'))
check('não sobra og:title duplicado',
  (patched!.match(/property="og:title"/g) ?? []).length === 1)
// Conta a etiqueta de fechamento: o comentário explicativo acima dos
// marcadores cita `<title>` no meio do texto e contaria como um a mais.
check('não sobra título duplicado', (patched!.match(/<\/title>/g) ?? []).length === 1)
check('o resto da página fica de pé',
  patched!.includes('<div id="root">') && patched!.includes('/src/main.tsx'))
check('sem marcador, não mexe em nada', patchHtml('<html><head></head></html>', tags) === null)

// O cartão fixo versionado precisa existir: é a reserva de toda falha.
for (const file of ['public/og/card.png', 'public/og/card-hub.png']) {
  const bytes = readFileSync(file)
  check(`${file} está no lugar`, bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a')
  check(`${file} tem 1200x630`,
    bytes.readUInt32BE(16) === 1200 && bytes.readUInt32BE(20) === 630)
}
// Os marcadores são comentários HTML. Se algum dia entrar um minificador de
// HTML no build, eles somem do `dist/` sem erro nenhum — e toda prévia volta
// calada ao nome interno. Só confere quando já existe um build para olhar.
if (existsSync('dist/index.html')) {
  const built = readFileSync('dist/index.html', 'utf8')
  check('os marcadores sobrevivem ao build',
    built.includes('<!-- og:start -->') && built.includes('<!-- og:end -->'))
}

check('o index.html aponta para o cartão do hub', index.includes('/og/card-hub.png'))
check('o ícone esticado saiu do lugar da prévia', !index.includes('og:image" content="https://impordx.netlify.app/icons/'))

// ------------------------------------------------------------------ resultado

console.log(`${passed} de ${passed + failures.length} conferências passaram`)
if (failures.length) {
  console.error('\nfalhou:')
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
