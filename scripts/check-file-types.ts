/**
 * O que o hub aceita como anexo.
 *
 *   node_modules/.bin/jiti scripts/check-file-types.ts
 *
 * A lista vive em dois lugares que não conversam — src/lib/fileTypes.ts e a
 * coluna allowed_mime_types do bucket. Este arquivo cobre o lado do cliente:
 * que o Excel entra, que a planilha com macro não entra, e sobretudo que
 * liberar planilha não abriu a porta para qualquer arquivo.
 */

import { fileRejection, contentTypeOf, sizeLimitFor, ACCEPTED_TYPES } from '../src/lib/fileTypes'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function fake(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type })
}

let failed = 0
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { failed++; console.log(`  FALHOU  ${what}\n          esperado ${JSON.stringify(want)}, veio ${JSON.stringify(got)}`) }
  else console.log(`  ok      ${what}`)
}

const accepts = (f: File) => fileRejection(f) === null

console.log('\nO que deve passar')
check('xlsx com o tipo certo',        accepts(fake('precos.xlsx', XLSX)), true)
check('xls antigo',                   accepts(fake('precos.xls', 'application/vnd.ms-excel')), true)
check('csv com text/csv',             accepts(fake('itens.csv', 'text/csv')), true)
// O caso que motivou contentTypeOf: o navegador nem sempre sabe o que é um csv.
check('csv anunciado como text/plain', accepts(fake('itens.csv', 'text/plain')), true)
check('csv sem tipo nenhum',          accepts(fake('itens.csv', '')), true)
check('csv do Windows com Excel',     accepts(fake('itens.csv', 'application/vnd.ms-excel')), true)
check('jpg continua entrando',        accepts(fake('foto.jpg', 'image/jpeg')), true)
check('pdf continua entrando',        accepts(fake('pi.pdf', 'application/pdf')), true)
check('mov continua entrando',        accepts(fake('video.mov', 'video/quicktime')), true)

console.log('\nO que não deve passar')
check('xlsm (macro)',                 accepts(fake('macro.xlsm', XLSX)), false)
check('xlsb (macro)',                 accepts(fake('macro.xlsb', 'application/vnd.ms-excel')), false)
check('xltm (macro)',                 accepts(fake('modelo.xltm', XLSX)), false)
// O risco real de aceitar csv por extensão: text/plain não pode virar coringa.
check('txt puro',                     accepts(fake('notas.txt', 'text/plain')), false)
check('executável',                   accepts(fake('virus.exe', 'application/x-msdownload')), false)
check('zip',                          accepts(fake('tudo.zip', 'application/zip')), false)
check('docx (não foi liberado)',      accepts(fake('carta.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')), false)
check('sem extensão e sem tipo',      accepts(fake('arquivo', '')), false)

console.log('\nA recusa se explica')
check('macro diz o que fazer',
  /save it as \.xlsx/.test(fileRejection(fake('m.xlsm', XLSX)) ?? ''), true)
check('tipo errado nomeia o formato',
  /^ZIP files are not accepted/.test(fileRejection(fake('t.zip', 'application/zip')) ?? ''), true)

console.log('\nTipo canônico e teto de tamanho')
check('csv sem tipo vira text/csv',   contentTypeOf(fake('a.csv', '')), 'text/csv')
check('xlsx sem tipo vira o do xlsx', contentTypeOf(fake('a.xlsx', '')), XLSX)
check('jpg é deixado em paz',         contentTypeOf(fake('a.jpg', 'image/jpeg')), 'image/jpeg')
check('planilha tem teto de 20 MB',   sizeLimitFor(XLSX), { max: 20 * 1024 * 1024, what: 'spreadsheets' })
check('vídeo tem teto de 50 MB',      sizeLimitFor('video/mp4').max, 50 * 1024 * 1024)

console.log('\nO cliente e o servidor combinam')
// Copiado da migração 040. Se as duas listas se separarem, o upload passa aqui
// e é recusado lá — depois de o arquivo inteiro ter subido. Contar quantos são
// não pegaria uma troca de tipo; comparar a lista pega.
const NO_BUCKET = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'video/mp4', 'video/webm', 'video/quicktime',
  XLSX,
  'application/vnd.ms-excel',
  'text/csv',
]
check('cliente e bucket listam o mesmo',
  [...ACCEPTED_TYPES].sort(), [...NO_BUCKET].sort())

console.log(failed === 0 ? '\nTudo certo.\n' : `\n${failed} falha(s).\n`)
process.exit(failed === 0 ? 0 : 1)
