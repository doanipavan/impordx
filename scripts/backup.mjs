// Cópia do hub — banco e arquivos.
//
//   node scripts/backup.mjs                 # grava em ~/Desktop/rdx-backups
//   node scripts/backup.mjs /outro/caminho
//
// O banco vai inteiro numa pasta datada a cada execução: são 640 KB, e ter a
// foto de cada dia é o que permite voltar a um estado anterior. Os arquivos
// não — eles somam 185 MB e não mudam depois de enviados, então moram num
// acervo único ao lado das pastas datadas e cada um é baixado uma vez só.
// Copiá-los todo dia encheria o iCloud de cópias idênticas das mesmas fotos.
//
// O projeto está no plano Free da Supabase, que não faz backup nenhum. Sem isto
// existe uma cópia só de tudo, num servidor em Ohio: um projeto apagado, um
// DELETE errado ou uma migração ruim levam a empresa junto, sem volta.
//
// Grava JSON e não SQL de propósito: JSON abre em qualquer lugar daqui a três
// anos, sem depender da versão do Postgres nem de o pg_dump existir na máquina.

import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'

const { Client } = createRequire('/Users/doanipavan/.rdx-dbtool/db.mjs')('pg')

const destino = process.argv[2] || join(homedir(), 'Desktop', 'rdx-backups')
const agora = new Date()

// O nome da pasta em horário de São Paulo, não em UTC.
//
// `toISOString` deu `2026-09-10-00h31` a um backup que rodou às 21h31 do dia 9.
// Numa restauração, procurar "a cópia do dia 9" levaria à pasta errada — e a
// pasta errada é exatamente o tipo de engano que só se descobre depois de já
// ter restaurado. O resto do hub fixa horário em São Paulo pelo mesmo motivo.
const carimbo = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(agora).replace(' ', '-').replace(':', 'h')
const pasta = join(destino, carimbo)

const url = readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim()
const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

// Um erro no meio de um backup é pior do que não ter backup, porque parece que
// tem. Nada é declarado pronto até a conferência no fim passar.
const problemas = []
const resumo = []

await db.connect()

// Todas as tabelas têm de vir do MESMO instante.
//
// Sem isto cada tabela é lida num momento diferente, e quem estiver usando o
// hub durante a cópia deixa o backup incoerente. Aconteceu de verdade: em
// 03/09 um card foi promovido a pedido entre a leitura de `cards` e a de
// `activity_logs`, e o backup saiu com cinco linhas de histórico a menos.
//
// Naquele caso o estrago foi nenhum — histórico é só acréscimo. O sentido
// perigoso é o outro: um card gravado entre a leitura de `card_items` e a de
// `cards` produz itens órfãos, ou um card sem os itens. Um backup incoerente é
// pior do que não ter backup, porque parece que tem.
//
// REPEATABLE READ congela uma visão do banco no primeiro select e serve todos
// os seguintes a partir dela. Não tranca nada nem atrasa quem está usando o
// hub — o Postgres guarda as versões antigas das linhas para esta transação.
await db.query('begin isolation level repeatable read')
await db.query('set transaction read only')

// ---------- 1. as tabelas ----------------------------------------------------
const { rows: tabelas } = await db.query(`
  select tablename from pg_tables where schemaname = 'public' order by tablename
`)

mkdirSync(join(pasta, 'banco'), { recursive: true })

for (const { tablename } of tabelas) {
  const { rows } = await db.query(`select * from public.${tablename}`)
  writeFileSync(join(pasta, 'banco', `${tablename}.json`), JSON.stringify(rows, null, 2))
  resumo.push({ tipo: 'tabela', nome: tablename, linhas: rows.length })
}

// ---------- 2. o esquema, para poder reconstruir -----------------------------
// As tabelas foram criadas à mão no painel e nunca escritas em migração, então
// esta é a única descrição do formato que existe fora da Supabase.
const { rows: colunas } = await db.query(`
  select table_name, column_name, data_type, numeric_precision, numeric_scale,
         is_nullable, column_default
    from information_schema.columns
   where table_schema = 'public'
   order by table_name, ordinal_position
`)
const { rows: politicas } = await db.query(`
  select c.relname as tabela, p.polname as politica,
         case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
              when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end as comando,
         pg_get_expr(p.polqual, p.polrelid) as usando,
         pg_get_expr(p.polwithcheck, p.polrelid) as com_check
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' order by 1, 3
`)
const { rows: funcoes } = await db.query(`
  select proname, pg_get_functiondef(p.oid) as definicao
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' order by 1
`)
const { rows: gatilhos } = await db.query(`
  select c.relname as tabela, t.tgname as gatilho, p.proname as funcao
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal order by 1, 2
`)

mkdirSync(join(pasta, 'esquema'), { recursive: true })
for (const [nome, dados] of [['colunas', colunas], ['politicas', politicas],
                             ['funcoes', funcoes], ['gatilhos', gatilhos]]) {
  writeFileSync(join(pasta, 'esquema', `${nome}.json`), JSON.stringify(dados, null, 2))
  resumo.push({ tipo: 'esquema', nome, linhas: dados.length })
}

// ---------- 3. os arquivos ---------------------------------------------------
// O bucket é público, então o caminho basta para baixar — sem token, sem sessão.
const projeto = url.match(/@db\.([a-z0-9]+)\.supabase\.co/)?.[1]
  ?? url.match(/postgres\.([a-z0-9]+):/)?.[1]
const base = projeto ? `https://${projeto}.supabase.co/storage/v1/object/public/attachments` : null

const { rows: objetos } = await db.query(`
  select name, (metadata->>'size')::bigint as bytes
    from storage.objects where bucket_id = 'attachments' order by name
`)

