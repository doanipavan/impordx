# Hub de Compras — Fornecedores Nacionais

Material para o Marcus construir no Lovable.

Isto não é um prompt só. São duas coisas, e a diferença entre elas é o que
decide se o app fica de pé ou vira uma planilha com botões.

---

## Antes de colar nada

**O Lovable esquece.** Cada mensagem chega sem lembrar da anterior. Na
terceira tela ele vai escrever uma regra de acesso aberta — não por
descuido, é o caminho mais curto e ele sempre pega o caminho mais curto.
Por isso:

- A **Parte 1** vai no campo de instruções fixas do projeto (no Lovable:
  **Settings → Knowledge**, ou "instruções do projeto", depende da versão).
  Ela viaja junto de toda mensagem. Cole uma vez e esqueça.
- A **Parte 2** são os prompts, numerados. **Um por mensagem, na ordem.**
  Não junte dois para economizar: ele constrói os dois pela metade.

Três coisas que poupam dinheiro e retrabalho:

1. **Planeje no Chat mode, construa no Build mode.** No chat ele pensa sem
   escrever código. Peça o modelo de dados, leia, corrija — e só então
   deixe construir. Desmanchar o que foi construído errado custa o dobro.
2. **Ligue o banco na primeira mensagem**, antes de qualquer tela. Se ele
   fizer as telas com dados de mentira primeiro, você paga de novo para
   ligar tudo depois.
3. **Depois de cada prompt, teste com dois logins** — um da Redantex e um
   de fornecedor. Não confie no "pronto!" dele. A lista no fim deste
   arquivo diz o que olhar.

---

## Parte 1 — Instruções fixas (cole em Knowledge)

> Marcus: leia a seção "O que é" e corrija o que não bate com o seu
> processo antes de colar. O resto, as regras, deixe como está — cada uma
> dessas doze é um problema que já aconteceu de verdade no hub da China.

### O que é

A Redantex (embalagens para joias, São Paulo) compra de fornecedores
brasileiros: cartonagem, impressão, papel, veludo e tecido, fitas, espuma,
sacolas, e serviços como hot-stamping e serigrafia. Hoje isso vive em
WhatsApp e planilha. Este hub junta três coisas numa só: pedir preço a
vários fornecedores, escolher, e acompanhar até a mercadoria chegar.

Quem usa:

- **Comprador** (Redantex) — faz tudo.
- **Diretor** (Redantex) — vê tudo, não altera preço.
- **Fornecedor** — entra com login próprio e vê **só o que é dele**.

A interface é toda em português, inclusive datas e nomes de mês. Os dois
lados são brasileiros; não existe motivo para uma palavra em inglês na
tela.

### O fluxo

1. **Peça** — o que precisa ser comprado: nome, especificação, quantidade,
   arte, e o prazo que o cliente final espera.
2. **Cotação** — uma peça vai para vários fornecedores ao mesmo tempo. Cada
   um responde com preço unitário, prazo em dias e condição de pagamento.
3. **Escolha** — o comprador compara e escolhe uma proposta.
4. **Pedido de compra** — número próprio, prazo acordado, acompanhamento
   em quadro.
5. **Recebimento** — total ou parcial, com nota fiscal, e o atraso medido
   contra o prazo que o próprio fornecedor deu.

### A regra mais dura

**Um fornecedor nunca vê nada de outro fornecedor.** Nem o preço, nem o
nome, nem quantos foram convidados para a mesma cotação. Saber que
concorreu com dois já é informação demais — muda o preço da próxima.

Na prática: a tela de comparação é só da Redantex, e o fornecedor que abre
uma cotação vê uma linha, a dele.

### As doze regras que não se discutem

1. **Acesso filtra linhas, não colunas.** Esconder um campo no front não
   protege nada: quem tem login lê a tabela inteira pela API. Se o
   fornecedor A não pode ver o preço de B, isso vive em **tabela separada
   com política própria** — não num campo escondido. No hub da China o
   preço de venda ficou "escondido na tela" por um ano e sempre esteve
   legível por fora.
2. **Nunca uma política `using (true)`.** Nem "por enquanto". Duas delas
   entraram no hub da China num domingo e até hoje qualquer usuário
   autenticado pode alterar qualquer linha.
