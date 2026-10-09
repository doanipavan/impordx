-- Os vendedores ganham um lugar, e as três Julias viram uma.
--
-- Até aqui o vendedor de um card era uma de duas coisas: um login do hub
-- (`salesperson_id`) ou um nome digitado à mão (`salesperson_name`). O hub tem
-- cinco contas da Redantex e a empresa tem vinte e cinco vendedores, então a
-- maioria caiu na caixa de texto — e a caixa de texto fez o que caixa de texto
-- faz: `JULIA`, `Júlia` e `Julia` são a mesma pessoa em três linhas do
-- relatório, `GREICI` e `Greici` em duas, `DIEGO PRESTES` e `Diego` em duas.
-- Agrupar venda por vendedor com isso dá um número errado com cara de certo.
--
-- Então o vendedor vira tabela, como o cliente virou na 051. Quem tem login
-- fica ligado a ele (`user_id`); quem não tem existe do mesmo jeito, com nome
-- e email — o email é o que põe o vendedor em cópia do aviso ao cliente.
--
-- Fica fora do alcance do fornecedor de propósito: é a lista de quem vende na
-- Redantex, com os endereços. Mesma política da 051.

create table if not exists salespeople (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  -- Preenchido só para quem também entra no hub. Vendedor sem login existe
  -- aqui como qualquer outro: ele aparece no painel e recebe cópia dos avisos,
  -- apenas não faz login.
  user_id    uuid references users(id),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

comment on table salespeople is
  'Quem vende na Redantex. Separada de cards porque aquela tabela é legível '
  'pelo fornecedor, e a lista comercial com emails não é dado que ele deva '
  'ter. Vendedor sai de cena com active = false, nunca por delete: apagar '
  'levaria a atribuição dos pedidos dele embora.';

-- Um vendedor por nome, ignorando caixa e espaço — a mesma regra de clients,
-- e a regra que impede a quarta Julia.
create unique index if not exists salespeople_name_key
  on salespeople (upper(btrim(name)));

create index if not exists salespeople_active_idx on salespeople (active);

alter table cards add column if not exists salesperson_ref_id uuid references salespeople(id);
create index if not exists cards_salesperson_ref_idx on cards (salesperson_ref_id);

comment on column cards.salesperson_ref_id is
  'Quem vendeu este pedido. Passa a ser a fonte da atribuição; '
  'salesperson_id e salesperson_name ficam como escada atrás, para os cards '
  'que ninguém reabriu ainda.';

-- ---------------------------------------------------------------------------
-- Semeadura
-- ---------------------------------------------------------------------------

-- 1. Quem tem login e já aparece como vendedor em algum card.
insert into salespeople (name, email, user_id)
select distinct on (upper(btrim(u.full_name)))
       btrim(u.full_name), u.email, u.id
  from users u
 where u.role in ('admin', 'member')
   and exists (select 1 from cards c where c.salesperson_id = u.id)
 order by upper(btrim(u.full_name)), u.created_at
on conflict do nothing;

-- 2. As grafias que são a mesma pessoa, decididas à mão porque adivinhar
--    semelhança de nome é como se junta gente que não devia ser junta.
insert into salespeople (name) values
  ('Júlia'), ('Greici'), ('Jonatan'), ('Renata'), ('Diego Prestes'), ('Erika')
on conflict do nothing;

-- 3. Qualquer nome digitado que o passo 2 não cobre entra como está. Sem isto,
--    um nome que eu não vi hoje perderia a atribuição em silêncio.
insert into salespeople (name)
select distinct on (upper(btrim(c.salesperson_name))) btrim(c.salesperson_name)
  from cards c
 where btrim(coalesce(c.salesperson_name, '')) <> ''
   and upper(btrim(c.salesperson_name)) not in ('JULIA', 'DIEGO')
   and not exists (
     select 1 from salespeople s
      where upper(btrim(s.name)) = upper(btrim(c.salesperson_name)))
 order by upper(btrim(c.salesperson_name)), c.created_at desc
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Religar os cards
-- ---------------------------------------------------------------------------

update cards c
   set salesperson_ref_id = s.id
  from salespeople s
 where c.salesperson_ref_id is null
   and s.user_id is not null
   and c.salesperson_id = s.user_id;

update cards c
   set salesperson_ref_id = s.id
  from salespeople s
 where c.salesperson_ref_id is null
   and btrim(coalesce(c.salesperson_name, '')) <> ''
   and upper(btrim(s.name)) = case upper(btrim(c.salesperson_name))
         when 'JULIA' then 'JÚLIA'
         when 'DIEGO' then 'DIEGO PRESTES'
         else upper(btrim(c.salesperson_name))
       end;

-- ---------------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------------

alter table salespeople enable row level security;

create policy "Redantex reads salespeople" on salespeople
  for select using (current_user_is_redantex());

create policy "Redantex writes salespeople" on salespeople
  for insert with check (current_user_is_redantex());

create policy "Redantex updates salespeople" on salespeople
  for update using (current_user_is_redantex());

-- Sem delete de propósito: `active = false` tira do seletor e mantém o
-- histórico de quem vendeu o quê.

create or replace function stamp_salesperson_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_stamp_salesperson_updated on salespeople;
create trigger trg_stamp_salesperson_updated
  before update on salespeople
  for each row execute function stamp_salesperson_updated();
