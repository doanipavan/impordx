-- The delivery clock starts at the sample, not at the proforma.
--
-- Redantex promises the client in monthly batches: a sample approved by the
-- 10th delivers 120 days after that 10th, and everything in one batch lands on
-- the same day. Approving on the 11th does not cost a day — it costs the batch,
-- because the piece falls into next month's cut-off, some thirty days later.
--
-- order_confirmed_at, stamped at PI Approved, stays as the fallback: a quote
-- confirmed and promoted straight to Orders never was a sample and has no
-- approval to anchor on.

alter table cards add column if not exists sample_approved_at date;

comment on column cards.sample_approved_at is
  'The day the sample was approved, on the São Paulo calendar. Anchors the '
  '120-day delivery promise through the monthly cut-off on the 10th. Set once '
  'and carried through promotion to Orders.';

create or replace function stamp_sample_approved()
returns trigger
language plpgsql
as $$
begin
  -- Only the samples board reaches 'Approved': quotes end at 'Confirmed' and
  -- orders have no such status, so no other board can trip this.
  if new.board = 'samples' and new.status = 'Approved'
     and new.sample_approved_at is null
     and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'Approved') then
    new.sample_approved_at := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_sample_approved on cards;
create trigger trg_stamp_sample_approved
  before insert or update on cards
  for each row execute function stamp_sample_approved();

-- Backfill from the history. A card promoted to Orders has already left the
-- samples board, so the activity log is the only place its approval still
-- exists. Cards that never logged the move keep a null and fall back.
update cards c
   set sample_approved_at = s.approved_on
  from (
    select a.card_id,
           min((a.created_at at time zone 'America/Sao_Paulo')::date) as approved_on
      from activity_logs a
     where a.action = 'moved' and a.new_value = 'Approved'
     group by a.card_id
  ) s
 where s.card_id = c.id
   and c.sample_approved_at is null;

-- The cut-off a promise is measured from: the 10th of the approval month, or
-- the 10th of the next one if the 10th has already passed.
--
-- Deliberately a function and not a stored generated column. The lead time has
-- already moved once — it was 130 days before it was 120 — and a stored value
-- would keep answering with the old rule long after the rule changed.
create or replace function sample_batch_cutoff(approved date)
returns date
language sql
immutable
as $$
  select case
    when approved is null then null
    when extract(day from approved) <= 10
      then make_date(extract(year from approved)::int,
                     extract(month from approved)::int, 10)
    else (make_date(extract(year from approved)::int,
                    extract(month from approved)::int, 10) + interval '1 month')::date
  end
$$;

comment on function sample_batch_cutoff(date) is
  'The monthly cut-off a sample approval falls into. Delivery is this date plus '
  'the lead time, which lives in the client so one edit changes both sides.';