3. **Prazo é data de calendário, não instante.** Coluna `date`, nunca
   `timestamp`. Data lida como instante volta um dia, e o fornecedor passa
   a ver um prazo diferente do seu. No hub da China isso está errado até
   hoje porque o conserto obviamente certo estraga o outro lado.
4. **Número de pedido nasce no banco**, em função `security definer`, e
   nunca no navegador. Dois cliques no mesmo segundo geram o mesmo número.
5. **Uma regra, um lugar.** Se o prazo de entrega é calculado em duas
   telas, são duas respostas, e um dia elas discordam. No hub da China
   dois pedidos vivos sumiram do gráfico por causa disso. A conta vive
   numa função só, e toda tela lê de lá.
6. **Não apagar: arquivar.** Um campo `arquivado`. `on delete cascade`
   levou embora a assinatura de uma cliente — nome, CPF, data, tudo — sem
   avisar ninguém. Nenhuma política de DELETE em nada que seja prova.
7. **Aviso é trigger no banco, não código de tela**, e precisa falhar em
   silêncio. Um aviso nunca pode ser o motivo de um pedido não salvar.
8. **Tempo real: um canal, um dono.** Dois componentes ouvindo o mesmo nome
   de canal e a tela fica branca quando um deles sai. Aconteceu duas vezes.
9. **Toda mudança de banco em arquivo SQL numerado**, e confira no banco
   depois de aplicar. O banco é a verdade — os tipos que o Lovable gera
   não são prova de que a coluna existe.
10. **Dinheiro em `numeric(12,4)`.** `numeric(10,2)` arredondou em silêncio
    a terceira casa de todos os preços do fornecedor chinês.
11. **Anexo em bucket privado com URL assinada.** Bucket público com nome
    de arquivo aleatório não é controle de acesso, é esperança.
12. **Nada de cálculo de total no navegador** quando o valor vai ser
    comparado ou somado em relatório. Soma no banco, numa view.

### Como me responder

- Quando eu pedir uma tela, **me mostre junto a política de acesso que você
  escreveu**. Mesmo que eu não peça.
- Quando terminar algo que mexe em acesso, me diga **em uma frase cada** o
  que um fornecedor logado consegue ler em cada tabela que você tocou.
- Não diga que está pronto sem ter rodado. Se não puder rodar, diga o que
  ficou sem teste.

---

## Parte 2 — Os prompts, em ordem

### Prompt 1 — fundação

```
Crie a base de um app chamado "Hub de Compras Redantex".

Ative o banco e a autenticação AGORA, antes de qualquer tela.

Tabelas:

- perfis — id (igual ao id do usuário), nome, email, papel
  ('comprador' | 'diretor' | 'fornecedor'), fornecedor_id (nulo para quem
  é da Redantex), ativo, criado_em.

- fornecedores — id, nome_fantasia, razao_social, cnpj, cidade, uf,
  contato_nome, contato_email, contato_whatsapp, categorias (text[]),
  prazo_pagamento_dias (int), frete ('CIF' | 'FOB'), observacoes, ativo,
  criado_em.

Funções de apoio, todas security definer com search_path = public:
- meu_papel() — o papel de quem está logado
- sou_redantex() — true se o papel é comprador ou diretor
- meu_fornecedor() — o fornecedor_id de quem está logado, ou null

Políticas:
- perfis: cada um lê o próprio; a Redantex lê todos.
- fornecedores: a Redantex lê e escreve todos; um fornecedor lê SÓ a linha
  dele, e pode alterar apenas contato_nome, contato_email,
  contato_whatsapp e observacoes.
- Nenhuma política de DELETE em nenhuma das duas.

Telas: login, e uma página inicial que só mostra quem está logado e com
que papel. Mais nada ainda.

Me mostre o SQL das políticas antes de seguir.
```

### Prompt 2 — cadastro de fornecedores

```
Agora o cadastro de fornecedores, só para a Redantex.

Lista com busca por nome e CNPJ, filtro por categoria e por UF, e um
botão de novo. Formulário com todos os campos da tabela. CNPJ com máscara
e validação dos dígitos.

Categorias são uma lista fixa, em português: cartonagem, impressão, papel
e papelão, tecido e veludo, fitas, espuma, sacolas, hot-stamping,
serigrafia, outros. Um fornecedor pode ter várias.

Inativar um fornecedor o esconde das novas cotações mas não apaga nada e
não o tira das cotações antigas.

Convidar um fornecedor: a Redantex cria o acesso dele informando um
email, e o fornecedor define a própria senha pelo link que recebe. A
Redantex nunca digita a senha de ninguém.
```

