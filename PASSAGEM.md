# Passagem do Impo RDX para as contas da Redantex

Documento para Nathan (TI). Preparado em 14 de setembro de 2026, a partir do
estado real dos sistemas nesse dia — os números foram lidos, não estimados.

O hub é um sistema web em que a Redantex conduz cotações, amostras e pedidos
com dois fornecedores (DEQI e Sconcept). Hoje ele vive em três serviços, todos
nas contas pessoais do Doani. A passagem é **mudar o dono** de cada um — os
três têm transferência nativa. Nada é copiado à mão, nada muda de endereço, e
os usuários não percebem.

---

## 1. O que existe, e onde

### Supabase — banco de dados, login e arquivos

| | |
|---|---|
| Projeto | `gptbmaxoxwyjvgecssqm` (região us-east, Ohio) |
| Endereço | `https://gptbmaxoxwyjvgecssqm.supabase.co` |
| Conta atual | doanipavan@me.com |
| Plano | **Free** — não faz backup automático (por isso existe o nosso, item 5) |
| Banco | 15 MB · 13 tabelas · 35 políticas de acesso (RLS) · 20 gatilhos |
| Arquivos | 624 objetos, 435 MB, no bucket `attachments` |
| Usuários | 8 contas (5 Redantex, 3 de fornecedores), via Supabase Auth |
| Agendamentos no banco | `sla-samples` (dias úteis, 12:00 UTC) e `payment-reminders` (diário, 12:00 UTC), via pg_cron |

O que a transferência **leva junto**: tudo acima. O endereço e as chaves não
mudam, então o site continua funcionando sem republicar.

### Netlify — o site no ar

| | |
|---|---|
| Site | `impordx.netlify.app` (sem domínio próprio) |
| Time atual | o pessoal do Doani |
| Publicação | automática a cada push na branch `main` do GitHub |
| Build | `npm run build` → pasta `dist` (definido em `netlify.toml`) |
| Variáveis de ambiente | `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` — só essas duas |
| Custo | por **créditos**: ~15 por publicação, 1.000 por mês no plano atual. Servir o site custa quase nada; publicar é o que gasta. |

O `netlify.toml` já evita publicar quando só documentação ou migração mudou.

### GitHub — código e histórico

| | |
|---|---|
| Repositório | `github.com/doanipavan/impordx`, branch `main` |
| Conteúdo | 146 commits · 43 migrações de banco em `supabase/migrations/` · testes em `scripts/` |
| Documentação | `CLAUDE.md` (armadilhas e convenções do projeto) e este arquivo |
| Automação | nenhuma (sem CI); quem publica é o Netlify ao ver o push |

### No Mac do Doani — o que a transferência de contas NÃO cobre

| | |
|---|---|
| `~/.rdx-db-url` | a senha de conexão direta ao banco (item 6: trocar) |
| `~/.rdx-dbtool/db.mjs` | ferramenta para rodar SQL no banco |
| `~/Library/LaunchAgents/com.redantex.impordx-backup.plist` | **o backup diário**, às 20h, gravando em `iCloud Drive/BACKUP HUB` — no iCloud pessoal do Doani |
| `.env.local` na pasta do projeto | as duas variáveis do Netlify, para rodar localmente |

Não há: domínio próprio, provedor de e-mail, chaves de API de terceiros.

---

## 2. Antes da segunda-feira — o que o Nathan cria

Os três destinos precisam existir antes, e em cada um o **Doani precisa ser
membro** para conseguir transferir para lá.

| Serviço | Criar | E convidar o Doani como |
|---|---|---|
| Supabase | uma **Organization** "Redantex" (supabase.com → New organization) | Owner |
| Netlify | um **Team** "Redantex" (app.netlify.com → team switcher → Create team), com o cartão da empresa | Owner |
| GitHub | uma **Organization** "redantex" (github.com → New organization) | Member com permissão de criar repositórios |

Recomendação: contas com e-mail da empresa e **2FA ligado** nos três.

---

## 3. Segunda-feira — Supabase (1 hora, sem impacto no site)

É o primeiro porque é o mais seguro: nada muda de endereço.

1. **Backup na véspera.** Rodar `node scripts/backup.mjs` no Mac do Doani e
   confirmar a linha `conferido: tudo relido e batendo`. É o ponto de retorno.
