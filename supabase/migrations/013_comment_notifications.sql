-- Notifications only ever fired for @mentions, and only when the mention was
-- picked from the dropdown — typing "@Ashley" by hand notified nobody. A plain
-- comment on someone's card notified nobody at all.
--
-- Moving this into a trigger fixes three things at once: it no longer depends
-- on the client that happens to be posting, it cannot be skipped, and it stops
-- being fire-and-forget.

create or replace function notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_title text;
  v_mentioned uuid[] := '{}';
begin
  select u.full_name into v_actor from users u where u.id = new.user_id;
  select c.title into v_title from cards c where c.id = new.card_id;

  -- Mentions are stored inline as @[Full Name] by the composer.
  select coalesce(array_agg(distinct u.id), '{}')
    into v_mentioned
    from users u
   where u.full_name in (
     select (regexp_matches(new.body, '@\[([^\]]+)\]', 'g'))[1]
   );

  insert into notifications (user_id, card_id, actor_id, type, message)
  select m, new.card_id, new.user_id, 'mention',
         coalesce(v_actor, 'Someone') || ' mentioned you in "' || coalesce(v_title, 'a card') || '"'
    from unnest(v_mentioned) as m
   where m <> new.user_id;

  -- Everyone already involved with the card: whoever opened it, whoever owns
  -- it, and anyone who has commented. Mentioned people are excluded so they
  -- get one notification, not two.
  insert into notifications (user_id, card_id, actor_id, type, message)
  select distinct p, new.card_id, new.user_id, 'comment',
         coalesce(v_actor, 'Someone') || ' commented on "' || coalesce(v_title, 'a card') || '"'
    from (
      select c.created_by as p from cards c where c.id = new.card_id
      union
      select c.responsible_id from cards c where c.id = new.card_id
      union
      select cm.user_id from comments cm where cm.card_id = new.card_id
    ) participants
   where p is not null
     and p <> new.user_id
     and not (p = any(v_mentioned));

  return new;
exception when others then
  -- A comment is worth more than a notification. If this fails, the comment
  -- must still be saved.
  raise warning 'notify_on_comment failed for comment %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists comments_notify on comments;
create trigger comments_notify
  after insert on comments
  for each row execute function notify_on_comment();
