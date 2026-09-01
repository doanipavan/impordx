-- The first delivery date DEQI gives is a promise, and promises are kept on
-- record.
--
-- Until now delivery_date was a single column anyone could overwrite. A date
-- that moved left no trace: no record of what was originally committed to, no
-- reason, and nobody told. The client had been quoted the first date, and
-- Redantex could only find out by remembering.
--
-- So the first date is frozen the moment it arrives, every later change has to
-- carry a reason, and the people who have to re-plan around it are told.

alter table cards add column if not exists delivery_date_promised date;
alter table cards add column if not exists delivery_date_changed_at timestamptz;
alter table cards add column if not exists delivery_date_change_reason text;

comment on column cards.delivery_date_promised is
  'The first delivery date DEQI ever gave for this order. Stamped once by '
  'guard_delivery_date and never written again — delivery_date holds the '
  'current one, and the gap between them is the slip.';

-- Everything already on the board got its date before this rule existed. The
-- date on record is the only one we know of, so it is the promise.
update cards
   set delivery_date_promised = delivery_date
 where delivery_date is not null and delivery_date_promised is null;

-- Who hears about it. Not a role: Doani is admin, Marcus is member, and so are
-- Antonio and Patrick, who are not on this list. Same reasoning as
-- can_return_orders in migration 029.
alter table users add column if not exists alert_delivery_changes boolean not null default false;

comment on column users.alert_delivery_changes is
  'Gets a notification when DEQI moves a delivery date that was already '
  'promised. Deliberately per-person, not per-role.';

update users set alert_delivery_changes = true
 where full_name in ('Doani Pavan', 'Marcus');

-- Maira has no account yet. When she does:
--   update users set alert_delivery_changes = true where email = '<her email>';

-- The notification type is constrained, so a new one has to be admitted before
-- anything can raise it. Without this the insert below fails inside a trigger
-- that catches its own errors, and the alert disappears without a word.
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type = any (array['comment', 'status_change', 'assignment', 'mention',
                           'due_soon', 'delivery_change']));

create or replace function guard_delivery_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_name   text;
  v_reason text := nullif(btrim(coalesce(new.delivery_date_change_reason, '')), '');
begin
  if new.delivery_date is not distinct from old.delivery_date then
    return new;
  end if;

  -- First date: this is the promise. Nothing to warn about — it is the thing
  -- everyone was waiting for.
  if old.delivery_date is null then
    new.delivery_date_promised := new.delivery_date;
    new.delivery_date_changed_at := null;
    new.delivery_date_change_reason := null;
    return new;
  end if;

  -- Clearing a committed date is not a correction, it is losing the promise.
  if new.delivery_date is null then
    raise exception 'The delivery date is already committed — replace it with a new date rather than clearing it';
  end if;

  -- A date that moves without a reason sends Redantex back to the client with
  -- nothing to say. Same rule the proforma rejection already follows.
  if v_reason is null then
    raise exception 'Changing a committed delivery date needs a reason — say what happened';
  end if;

  new.delivery_date_changed_at := now();
  new.delivery_date_change_reason := v_reason;

  select full_name into v_name from users where id = v_actor;

  insert into notifications (user_id, card_id, actor_id, type, message)
  select u.id, new.id, v_actor, 'delivery_change',
         coalesce(v_name, 'DEQI') || ' moved the delivery date of "'
           || coalesce(new.title, 'an order') || '" from '
           || to_char(old.delivery_date, 'DD Mon') || ' to '
           || to_char(new.delivery_date, 'DD Mon')
           || ' — ' || v_reason
    from users u
   where u.alert_delivery_changes
     and (v_actor is null or u.id <> v_actor);

  insert into activity_logs (card_id, user_id, action, old_value, new_value)
  values (new.id, v_actor, 'delivery_date_changed',
          old.delivery_date::text, new.delivery_date::text || ' — ' || v_reason);

  return new;
end;
$$;

drop trigger if exists cards_guard_delivery_date on cards;
create trigger cards_guard_delivery_date
  before update on cards
  for each row execute function guard_delivery_date();

-- The RPC is how DEQI writes these two fields — `viewer` cannot update cards
-- directly. It gains the reason so the trigger above has something to read.
--
-- The old three-argument version has to be dropped by hand first. `create or
-- replace` matches on the argument list, so adding a parameter creates a second
-- function beside the first rather than replacing it — and PostgREST then
-- refuses every call with "Could not choose the best candidate function",
-- which took saving a card down in production until this line existed.
drop function if exists set_order_delivery_info(uuid, text, date);

create or replace function set_order_delivery_info(
  p_card_id       uuid,
  p_pi_number     text,
  p_delivery_date date,
  p_change_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from cards c where c.id = p_card_id and c.board = 'orders') then
    raise exception 'Delivery info can only be set on an order card';
  end if;

  update cards
     set pi_number = nullif(btrim(coalesce(p_pi_number, '')), ''),
         delivery_date = p_delivery_date,
         delivery_date_change_reason = p_change_reason,
         updated_at = now()
   where id = p_card_id;
end;
$$;