2. No painel do Supabase, com a conta do Doani: projeto → **Project Settings
   → General → Transfer project** → escolher a organização Redantex.
   (O nome do botão pode variar um pouco; a função é "transferir projeto para
   outra organização".)
3. Confirmar.

**Conferir depois:**
- Abrir `impordx.netlify.app`, entrar, abrir um card, escrever um comentário. Se
  funciona, as chaves continuam válidas — e continuam, porque não mudaram.
- No painel do Supabase, agora sob a organização Redantex: **Database →
  Extensions** mostra `pg_cron` ativo, e **Integrations → Cron** lista os dois
  agendamentos.
- Anotar o **plano**: a organização nova decide o plano. No Free não há backup
  automático; no Pro há backups diários por 7 dias. Vale considerar.

---

## 4. Quinta-feira — Netlify e GitHub (1 hora, com um deploy de teste)

A ordem aqui importa: o Netlify publica lendo o GitHub, e a ligação entre os
dois é por conta. Mover um sem religar o outro deixa o site sem conseguir
publicar (o site no ar continua no ar — só não atualiza mais).

### 4a. Netlify — transferir o site

1. Com a conta do Doani: site → **Site configuration → General → Site
   details → Transfer site** → time Redantex.
2. Confirmar. As variáveis de ambiente, as configurações de build e o endereço
   `impordx.netlify.app` vão junto.

**Conferir:** o site aparece no time Redantex, e em **Environment variables**
estão as duas variáveis.

### 4b. GitHub — transferir o repositório

1. Com a conta do Doani: repositório → **Settings → General → Danger Zone →
   Transfer ownership** → organização `redantex`.
2. Confirmar. O histórico inteiro vai junto, e o GitHub mantém redirecionamento
   do endereço antigo.

### 4c. Religar o Netlify ao repositório novo

1. No Netlify, time Redantex: site → **Site configuration → Build & deploy →
   Continuous deployment → Link to a different repository**.
2. Ele vai pedir para **instalar o app do Netlify na organização redantex** do
   GitHub — aceitar, dando acesso ao repositório `impordx`.
3. Escolher `redantex/impordx`, branch `main`.

### 4d. Deploy de teste — a prova de que funcionou

No Mac do Doani, na pasta do projeto:

```
git remote set-url origin https://github.com/redantex/impordx.git
git commit --allow-empty -m "test: deploy após a passagem"
git push origin main
```

Em ~1 minuto o Netlify deve mostrar um deploy novo, **Published**. Se em vez
disso não aparecer nada, o passo 4c não pegou. Custa ~15 créditos — é o preço
de saber.

**Conferir:** abrir o site, entrar, conferir que a aba Finance abre (ela é a
que mais depende do banco).

---

## 5. Depois — o que fica em aberto e é da TI

### O backup precisa sair do Mac do Doani

Hoje ele roda todo dia às 20h no Mac pessoal e grava no iCloud pessoal. Para um
sistema da empresa, isso não serve: depende de um computador estar ligado e de
uma conta que não é da Redantex.

O script é `scripts/backup.mjs`, sem dependência além de Node e da senha do
banco. Roda em qualquer máquina que tenha as duas coisas. Precisa de:
- uma máquina da Redantex ligada às 20h (ou um servidor);
- um destino de storage da empresa (Drive, NAS, S3 — qualquer pasta);
- a senha do banco (nova, item 6) num arquivo `~/.rdx-db-url` nessa máquina.

O que ele grava: o banco inteiro, todo dia, numa pasta datada (640 KB); os
arquivos num acervo único, baixados uma vez cada (435 MB hoje). E confere tudo
no fim — um backup que falha na conferência sai com código de erro, não em
silêncio.

Enquanto isso não acontece, o do Mac do Doani continua rodando. Desligar só
depois que o novo estiver funcionando.

### Três pontos de segurança conhecidos e ainda abertos

Estão documentados em `CLAUDE.md` e foram decisões conscientes por velocidade;
cabe à TI decidir quando fechar:

1. **O bucket de arquivos é público.** Quem tiver o link de um arquivo lê sem
   estar logado. Os nomes são aleatórios, então é obscuridade, não controle.
2. **O preço de venda no nível do card (`value_brl`) é escondido só na tela.**
   Um fornecedor logado consegue lê-lo pela API. O preço por item já está
   protegido de verdade (tabela própria com política própria); o do card não.
3. **Um fornecedor pode alterar preço, quantidade e prazo nos próprios cards.**
   As políticas filtram linhas, não colunas; a correção é um gatilho.

---

## 6. Trocar o que só o Doani tinha

Depois da passagem, com as contas já da Redantex:

- **Senha do banco**: Supabase → Project Settings → Database → Reset database
  password. Atualizar `~/.rdx-db-url` em toda máquina que roda o backup ou a
  ferramenta de SQL. A antiga passa a não valer.
- **Tokens do Netlify e do GitHub** que o Doani tenha criado para uso pessoal:
  revogar.

---

## 7. Se algo der errado

- **Supabase**: a transferência é reversível pelo mesmo caminho (transferir de
  volta). O site nunca deixou de funcionar porque o endereço não mudou.
- **Netlify/GitHub**: o site no ar continua no ar independentemente — o que
  para é a publicação de versões novas. Religar (4c) resolve; e o repositório
  pode ser transferido de volta.
- **Banco corrompido/apagado** (não é um risco da transferência, mas é o pior
  caso): restaurar do backup da véspera. Os JSONs em `banco/` são a cópia
  exata de cada tabela; `esquema/` descreve colunas, políticas, funções e
  gatilhos para reconstruir.

---

## Resumo de uma página

| Quando | O quê | Quem | Risco |
|---|---|---|---|
| Antes de segunda | criar org Supabase, team Netlify, org GitHub; convidar o Doani | Nathan | nenhum |
| Domingo/segunda | backup completo | Doani | nenhum |
| Segunda | transferir o projeto Supabase | Doani | nenhum — endereço não muda |
| Quinta | transferir site Netlify → transferir repo GitHub → religar → deploy de teste | Doani + Nathan | site fica sem publicar até religar |
| Depois | backup numa máquina da empresa; trocar senha do banco; revogar tokens | Nathan | — |