### Prompt 3 — as peças

```
Agora as peças — o que a Redantex compra.

Tabela pecas: id, nome, codigo_interno, especificacao (texto longo),
quantidade, unidade ('un' | 'mil' | 'kg' | 'm'), prazo_cliente (date),
cliente_final, categoria, criado_por, criado_em, arquivado (bool).

Anexos: tabela peca_anexos com id, peca_id, nome_arquivo, caminho,
enviado_por, enviado_em. Bucket PRIVADO, e a tela abre o arquivo por URL
assinada com validade curta.

Política: a Redantex lê e escreve tudo. Fornecedor não lê nada desta
tabela por enquanto — ele vai ver a especificação através da cotação, no
próximo passo, e só da peça que foi cotada com ele.

Tela: lista de peças com a quantidade e o prazo do cliente, e uma página
da peça com a especificação e os anexos.
```

### Prompt 4 — cotação (é aqui que o isolamento vive)

```
Agora a cotação. É o coração do app e o lugar onde um erro de acesso
custa dinheiro de verdade.

Tabelas:

- cotacoes — id, peca_id, numero (gerado no banco, formato COT-2026-0001),
  status ('aberta' | 'escolhida' | 'cancelada'), prazo_resposta (date),
  criado_por, criado_em.

- cotacao_convites — id, cotacao_id, fornecedor_id, convidado_em,
  visualizado_em, resultado ('pendente' | 'escolhido' | 'nao_escolhido').
  Único por (cotacao_id, fornecedor_id).

- propostas — id, convite_id, preco_unitario numeric(12,4), quantidade,
  prazo_dias (int), condicao_pagamento, frete_incluso (bool),
  validade (date), observacoes, enviado_em.

Políticas — leia com atenção:
- cotacoes: a Redantex lê todas. Um fornecedor lê uma cotação APENAS se
  existir convite dele para ela.
- cotacao_convites: a Redantex lê todos. Um fornecedor lê SÓ os convites
  dele. Nunca os dos outros, nem a contagem deles.
- propostas: a Redantex lê todas. Um fornecedor lê e escreve SÓ a
  proposta ligada a um convite dele, e só enquanto a cotação está aberta.

Nenhuma tela, nenhum contador e nenhum texto pode revelar ao fornecedor
quantos foram convidados na mesma cotação, nem que posição ele ocupa.
Se uma consulta precisa desse número, ela é da Redantex.

Telas:
- Redantex: criar cotação a partir de uma peça, escolher os fornecedores
  (lista filtrada pela categoria da peça), definir o prazo de resposta.
- Fornecedor: as cotações dele, com a especificação e os anexos da peça, e
  um formulário de proposta.

Quando terminar, me mostre as três políticas e me diga, em uma frase cada,
o que um fornecedor logado consegue ler em cada uma das três tabelas.
```

### Prompt 5 — comparar e escolher

```
Agora a tela de comparação, só para a Redantex.

Uma cotação aberta mostra as propostas lado a lado: fornecedor, preço
unitário, total, prazo em dias, condição de pagamento, frete. Marque com
um selo discreto o menor preço e o menor prazo — podem ser fornecedores
diferentes, e é exatamente isso que o comprador precisa ver.

Mostre também quem foi convidado e não respondeu, e se já passou o prazo
de resposta.

O botão "escolher esta" pede confirmação, marca a cotação como escolhida,
põe resultado = 'escolhido' naquele convite e 'nao_escolhido' nos outros.
Cada fornecedor vê apenas o próprio resultado — nunca quem ganhou.

A escolha não pode ser desfeita por um clique. Se o comprador precisar
trocar, ele cancela a cotação e abre outra, e as duas ficam registradas.
```

### Prompt 6 — pedido de compra

