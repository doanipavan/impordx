-- Notifications have been silently dead since 24 August.
--
-- `cards.responsible_id` was replaced by `salesperson_id` and
-- `project_manager_id` when a card started naming two owners. Both notify
-- functions still selected the old column, so every insert raised
-- "column c.responsible_id does not exist" — and both functions catch
-- `when others` on purpose, so a comment never fails because of a notification.
-- The protection worked exactly as designed and hid the breakage completely:
-- 21 comments and 23 status changes produced zero notifications.
--
-- The swallow stays; that trade is still right. What changes is that the
-- participants list reads the columns that exist.

create or replace function notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor text;
  v_title text;
  v_mentioned uuid[] := '{}';
begin
  select u.full_name into v_actor from users u where u.id = new.user_id;
  select c.title into v_title from cards c where c.id = new.card_id;

  select coalesce(array_agg(distinct u.id), '{}') into v_mentioned
    from users u
   where u.full_name in (select (regexp_matches(new.body, '@\[([^\]]+)\]', 'g'))[1]);

  insert into notifications (user_id, card_id, actor_id, type, message)
  select m, new.card_id, new.user_id, 'mention',
         coalesce(v_actor,'Someone') || ' mentioned you in "' || coalesce(v_title,'a card') || '"'
    from unnest(v_mentioned) as m where m <> new.user_id;

  insert into notifications (user_id, card_id, actor_id, type, message)
  select distinct p, new.card_id, new.user_id, 'comment',
         coalesce(v_actor,'Someone') || ' commented on "' || coalesce(v_title,'a card') || '"'
    from (
      select c.created_by         as p from cards c where c.id = new.card_id
      union select c.salesperson_id     from cards c where c.id = new.card_id
      union select c.project_manager_id from cards c where c.id = new.card_id
      union select cm.user_id           from comments cm where cm.card_id = new.card_id
    ) participants
   where p is not null and p <> new.user_id and not (p = any(v_mentioned));

  return new;
exception when others then
  raise warning 'notify_on_comment failed for comment %: %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function notify_on_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor text;
  v_actor_id uuid := auth.uid();
begin
  if new.status is not distinct from old.status then return new; end if;
  select u.full_name into v_actor from users u where u.id = v_actor_id;

  insert into notifications (user_id, card_id, actor_id, type, message)
  select distinct p, new.id, v_actor_id, 'status_change',
         coalesce(v_actor,'Someone') || ' moved "' || coalesce(new.title,'a card') || '" to ' || new.status
    from (
      select c.created_by         as p from cards c where c.id = new.id
      union select c.salesperson_id     from cards c where c.id = new.id
      union select c.project_manager_id from cards c where c.id = new.id
      union select cm.user_id           from comments cm where cm.card_id = new.id
    ) participants
   where p is not null and (v_actor_id is null or p <> v_actor_id);

  return new;
exception when others then
  raise warning 'notify_on_status_change failed for card %: %', new.id, sqlerrm;
  return new;
end;
$$;
