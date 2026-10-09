-- O relatório diário ganha destinatários no banco e memória do que disse.
--
-- Duas coisas, uma razão comum: o email tinha os destinatários numa variável
-- de ambiente do Netlify, e variável de ambiente só vale no deploy seguinte.
-- Então incluir o Patrick custava um deploy e dependia de alguém com acesso ao
-- painel. É a mesma armadilha do freio da 055, e a mesma saída: mora no banco,
-- vira numa tela.
--
-- A segunda é o aviso de mudança de mês. Para dizer "este pedido saiu de
-- dezembro e entrou em novembro", o email precisa saber o que ele mesmo disse
-- ontem. Recalcular pelo histórico de datas pegaria só quem mudou por data
-- nova — não o pedido que trocou de mês porque chegou, nem o que entrou novo,
-- nem o que saiu. Então grava-se o retrato e compara-se com o anterior. É a
-- mesma disciplina do `summary` da 057: registro, não cálculo.

create table if not exists report_recipients (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

comment on table report_recipients is
  'Quem recebe o panorama diário. No banco, e não em variável de ambiente, '
  'para que incluir alguém não custe um deploy.';

create unique index if not exists report_recipients_email_key
  on report_recipients (lower(btrim(email)));

-- Semeia com o administrador e com o Patrick, que é quem passou a precisar.
-- Se o endereço de algum deles não estiver no cadastro, a linha simplesmente
-- não entra, e a função cai na variável de ambiente antiga.
insert into report_recipients (name, email)
select u.full_name, u.email
  from users u
 where u.role = 'admin' and btrim(coalesce(u.email, '')) <> ''
on conflict do nothing;

insert into report_recipients (name, email)
select s.name, s.email
  from salespeople s
 where s.name ilike 'patrick%' and btrim(coalesce(s.email, '')) <> ''
on conflict do nothing;

alter table report_recipients enable row level security;

create policy "Redantex reads recipients" on report_recipients
  for select using (current_user_is_redantex());

create policy "Redantex writes recipients" on report_recipients
  for insert with check (current_user_is_redantex());

create policy "Redantex updates recipients" on report_recipients
  for update using (current_user_is_redantex());

create policy "Redantex deletes recipients" on report_recipients
  for delete using (current_user_is_redantex());

create or replace function stamp_recipient_updated()
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

drop trigger if exists trg_stamp_recipient_updated on report_recipients;
create trigger trg_stamp_recipient_updated
  before update on report_recipients
  for each row execute function stamp_recipient_updated();

-- ---------------------------------------------------------------------------
-- O retrato de cada manhã
-- ---------------------------------------------------------------------------

create table if not exists arrival_snapshots (
  id          uuid primary key default gen_random_uuid(),
  taken_on    date not null,
  -- `set null` e não cascade, com o texto gravado ao lado: apagar um card não
  -- pode destruir o registro do que o relatório disse. Foi assim que uma
  -- assinatura de cliente se perdeu, e a lição ficou.
  card_id     uuid references cards(id) on delete set null,
  card_ref    text,
  client_name text,
  month       text not null,
  value_brl   numeric,
  created_at  timestamptz not null default now()
);

comment on table arrival_snapshots is
  'O que o panorama diário disse em cada manhã: mês de chegada e valor de '
  'cada pedido. Comparar o retrato de hoje com o de ontem é o que permite '
  'avisar que um valor trocou de mês.';

create unique index if not exists arrival_snapshots_day_card
  on arrival_snapshots (taken_on, card_id);

create index if not exists arrival_snapshots_day on arrival_snapshots (taken_on desc);

alter table arrival_snapshots enable row level security;

-- Só leitura, e só Redantex: quem escreve é a função agendada, com a chave de
-- serviço, que passa por cima de RLS.
create policy "Redantex reads snapshots" on arrival_snapshots
  for select using (current_user_is_redantex());
