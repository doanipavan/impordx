/**
 * Os códigos de material saíram da descrição.
 *
 *   node_modules/.bin/jiti scripts/check-material-codes.ts
 *
 * Até a migração 041 eles eram linhas rotuladas dentro de `description`, e o
 * Editar card descartava em silêncio o que se digitava neles. Agora são colunas,
 * e a extração vive no banco — num gatilho, para as abas que ficaram abertas e
 * para o importador de planilha, que nunca soube gravá-los.
 *
 * Este arquivo cobre o lado que dá para verificar sem banco: que o cliente não
 * fabrica mais o formato antigo, e que nenhum caminho de gravação esqueceu as
 * duas colunas. Os testes da extração em si estão no README da migração e foram
 * rodados contra os dados reais antes de aplicar.
 */

import { readFileSync } from 'node:fs'

let failed = 0
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { failed++; console.log(`  FALHOU  ${what}\n          esperado ${JSON.stringify(want)}, veio ${JSON.stringify(got)}`) }
  else console.log(`  ok      ${what}`)
}

const read = (p: string) => readFileSync(p, 'utf8')

console.log('\nO formato antigo não existe mais')
// As duas funções que empacotavam e desempacotavam. Enquanto existirem, alguém
// as chama de novo sem saber que a coluna é o lugar certo.
const utils = read('src/lib/utils.ts')
check('splitMaterialCodes foi removida',  /splitMaterialCodes/.test(utils), false)
check('mergeMaterialCodes foi removida',  /mergeMaterialCodes/.test(utils), false)
check('a regex do formato antigo sumiu',  /MATERIAL_CODE_LINE/.test(utils), false)

const todos = [
  'src/components/card/CreateCardModal.tsx',
  'src/components/card/EditCardModal.tsx',
  'src/components/card/CardModal.tsx',
  'src/components/board/ImportCard.tsx',
  'src/lib/cardSheet.ts',
]
for (const f of todos) {
  check(`${f.split('/').pop()} não monta mais o texto`,
    /Outside material code:|Inside material code:/.test(read(f)), false)
}

console.log('\nTodo caminho que grava um card leva as duas colunas')
for (const [f, rotulo] of [
  ['src/components/card/CreateCardModal.tsx', 'criar card'],
  ['src/components/card/EditCardModal.tsx',   'editar card'],
  // Duplicar levava os códigos de carona dentro da descrição. Sem esta linha a
  // cópia sai sem eles, e ninguém percebe até o fornecedor perguntar.
  ['src/components/card/CardModal.tsx',       'duplicar card'],
] as const) {
  const s = read(f)
  check(`${rotulo} grava outside_material_code`, /outside_material_code:/.test(s), true)
  check(`${rotulo} grava inside_material_code`,  /inside_material_code:/.test(s), true)
}

console.log('\nO que sai do hub ainda carrega o código')
const rfq = read('src/components/card/ExportRFQ.tsx')
// O RFQ é o que a DEQI lê para cotar. O código viajava dentro de Description.
check('RFQ traz o código externo', /Material code'\], f\(card\.outside_material_code\)|\['Material code', f\(card\.outside_material_code\)\]/.test(rfq), true)
check('RFQ traz o código interno', /\['Material code', f\(card\.inside_material_code\)\]/.test(rfq), true)
check('RFQ traz os dois nos dois formatos (planilha e PDF)',
  (rfq.match(/Material code/g) ?? []).length, 4)

const orders = read('src/components/board/ExportOrders.tsx')
check('export de Orders traz os códigos',
  /outside_material_code/.test(orders) && /inside_material_code/.test(orders), true)

console.log('\nO tipo permite apagar um código')
// `undefined` seria omitido do JSON pela biblioteca, e apagar ficaria impossível
// — o valor antigo sobreviveria ao salvar.
const tipos = read('src/types/index.ts')
check('outside_material_code aceita null', /outside_material_code\?: string \| null/.test(tipos), true)
check('inside_material_code aceita null',  /inside_material_code\?: string \| null/.test(tipos), true)
check('editar card manda null, não undefined',
  /outside_material_code: values\.outside_material_code\?\.trim\(\) \|\| null/.test(read('src/components/card/EditCardModal.tsx')), true)

console.log(failed === 0 ? '\nTudo certo.\n' : `\n${failed} falha(s).\n`)
process.exit(failed === 0 ? 0 : 1)