```
Agora o pedido de compra, que nasce de uma proposta escolhida.

Tabela pedidos: id, cotacao_id, fornecedor_id, numero (gerado no banco,
PED-2026-0001), preco_unitario, quantidade, prazo_dias, data_pedido
(date), previsao_entrega (date), condicao_pagamento, status, observacoes,
criado_em, arquivado.

previsao_entrega = data_pedido + prazo_dias, calculado por UMA função no
banco que todas as telas leem. Não repita essa conta em lugar nenhum.
Se o prazo mudar depois, a função responde o novo valor em todas as telas
ao mesmo tempo.

Status, em quadro kanban: Enviado → Em produção → Pronto → Em transporte
→ Recebido. Mais 'Atrasado' não é status: é uma marca vermelha calculada
em cima de previsao_entrega, porque um pedido atrasado continua em
produção.

O fornecedor vê os pedidos dele, pode mover entre Em produção, Pronto e
Em transporte, e pode avisar uma data nova com justificativa — toda
mudança de data fica registrada em histórico com quem, quando e por quê.
O fornecedor não move para Recebido: isso é da Redantex.
```

### Prompt 7 — recebimento

```
Agora o recebimento, que pode ser parcial.

Tabela recebimentos: id, pedido_id, quantidade, numero_nf, serie_nf,
data_nf (date), data_recebimento (date), recebido_por, observacoes,
criado_em.

A tela do pedido mostra quanto já chegou, quanto falta, e as notas.
O pedido vira 'Recebido' sozinho quando a soma dos recebimentos alcança a
quantidade — e esse saldo é somado no banco, em view, não no navegador.

Guarde também o atraso: dias entre previsao_entrega e o último
recebimento. É o número que, acumulado, diz quem entrega na data e quem
promete bonito.

Fornecedor lê os recebimentos dos pedidos dele e não escreve nenhum.
```

### Prompt 8 — painel e avisos

```
Por último, o painel da Redantex e os avisos.

Painel, nesta ordem de importância:
1. O que está atrasado, com quantos dias e de quem.
2. O que chega nos próximos sete dias.
3. Cotações com prazo de resposta vencendo, e quem ainda não respondeu.
4. Pedidos do mês e valor comprado no mês.

Avisos por trigger no banco, nunca por código de tela, e que falhem em
silêncio: nova proposta recebida, prazo de resposta vencido, data de
entrega alterada pelo fornecedor, pedido atrasado, recebimento lançado.

Cada aviso aponta para a linha que o originou. Uma tela de avisos com
"marcar como lido" e filtro por tipo.

Nada de email por enquanto — só dentro do app. Email é o passo seguinte, e
só depois que o resto estiver de pé.
```

---

## Como saber que está certo

Depois do Prompt 4 e depois do Prompt 6, faça este teste você mesmo. Não
pergunte ao Lovable se está certo — ele responde que sim.

Crie dois fornecedores de teste, A e B, com login cada um. Ponha os dois
na mesma cotação. Então, logado como **A**:

| O que tentar | O certo é |
|---|---|
| Abrir a lista de cotações | aparece a cotação, uma vez |
| Olhar a tela da cotação | nenhum sinal de que existe B |
| Procurar a proposta de B | não existe para A |
| Abrir o pedido de B pelo endereço direto, trocando o número na URL | tela vazia ou erro, nunca os dados |
| Ver o resultado da escolha | só o dele: escolhido ou não |

O quarto é o que pega. Esconder da lista é fácil; o que vale é a linha não
existir para quem não pode ver. Se algum dado de B aparecer para A, pare
tudo e conserte antes de construir mais uma tela — o conserto fica mais
caro em cada prompt que passa.

---

## O que eu deixaria para depois

Não porque não importe: porque entra melhor quando o resto já roda.

- **Email e WhatsApp** para o fornecedor. Dentro do app primeiro.
- **Nota fiscal automática** (XML, chave, consulta na SEFAZ). Comece
  digitando número e série.
- **Alçada de aprovação** — compra acima de um valor pede o diretor.
- **Histórico de preço por fornecedor** — o gráfico que mostra quem subiu
  preço no ano. Vale muito, e precisa de meses de dado para dizer algo.
- **Estoque.** É outro sistema, não um campo a mais.

---

*Escrito a partir do que já custou caro no hub da China (Redantex ×
DEQI/Sconcept). As doze regras da Parte 1 são todas cicatriz, nenhuma é
teoria. — 25 nov 2026*