// A visão congelada já cumpriu o papel: tudo o que veio do banco veio do mesmo
// instante. Os downloads levam minutos e não precisam dela — um arquivo no
// storage não muda depois de enviado — e uma transação de leitura aberta por
// muito tempo segura a limpeza interna do Postgres à toa.
await db.query('commit')

// O acervo fica ao lado das pastas datadas, não dentro de uma delas: é de todas.
const acervo = join(destino, 'arquivos')

let baixados = 0, bytes = 0, jaTinha = 0
// Arquivos que estão vazios no próprio storage. Não é falha do backup, e não
// pode reprovar a cópia — mas some do relatório se eu não contar, e some junto
// a informação de que existe um anexo quebrado para alguém reenviar.
const vaziosNoStorage = []
if (!base) {
  problemas.push('não consegui deduzir a URL do projeto — os arquivos não foram baixados')
} else {
  mkdirSync(acervo, { recursive: true })
  for (const o of objetos) {
    const alvo = join(acervo, o.name)
    const esperado = Number(o.bytes ?? 0)

    // Vazio na origem: registra e não insiste. Sem este ramo ele seria rebaixado
    // toda noite e apareceria como "1 novo" para sempre, escondendo quando um
    // arquivo novo de verdade aparecesse.
    if (esperado === 0) {
      vaziosNoStorage.push(o.name)
      if (existsSync(alvo)) { jaTinha++; continue }
    }

    // Já tenho este, do tamanho certo? Pula. Comparar o tamanho e não só a
    // existência pega o download interrompido pela metade — testado truncando
    // um arquivo do acervo: ele foi detectado e rebaixado inteiro.
    if (esperado > 0 && existsSync(alvo) && statSync(alvo).size === esperado) {
      jaTinha++
      continue
    }

    mkdirSync(join(alvo, '..'), { recursive: true })
    try {
      const r = await fetch(`${base}/${o.name.split('/').map(encodeURIComponent).join('/')}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      writeFileSync(alvo, buf)
      baixados++; bytes += buf.length
    } catch (e) {
      problemas.push(`arquivo não baixado: ${o.name} — ${e.message}`)
    }
  }
}
resumo.push({ tipo: 'arquivos', nome: 'attachments', linhas: baixados + jaTinha })

await db.end()

// ---------- 4. a conferência -------------------------------------------------
// Reabre o que foi escrito e conta de novo. Um backup que não foi verificado é
// uma suposição.
for (const item of resumo.filter(r => r.tipo !== 'arquivos')) {
  const caminho = join(pasta, item.tipo === 'tabela' ? 'banco' : 'esquema', `${item.nome}.json`)
  if (!existsSync(caminho)) { problemas.push(`sumiu: ${caminho}`); continue }
  const lido = JSON.parse(readFileSync(caminho, 'utf8'))
  if (lido.length !== item.linhas) {
    problemas.push(`${item.nome}: gravou ${item.linhas}, releu ${lido.length}`)
  }
}
// A pergunta certa não é "baixei todos agora?" — quase nunca baixo, o acervo já
// os tem. É "o acervo contém todos, do tamanho certo?". Só isso prova que a
// cópia serve; contar downloads provaria apenas que o dia foi calmo.
let noAcervo = 0
if (base) {
  for (const o of objetos) {
    const alvo = join(acervo, o.name)
    const esperado = Number(o.bytes ?? 0)
    if (!existsSync(alvo)) { problemas.push(`falta no acervo: ${o.name}`); continue }
    const tamanho = statSync(alvo).size
    // O de 0 byte no storage é conhecido e não é culpa do backup: registro o
    // desencontro sem reprovar a cópia por causa dele.
    if (esperado > 0 && tamanho !== esperado) {
      problemas.push(`tamanho diferente: ${o.name} — storage ${esperado}, acervo ${tamanho}`)
      continue
    }
    noAcervo++
  }
}

const manifesto = {
  quando: agora.toISOString(),
  projeto,
  tabelas: resumo.filter(r => r.tipo === 'tabela'),
  esquema: resumo.filter(r => r.tipo === 'esquema'),
  arquivos: {
    acervo,
    no_storage: objetos.length,
    conferidos_no_acervo: noAcervo,
    baixados_agora: baixados,
    ja_tinha: jaTinha,
    bytes_agora: bytes,
    vazios_no_storage: vaziosNoStorage,
  },
  problemas,
  integro: problemas.length === 0,
}
writeFileSync(join(pasta, 'manifesto.json'), JSON.stringify(manifesto, null, 2))

const mb = (bytes / 1048576).toFixed(1)
const linhas = resumo.filter(r => r.tipo === 'tabela').reduce((s, r) => s + r.linhas, 0)
console.log(`\n${pasta}`)
console.log(`  ${resumo.filter(r => r.tipo === 'tabela').length} tabelas · ${linhas} linhas`)
console.log(`  ${noAcervo}/${objetos.length} arquivos conferidos no acervo`)
console.log(`  ${baixados} novo(s) neste backup · ${mb} MB baixados · ${jaTinha} já tinha`)
if (vaziosNoStorage.length) {
  console.log(`  aviso: ${vaziosNoStorage.length} anexo(s) estão vazios no storage — precisam ser reenviados:`)
  for (const n of vaziosNoStorage.slice(0, 5)) console.log(`    · ${n}`)
}

if (problemas.length) {
  console.log(`\n  ${problemas.length} PROBLEMA(S) — este backup não está completo:`)
  for (const p of problemas.slice(0, 10)) console.log(`    · ${p}`)
  process.exit(1)
}
console.log('  conferido: tudo relido e batendo\n')
