-- Silenciar um card.
--
-- Um pedido em revisão pesada vira ruído: o ALESSANDRA SEMEONI sozinho gerou
-- 40 notificações, e 78% de todas vêm de uma única pessoa do outro lado.
-- Quem acompanha o card de perto não precisa ser avisado de cada arquivo que
-- a fábrica anexa nele.
--
-- O portão fica **antes do insert em notifications**, e não dentro de cada
-- função que notifica. São sete produtores hoje — comentário, etapa, anexo,
-- SLA, assinatura, prazo de pagamento, mudança de data — e editar os sete
-- seria sete lugares para esquecer um. Aqui a regra é uma, e vale para o
-- oitavo produtor que ainda não existe.

create table if not exists muted_cards (
  user_id  uuid not null references users(id) on delete cascade,
  card_id  uuid not null references cards(id) on delete cascade,
  muted_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

comment on table muted_cards is
  'Cards que uma pessoa pediu para parar de acompanhar. Lido por um gatilho '
  'antes de qualquer notificação ser gravada.';

alter table muted_cards enable row level security;

-- Cada um silencia o que quiser, para si. Ninguém cala o aviso de outro.
create policy "Mute own" on muted_cards
  for select using (user_id = auth.uid());
create policy "Mute insert own" on muted_cards
  for insert with check (user_id = auth.uid());
create policy "Mute delete own" on muted_cards
  for delete using (user_id = auth.uid());

create or replace function drop_muted_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.card_id is not null and exists (
    select 1 from muted_cards m
     where m.user_id = new.user_id and m.card_id = new.card_id
  ) then
    -- `null` num gatilho BEFORE cancela a linha sem erro nenhum: quem está
    -- notificando não precisa saber que o destinatário se calou.
    return null;
  end if;
  return new;
end;
$$;

comment on function drop_muted_notification is
  'Descarta a notificação de um card silenciado. Um portão para os sete '
  'produtores, em vez de sete verificações para esquecer uma.';

drop trigger if exists trg_drop_muted_notification on notifications;
create trigger trg_drop_muted_notification
  before insert on notifications
  for each row execute function drop_muted_notification();
