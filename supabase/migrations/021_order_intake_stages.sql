-- Five stages before Placed: two inside Redantex, three with DEQI.
--
--   Purchasing → Commercial → PI Requested → PI In Preparation → PI Approved
--   → Placed → In Production → Ready to Ship → Shipped
--
-- "PI In Preparation" and "PI Approved" carry the prefix because Samples
-- already owns "In Preparation" and "Approved"; without it a notification
-- reading "moved to Approved" would not say whether that was artwork or a
-- proforma invoice.

alter table cards drop constraint if exists valid_status;

alter table cards add constraint valid_status check (
  (board = 'quotes'  and status in ('Requested','Quoted','Confirmed','Declined')) or
  (board = 'samples' and status in ('Requested','In Preparation','Under RDX Revision',
                                    'Under DEQI Revision','Approved','Lost')) or
  (board = 'orders'  and status in ('Purchasing','Commercial','PI Requested',
                                    'PI In Preparation','PI Approved','Placed',
                                    'In Production','Ready to Ship','Shipped'))
);

-- The sale value in BRL. Hidden from DEQI in the interface only — the cards
-- table is readable in full by any authenticated user, so this is presentation,
-- not protection. Moving it to its own table is the real fix, deferred.
alter table cards add column if not exists value_brl numeric(14,2);

comment on column cards.value_brl is
  'Sale value in BRL. UI hides it from viewers; RLS does NOT. Not yet protected.';

-- =====================================================================
-- The 60-day clock starts when the PI is approved
-- =====================================================================
-- It used to start when a card reached the Orders board. With five stages in
-- front of Placed, that burned DEQI's window on Redantex's own paperwork.
-- Approving the PI is the commercial commitment, so that is the mark.

create or replace function stamp_order_confirmed()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'PI Approved' and coalesce(old.status, '') <> 'PI Approved'
     and new.order_confirmed_at is null then
    new.order_confirmed_at := (now() at time zone 'America/Sao_Paulo')::date;

  -- Safety net: a card dragged straight past PI Approved would otherwise carry
  -- no clock at all and vanish from the timeline.
  elsif new.status in ('Placed','In Production','Ready to Ship','Shipped')
     and new.order_confirmed_at is null then
    new.order_confirmed_at := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists cards_stamp_order_confirmed on cards;
create trigger cards_stamp_order_confirmed
  before update on cards
  for each row execute function stamp_order_confirmed();

-- =====================================================================
-- The Purchasing gate
-- =====================================================================
-- Enforced here rather than in the form: the form is a suggestion, this is the
-- rule. Note it passes an order with no items at all — "every item has a code"
-- is vacuously true of nothing.

create or replace function enforce_purchasing_gate()
returns trigger
language plpgsql
as $$
declare
  v_missing int;
begin
  if new.board = 'orders' and old.status = 'Purchasing' and new.status <> 'Purchasing' then
    if coalesce(btrim(new.purchase_order), '') = '' then
      raise exception 'Purchase order number is required before leaving Purchasing';
    end if;

    select count(*) into v_missing
      from card_items ci
     where ci.card_id = new.id and coalesce(btrim(ci.erp_code), '') = '';

    if v_missing > 0 then
      raise exception 'Every item needs an ERP (DEV) code — % still without one', v_missing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists cards_purchasing_gate on cards;
create trigger cards_purchasing_gate
  before update on cards
  for each row execute function enforce_purchasing_gate();
