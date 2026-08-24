-- Two business days per stage on the Samples board.
--
-- Weekends are excluded; holidays are NOT. Around Chinese New Year, when DEQI
-- closes for a week or more, this will report breaches nobody caused. Fixing it
-- needs a holiday list per side, since the calendar that applies depends on who
-- owns the stage. Deliberately deferred.

alter table cards add column if not exists status_since timestamptz;
alter table cards add column if not exists sla_notified_at timestamptz;

update cards c
   set status_since = coalesce(
         (select max(a.created_at) from activity_logs a
           where a.card_id = c.id and a.action = 'moved'),
         c.created_at)
 where status_since is null;

create or replace function stamp_status_since()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_since := now();
    new.sla_notified_at := null;  -- a new stage deserves a fresh warning
  end if;
  return new;
end;
$$;

drop trigger if exists cards_stamp_status_since on cards;
create trigger cards_stamp_status_since
  before update on cards
  for each row execute function stamp_status_since();

create or replace function business_days_since(since timestamptz)
returns int language sql stable as $$
  select coalesce((
    select count(*)::int
      from generate_series(
        (since at time zone 'America/Sao_Paulo')::date,
        (now() at time zone 'America/Sao_Paulo')::date - 1,
        interval '1 day') d
     where extract(isodow from d) < 6
  ), 0)
$$;

-- A breach is the passage of time, not a change, so no trigger can catch it.
-- pg_cron runs this on weekday mornings instead — inside the database, so it
-- needs none of the Netlify environment that is still unconfigured.
create or replace function notify_sla_breaches()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
begin
  with breached as (
    select c.id, c.title, c.status, c.project_manager_id, c.salesperson_id,
           business_days_since(c.status_since) as used
      from cards c
     where c.board = 'samples' and not c.archived
       and c.status in ('Requested','In Preparation','Under RDX Revision','Under DEQI Revision')
       and c.sla_notified_at is null
       and business_days_since(c.status_since) > 2
  ),
  targets as (
    -- Whoever owns the stage hears about it.
    select b.id as card_id, b.title, b.status, b.used, u.id as user_id
      from breached b
      join users u on (
        case
          when b.status in ('In Preparation','Under DEQI Revision') then u.role = 'viewer'
          else u.id in (b.project_manager_id, b.salesperson_id)
        end
      )
  ),
  inserted as (
    insert into notifications (user_id, card_id, actor_id, type, message)
    select t.user_id, t.card_id, null, 'due_soon',
           'SLA passed on "' || t.title || '" — ' || t.used || ' business days in ' || t.status
      from targets t
    returning card_id
  )
  select count(distinct card_id) into v_count from inserted;

  -- Stamped so a breach is announced once, not every morning until it moves.
  update cards set sla_notified_at = now()
   where board = 'samples' and not archived
     and sla_notified_at is null
     and status in ('Requested','In Preparation','Under RDX Revision','Under DEQI Revision')
     and business_days_since(status_since) > 2;

  return v_count;
end;
$$;

create extension if not exists pg_cron;

-- 12:00 UTC — 09:00 in São Paulo, weekdays only.
select cron.schedule('sla-samples', '0 12 * * 1-5', $$select notify_sla_breaches()$$);
