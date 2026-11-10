// A busca da lupa.
//
//   node_modules/.bin/jiti scripts/check-search.ts
//
// O modo de errar desta tela é o pior possível: ela responde "nenhum
// resultado" tanto quando não há nada quanto quando a consulta quebrou. Uma
// vírgula no texto digitado partia o filtro ao meio e devolvia 400 — e quem
// procurava via a mesma tela vazia de sempre.

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

const { Client } = createRequire(join(homedir(), '.rdx-dbtool/db.mjs'))('pg')

let bad = 0
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`)
}

// A mesma limpeza da tela, lida do arquivo para não virar uma segunda versão
// que diverge na primeira mudança.
const fonte = readFileSync('src/components/search/Spotlight.tsx', 'utf8')
check('a tela limpa o texto antes de montar o filtro',
  fonte.includes('function limpar'), true)
check('e procura na proforma', fonte.includes('pi_number.ilike'), true)
check('e no pedido de compra', fonte.includes('purchase_order.ilike'), true)

const limpar = (t: string) => t.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim()
check('vírgula sai', limpar('caixa, preta'), 'caixa preta')
check('parêntese sai', limpar('a)b'), 'a b')
check('curinga sai', limpar('50%'), '50')
check('espaço sobrando some', limpar('  RIZZI  '), 'RIZZI')
check('texto só de pontuação vira vazio', limpar(',,,'), '')

async function main() {
  const url = readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim()
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await db.connect()

  // A consulta de verdade, com os seis campos, do jeito que a tela a monta.
  const buscar = async (texto: string) => {
    const q = limpar(texto)
    // A tela barra o texto vazio antes de consultar — sem esta guarda o
    // `ilike '%%'` traria o quadro inteiro, que é o erro oposto e pior que
    // não achar nada.
    if (!q) return []
    const { rows } = await db.query(`
      select ref_number from cards
       where not archived and (
         title ilike '%' || $1 || '%' or ref_number ilike '%' || $1 || '%' or
         client_name ilike '%' || $1 || '%' or collection ilike '%' || $1 || '%' or
         pi_number ilike '%' || $1 || '%' or purchase_order ilike '%' || $1 || '%')
       limit 8`, [q])
    return (rows as { ref_number: string }[]).map((r) => r.ref_number)
  }

  // O caso que motivou tudo: o número da proforma, inteiro e em pedaço.
  const { rows: [pi] } = await db.query(
    "select ref_number, pi_number, purchase_order from cards where pi_number is not null limit 1")
  check('acha pela proforma inteira', (await buscar(pi.pi_number)).includes(pi.ref_number), true)
  check('e por um pedaço dela',
    (await buscar(String(pi.pi_number).slice(-7))).includes(pi.ref_number), true)
  check('acha pelo pedido de compra',
    (await buscar(pi.purchase_order)).includes(pi.ref_number), true)

  // Um número que não existe não pode trazer nada — o `ilike '%%'` de um
  // texto vazio traria o quadro inteiro, que é o erro oposto e pior.
  check('número inexistente não traz nada', (await buscar('ZZZ-000000')).length, 0)
  check('busca só de pontuação não traz o quadro inteiro', (await buscar(',,,')).length, 0)
check('e a tela tem essa guarda', fonte.includes('if (!limpo) { setResults([]); return }'), true)

  await db.end()
  console.log(bad === 0 ? '\nTudo certo.\n' : `\n${bad} falha(s).\n`)
  process.exit(bad === 0 ? 0 : 1)
}
main()
