-- O freio de emergência.
--
-- Os avisos ao cliente saem sozinhos, de quinze em quinze minutos, sem
-- ninguém apertar nada. Precisa existir um jeito de parar tudo em dez
-- segundos — e não pode ser variável de ambiente: o Netlify só entrega
-- variável nova num deploy novo, o que faria o freio levar dois minutos e
-- custar quinze créditos. Então a chave mora no banco, onde a função a lê a
-- cada execução e a tela a vira num clique.

create table if not exists app_flags (
  key        text primary key,
  enabled    boolean not null default true,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

comment on table app_flags is
  'Interruptores que precisam virar sem deploy. Lidos pelas funções a cada '
  'execução.';

insert into app_flags (key, enabled, note)
values ('client_emails', true, 'Avisos automáticos ao cliente')
on conflict (key) do nothing;

alter table app_flags enable row level security;

create policy "Redantex reads flags" on app_flags
  for select using (current_user_is_redantex());

create policy "Redantex flips flags" on app_flags
  for update using (current_user_is_redantex());

-- Criar e apagar interruptor é coisa de migração, não de tela.

create or replace function stamp_flag_updated()
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

drop trigger if exists trg_stamp_flag_updated on app_flags;
create trigger trg_stamp_flag_updated
  before update on app_flags
  for each row execute function stamp_flag_updated();
