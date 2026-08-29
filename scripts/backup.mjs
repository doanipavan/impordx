// Cópia completa do hub — banco e arquivos — numa pasta datada.
//
//   node scripts/backup.mjs                 # grava em ~/Desktop/rdx-backups
//   node scripts/backup.mjs /outro/caminho
//
// O projeto está no plano Free da Supabase, que não faz backup nenhum. Sem isto
// existe uma cópia só de tudo, num servidor em Ohio: um projeto apagado, um
// DELETE errado ou uma migração ruim levam a empresa junto, sem volta.
//
// Grava JSON e não SQL de propósito: JSON abre em qualquer lugar daqui a três
// anos, sem depender da versão do Postgres nem de o pg_dump existir na máquina.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'

const { Client } = createRequire('/Users/doanipavan/.rdx-dbtool/db.mjs')('pg')

const destino = process.argv[2] || join(homedir(), 'Desktop', 'rdx-backups')
const agora = new Date()
const carimbo = agora.toISOString().slice(0, 16).replace('T', '-').replace(':', 'h')
const pasta = join(destino, carimbo)

const url = readFileSync(join(homedir(), '.rdx-db-url'), 'utf8').trim()
const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

// Um erro no meio de um backup é pior do que não ter backup, porque parece que
// tem. Nada é declarado pronto até a conferência no fim passar.
const problemas = []
const resumo = []

await db.connect()

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

let baixados = 0, bytes = 0
if (!base) {
  problemas.push('não consegui deduzir a URL do projeto — os arquivos não foram baixados')
} else {
  mkdirSync(join(pasta, 'arquivos'), { recursive: true })
  for (const o of objetos) {
    const alvo = join(pasta, 'arquivos', o.name)
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
resumo.push({ tipo: 'arquivos', nome: 'attachments', linhas: baixados })

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
if (base && baixados !== objetos.length) {
  problemas.push(`arquivos: ${objetos.length} no storage, ${baixados} baixados`)
}

const manifesto = {
  quando: agora.toISOString(),
  projeto,
  tabelas: resumo.filter(r => r.tipo === 'tabela'),
  esquema: resumo.filter(r => r.tipo === 'esquema'),
  arquivos: { esperados: objetos.length, baixados, bytes },
  problemas,
  integro: problemas.length === 0,
}
writeFileSync(join(pasta, 'manifesto.json'), JSON.stringify(manifesto, null, 2))

const mb = (bytes / 1048576).toFixed(1)
const linhas = resumo.filter(r => r.tipo === 'tabela').reduce((s, r) => s + r.linhas, 0)
console.log(`\n${pasta}`)
console.log(`  ${resumo.filter(r => r.tipo === 'tabela').length} tabelas · ${linhas} linhas`)
console.log(`  ${baixados}/${objetos.length} arquivos · ${mb} MB`)

if (problemas.length) {
  console.log(`\n  ${problemas.length} PROBLEMA(S) — este backup não está completo:`)
  for (const p of problemas.slice(0, 10)) console.log(`    · ${p}`)
  process.exit(1)
}
console.log('  conferido: tudo relido e batendo\n')
