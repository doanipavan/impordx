-- O cliente ganha um lugar, e o email dele fica fora do alcance do fornecedor.
--
-- Até aqui o cliente era só um texto em `cards.client_name`, repetido em cada
-- card — 49 nomes distintos em 65 cards. Para escrever ao cliente é preciso o
-- endereço, e o endereço não pode morar em `cards`: aquela tabela é lida
-- coluna a coluna por qualquer conta autenticada cuja política deixe passar a
-- linha, e a DEQI é uma delas. RLS filtra linha, não coluna. Email é dado
-- pessoal; repetir aqui o erro do `value_brl` seria entregar a lista de
-- contatos da Redantex ao fornecedor.
--
-- Então o cliente vira tabela própria, com política própria, exatamente como
-- o preço de venda na 025. O nome continua no card, como sempre esteve, para
-- nada do que já existe mudar de comportamento.

create table if not exists clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

comment on table clients is
  'O cliente da Redantex e como falar com ele. Separada de cards porque '
  'aquela tabela é legível pelo fornecedor, e email de cliente não é dado '
  'que o fornecedor deva ter.';

-- Um cliente por nome, ignorando caixa e espaço em volta: é assim que o resto
-- do hub já os agrupa — filtro da timeline, relatório, planilha.
create unique index if not exists clients_name_key
  on clients (upper(btrim(name)));

alter table cards add column if not exists client_id uuid references clients(id);
create index if not exists cards_client_id_idx on cards (client_id);

comment on column cards.client_id is
  'Aponta para o cliente. Um uuid não revela nada a quem lê a linha; o email '
  'fica do outro lado, atrás da política de clients.';

-- Semeia a tabela com o que já existe. O nome gravado é o da versão mais
-- recente — se alguém corrigiu a grafia num card novo, é essa que vale.
insert into clients (name)
select distinct on (upper(btrim(client_name))) btrim(client_name)
  from cards
 where btrim(coalesce(client_name, '')) <> ''
 order by upper(btrim(client_name)), created_at desc
on conflict do nothing;

update cards c
   set client_id = cl.id
  from clients cl
 where c.client_id is null
   and upper(btrim(c.client_name)) = upper(btrim(cl.name));

alter table clients enable row level security;

-- Uma condição, quatro comandos: ou você é a Redantex, ou você não está aqui.
create policy "Redantex reads clients" on clients
  for select using (current_user_is_redantex());

create policy "Redantex writes clients" on clients
  for insert with check (current_user_is_redantex());

create policy "Redantex updates clients" on clients
  for update using (current_user_is_redantex());

create policy "Redantex deletes clients" on clients
  for delete using (current_user_is_redantex());

-- `updated_at` que não depende de ninguém lembrar.
create or replace function stamp_client_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_stamp_client_updated on clients;
create trigger trg_stamp_client_updated
  before update on clients
  for each row execute function stamp_client_updated();
