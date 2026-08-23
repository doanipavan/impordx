-- A status change was the one event everyone actually watches for and the one
-- nobody was told about: the supplier moves an order into production and
-- Redantex finds out by noticing.
--
-- Same shape as the comment trigger — in the database so it holds however the
-- status is changed, and swallowing its own failures so a notification can
-- never be the reason a card fails to move.

create or replace function notify_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_actor_id uuid := auth.uid();
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select u.full_name into v_actor from users u where u.id = v_actor_id;

  insert into notifications (user_id, card_id, actor_id, type, message)
  select distinct p, new.id, v_actor_id, 'status_change',
         coalesce(v_actor, 'Someone') || ' moved "' || coalesce(new.title, 'a card')
           || '" to ' || new.status
    from (
      select c.created_by as p from cards c where c.id = new.id
      union
      select c.responsible_id from cards c where c.id = new.id
      union
      select cm.user_id from comments cm where cm.card_id = new.id
    ) participants
   where p is not null
     and (v_actor_id is null or p <> v_actor_id);

  return new;
exception when others then
  raise warning 'notify_on_status_change failed for card %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists cards_notify_status on cards;
create trigger cards_notify_status
  after update on cards
  for each row execute function notify_on_status_change();
